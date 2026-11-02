# -*- coding: utf-8 -*-
"""生成小程序端知识库数据模块。

读取 rag/knowledge_base.json，精简为小程序可 require 的纯数据模块
（miniprogram/utils/kb-data.js）。sources 只保留 title+type，去掉 URL/covers，
控制包体积（约 20KB）。

用法：python tools/gen-kb-data.py
数据源变更后重跑本脚本即可。
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "rag", "knowledge_base.json")
DST = os.path.join(ROOT, "miniprogram", "utils", "kb-data.js")

def main():
    with open(SRC, encoding="utf-8") as f:
        kb = json.load(f)

    chunks = []
    for c in kb["chunks"]:
        chunks.append({
            "id": c["id"],
            "articleId": c["articleId"],
            "articleTitle": c["articleTitle"],
            "sectionTitle": c["sectionTitle"],
            "text": c["text"],
            "regions": c.get("regions", ["general"]),
            "needVerify": bool(c.get("needVerify", False)),
            "tags": c.get("tags", []),
            "sources": [
                {"title": s.get("title", ""), "type": s.get("type", "")}
                for s in c.get("sources", [])
            ],
        })

    payload = {
        "version": kb.get("version", 2),
        "generatedFrom": "rag/knowledge_base.json",
        "note": "由 tools/gen-kb-data.py 生成，勿手改。数据源更新后重跑脚本。",
        "stats": {"chunks": len(chunks), "chars": sum(len(c["text"]) for c in chunks)},
        "chunks": chunks,
    }

    js = (
        "// kb-data.js —— 知识库数据（自动生成，勿手改）\n"
        "// 由 tools/gen-kb-data.py 从 rag/knowledge_base.json 转换而来\n"
        "// 数据结构：{ id, articleId, articleTitle, sectionTitle, text, regions,\n"
        "//             needVerify, tags, sources: [{title, type}] }\n"
        "module.exports = " + json.dumps(payload, ensure_ascii=False, indent=1) + ";\n"
    )

    with open(DST, "w", encoding="utf-8") as f:
        f.write(js)

    kb_size = os.path.getsize(SRC)
    dst_size = os.path.getsize(DST)
    print("chunks:", len(chunks))
    print("源文件: %.1f KB -> %s: %.1f KB (节省 %.0f%%)" % (
        kb_size / 1024, os.path.basename(DST), dst_size / 1024,
        (1 - dst_size / kb_size) * 100))

if __name__ == "__main__":
    sys.exit(main())
