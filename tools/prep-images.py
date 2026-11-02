# -*- coding: utf-8 -*-
"""把 assets/ai-gen 下的大图压缩成小程序用的缩略图。

用法（需先装 pillow）：
    python tools/prep-images.py

输出：miniprogram/images/<文章id>.jpg
    208×208 / JPEG q82 / progressive，单张目标 ≤30 KB
"""
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "assets", "ai-gen")
DST_DIR = os.path.join(ROOT, "miniprogram", "images")

# 源文件名 → 文章 id（决定输出文件名，必须与 content.js 的 id 一致）
MAPPING = {
    "Flat_vector_illustration_in_tr_2026-11-02T13-33-24.png": "why-clogs",
    "Flat_vector_illustration_in_tr_2026-11-02T13-34-01.png": "what-is",
    "Flat_vector_illustration_in_tr_2026-11-02T13-34-17.png": "twelve-flowers",
    "Flat_vector_illustration_in_tr_2026-11-02T13-34-32.png": "head-dish",
    "Flat_vector_illustration_in_tr_2026-11-02T13-34-47.png": "gongpopo",
    "Flat_vector_illustration_in_tr_2026-11-02T13-35-02.png": "three-cities",
}

SIZE = 208
QUALITY = 82


def main():
    os.makedirs(DST_DIR, exist_ok=True)
    total = 0.0
    for src_name, article_id in MAPPING.items():
        src = os.path.join(SRC_DIR, src_name)
        if not os.path.exists(src):
            print("缺文件: %s" % src_name)
            continue

        im = Image.open(src).convert("RGB")
        # 居中裁成正方形，避免非 1:1 原图被拉伸
        w, h = im.size
        side = min(w, h)
        im = im.crop(((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2))
        im = im.resize((SIZE, SIZE), Image.LANCZOS)

        dst = os.path.join(DST_DIR, article_id + ".jpg")
        im.save(dst, "JPEG", quality=QUALITY, optimize=True, progressive=True)

        kb = os.path.getsize(dst) / 1024
        total += kb
        print("%-20s %6.1f KB" % (article_id + ".jpg", kb))

    print("-" * 30)
    print("合计 %.1f KB（限额 200 KB）" % total)
    return 0


if __name__ == "__main__":
    sys.exit(main())
