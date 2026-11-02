#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
出花园民俗 · RAG 检索器（baseline：字二元组 + BM25）

为什么用字 bigram 而不是分词：
  中文分词要装 jieba 等依赖，而这个项目的第一目标是**先把链路跑通、拿到 baseline 数据**。
  字二元组（"出花园" → 出花/花园）不依赖任何词典，对中文短文档检索效果足够做 baseline，
  也方便之后和向量检索做对照 —— 这本身就是 rag-plan.html 里要求的"对照组"。

为什么用 BM25 而不是纯词频：
  BM25 有词频饱和 + 文档长度归一化，长文档不会仅因为字多就压倒性得分。
  实现只有十几行，没有第三方依赖。

地域加权（对应 rag-plan.html 图 2 的核心设计）：
  潮汕三地对同一问题常有不同答案。检索时若调用方给了 region，
  命中所给地域的 chunk 会加分 —— 把"内容有多个正确答案"的问题转成"检索问题"。
"""

import json
import math
import re
from pathlib import Path

KB_PATH = Path(__file__).with_name("knowledge_base.json")

# BM25 参数（业界常用值，未针对本数据集调优 —— 调优本身应是评估的一部分）
K1 = 1.5
B = 0.75

# 地域权重：命中调用方指定地域的 chunk，得分乘这个系数
REGION_BOOST = 1.35

# 单字回退词的权重折扣。1.0 表示不打折；0.55 是召回与精度的折中（未针对本数据集调优）
UNIGRAM_W = 0.55

# 低于该分数视为"没检索到"，上层应走拒答而不是硬答
DEFAULT_FLOOR = 1.0

# 查询实词在命中 chunk 中的最低覆盖率。低于此值说明主题不匹配，应拒答。
# 这是比"绝对分数"更可靠的信号 —— 小数据集里 BM25 的 idf 区分度不够，
# 功能词（是什/什么/怎么）就能把毫不相关的文档顶到高分。
MIN_COVER = 0.5

# 功能词表：查询与索引两侧统一过滤。
# ⚠️ 刻意**不**收 穿/吃/买/办/用/看/说 这类动词 —— 在民俗语境里它们是实词
#   （"出花园要穿什么鞋"里的"穿"就是关键词）。
STOP_MULTI = [
    "是什么", "为什么", "哪些", "哪个", "怎么", "怎样", "如何", "什么",
    "多少", "请问", "一下", "告诉", "想知道", "了解", "介绍", "区别", "不同", "一样",
    "应该", "需要", "可以", "是不是", "有没有"
]
STOP_CHAR = set("的了在是和与或及有就也不都还很吗呢吧啊这那之为以被把从到于而但却还又再可能会要很非常之乎者也其")


def bigrams(text):
    """中文按字二元组；同时保留英文/数字单词，避免 '15' 被切碎后失配。

    两步过滤（顺序不能反）：先删多字功能词，再逐字删单字功能词，最后才切二元组。
    否则"是什么"会被切成 是什/什么 两个 term，反而成为噪声词。
    """
    text = text.lower()
    latin = re.findall(r"[a-z0-9]+", text)
    text = re.sub(r"[a-z0-9]+", " ", text)
    for w in STOP_MULTI:
        text = text.replace(w, " ")
    out = []
    for seg in re.findall(r"[\u4e00-\u9fff]+", text):
        seg = "".join(ch for ch in seg if ch not in STOP_CHAR)
        if not seg:
            continue
        if len(seg) == 1:
            out.append(seg)
            continue
        out.extend(seg[i:i + 2] for i in range(len(seg) - 1))
        # 单字回退：bigram 粒度太粗，"穿鞋"这种组合在文档里没恰好出现就会完全失配，
        # 而"花园"这类全语料高频词 idf 极低却 tf 很高，反而会靠词频顶上高分（实测踩过）。
        # 单字加 "_" 前缀独立统计 df/idf，并在打分时打折，兼顾召回与精度。
        out.extend("_" + ch for ch in seg)
    out.extend(latin)
    return out


class Retriever:
    def __init__(self, kb_path=KB_PATH):
        kb = json.loads(Path(kb_path).read_text(encoding="utf-8"))
        self.chunks = kb["chunks"]
        self.stats = kb["stats"]

        # 建索引：每个 chunk 的词频表 + 长度
        self.tf = []          # [{term: freq}, ...]
        self.len = []         # [chunk 长度（term 数）]
        self.df = {}          # {term: 出现在多少个 chunk 中}
        for c in self.chunks:
            terms = bigrams(c["text"])
            f = {}
            for t in terms:
                f[t] = f.get(t, 0) + 1
            self.tf.append(f)
            self.len.append(len(terms))
            for t in f:
                self.df[t] = self.df.get(t, 0) + 1

        self.avg_len = sum(self.len) / len(self.len) if self.len else 0
        self.n = len(self.chunks)

    def _idf(self, term):
        df = self.df.get(term, 0)
        if df == 0:
            return 0.0
        # 标准 BM25 idf（+1 避免负值）
        return math.log(1 + (self.n - df + 0.5) / (df + 0.5))

    def search(self, query, top_k=3, region=None, floor=DEFAULT_FLOOR):
        """
        检索最相关的 chunk。

        :param region: 调用方地域（shantou / chaozhou / jieyang / overseas / None）。
                       命中该地域的 chunk 得分 × REGION_BOOST。
        :return: (hits, reached) —— hits 为 [{chunk, score}]，reached 表示是否有命中超过 floor。
        """
        q_terms = bigrams(query)
        if not q_terms:
            return [], False

        q_freq = {}
        for t in q_terms:
            q_freq[t] = q_freq.get(t, 0) + 1

        scores = []
        for i, chunk in enumerate(self.chunks):
            s = 0.0
            f = self.tf[i]
            dl = self.len[i] or 1
            for t, qf in q_freq.items():
                if t not in f:
                    continue
                # 单字回退词权重打折，避免"学""理"这类泛用单字把噪声文档顶上来
                w = UNIGRAM_W if t.startswith("_") else 1.0
                idf = self._idf(t)
                tf = f[t]
                denom = tf + K1 * (1 - B + B * dl / (self.avg_len or 1))
                s += w * idf * (tf * (K1 + 1)) / denom * qf

            if s > 0 and region and region in chunk.get("regions", []):
                s *= REGION_BOOST

            if s > 0:
                scores.append((s, i))

        scores.sort(key=lambda x: -x[0])
        hits = []

        # 覆盖率兜底：查询实词里有多大比例出现在该 chunk 中。
        # 单独靠分数不够 —— 功能词能把毫不相关的文档顶到高分（实测踩过）。
        q_set = set(q_terms)
        reached = False
        for s, i in scores[:top_k]:
            top_terms = set(self.tf[i].keys())
            cover = len(q_set & top_terms) / len(q_set) if q_set else 0
            hits.append({"chunk": self.chunks[i], "score": round(s, 4), "cover": round(cover, 2)})
        if hits:
            reached = hits[0]["score"] > floor and hits[0]["cover"] >= MIN_COVER
        return hits, reached


if __name__ == "__main__":
    r = Retriever()
    print("知识库：%d chunks / %d 篇 / 平均 %d terms" % (r.n, r.stats["articles"], int(r.avg_len)))
    print()

    cases = [
        ("出花园要穿什么鞋？", None),
        ("十二花水有哪些花？", None),
        ("咬鸡头是什么寓意？", None),
        ("潮州和揭阳的出花园有什么不同？", None),
        ("孩子几岁出花园？", None),
        ("公婆母是谁？", None),
        ("出花园要买什么食材？", None),
        ("为什么要拜公婆母？", None),
        ("量子力学的基本原理是什么？", None),   # 超纲题：应低分 → 拒答
        ("出花园汕头怎么办？", "shantou"),
    ]
    for q, reg in cases:
        hits, reached = r.search(q, top_k=2, region=reg)
        tag = ("[%s]" % reg) if reg else ""
        print("Q：%s%s" % (q, tag))
        if not hits:
            print("   （无命中）")
        for h in hits:
            c = h["chunk"]
            print("   %.4f  cover=%.2f  %-22s %s" % (h["score"], h.get("cover", 0), c["id"], c["sectionTitle"]))
        print("   超过阈值：%s" % ("是" if reached else "否 → 应拒答"))
        print()
