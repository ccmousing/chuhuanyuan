# -*- coding: utf-8 -*-
"""把 rag/field-notes.json（项目组田野整理）并入知识库。

设计：
  · 幂等 —— 每次先移除 origin == "field-notes" 的旧 chunk，再整体写入，
    所以 field-notes.json 更新后直接重跑即可，不会产生重复。
  · 只动知识库数据，不改 content.js（文章正文是另一套东西）。
  · 合并后自动重算 stats，并校验 id 唯一。

用法：
  python tools/merge-field-notes.py
  python tools/gen-kb-data.py      # 再生成小程序端 kb-data.js
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "rag", "field-notes.json")
KB = os.path.join(ROOT, "rag", "knowledge_base.json")
ORIGIN = "field-notes"

# 允许的 articleId —— 必须与 miniprogram/utils/content.js 里的文章 id 一致，
# 否则问答页的来源胶囊会跳到「文章不存在」。
ALLOWED_ARTICLES = {
    "what-is", "why-clogs", "twelve-flowers",
    "head-dish", "gongpopo", "three-cities",
}
ALLOWED_REGIONS = {"general", "shantou", "chaozhou", "jieyang", "overseas"}


def main():
    with open(SRC, encoding="utf-8") as f:
        fn = json.load(f)
    with open(KB, encoding="utf-8") as f:
        kb = json.load(f)

    new_chunks = []
    for c in fn["chunks"]:
        c = dict(c)
        c["origin"] = ORIGIN
        c["chars"] = len(c["text"])
        c["sourceCount"] = len(c.get("sources", []))

        # —— 校验：任何一条不合格就整体中止，不写半成品 ——
        if c["articleId"] not in ALLOWED_ARTICLES:
            print("✗ 未知 articleId：%s（%s）" % (c["articleId"], c["id"]))
            return 1
        bad = [r for r in c.get("regions", []) if r not in ALLOWED_REGIONS]
        if bad:
            print("✗ 非法 regions：%s（%s）" % (bad, c["id"]))
            return 1
        if not c.get("sources"):
            print("✗ 缺 sources（%s）——知识库不接受无来源条目" % c["id"])
            return 1
        if c["chars"] > 400:
            print("⚠ %s 偏长（%d 字），检索时可能稀释权重" % (c["id"], c["chars"]))
        new_chunks.append(c)

    before = len(kb["chunks"])
    kb["chunks"] = [c for c in kb["chunks"] if c.get("origin") != ORIGIN]
    removed = before - len(kb["chunks"])
    kb["chunks"].extend(new_chunks)

    ids = [c["id"] for c in kb["chunks"]]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        print("✗ chunk id 重复：%s" % dup)
        return 1

    arts = {c["articleId"] for c in kb["chunks"]}
    kb["stats"] = {
        "articles": len(arts),
        "chunks": len(kb["chunks"]),
        "sources": sum(len(c.get("sources", [])) for c in kb["chunks"]),
        "needVerify": sum(1 for c in kb["chunks"] if c.get("needVerify")),
        "noSource": sum(1 for c in kb["chunks"] if not c.get("sources")),
    }
    kb["generatedFrom"] = "miniprogram/utils/content.js + rag/field-notes.json"

    with open(KB, "w", encoding="utf-8") as f:
        json.dump(kb, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print("移除旧的 field-notes chunk：%d 条" % removed)
    print("写入新的 field-notes chunk：%d 条（%.0f 字）" % (
        len(new_chunks), sum(c["chars"] for c in new_chunks)))
    print("知识库现状：%d chunks / %d 篇 / %.0f 字" % (
        kb["stats"]["chunks"], kb["stats"]["articles"],
        sum(c["chars"] for c in kb["chunks"])))
    print("下一步：python tools/gen-kb-data.py")


if __name__ == "__main__":
    sys.exit(main())
