# -*- coding: utf-8 -*-
"""把仪式用品插画压成小程序用的六宫格小图。

用法：
    python tools/prep-symbols.py

处理：近白背景压成纯白（卡片本身是 #FFFFFF，图上无边界）
    → 居中裁方 → 200×200 → JPEG
输出：miniprogram/images/sym/<key>.jpg
"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "assets", "ai-gen-sym")
DST_DIR = os.path.join(ROOT, "miniprogram", "images", "sym")

MAPPING = {
    "Flat_vector_illustration_in_tr_2026-11-02T13-38-36.png": "clogs",
    "Flat_vector_illustration_in_tr_2026-11-02T13-39-05.png": "pomegranate",
    "Flat_vector_illustration_in_tr_2026-11-02T13-39-20.png": "flower-water",
    "Flat_vector_illustration_in_tr_2026-11-02T13-39-34.png": "rooster",
    "Flat_vector_illustration_in_tr_2026-11-02T13-39-48.png": "peach-cake",
    "Flat_vector_illustration_in_tr_2026-11-02T13-40-02.png": "waistband",
}

SIZE = 200
QUALITY = 85


def whiten(im, thr=232, sat=28):
    """把「够亮且接近中性色」的像素压成纯白，消除生成图的背景灰斑。"""
    a = np.array(im.convert("RGB")).astype(np.int16)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    mask = (mn > thr) & ((mx - mn) < sat)
    a[mask] = [255, 255, 255]
    return Image.fromarray(a.astype(np.uint8))


def main():
    os.makedirs(DST_DIR, exist_ok=True)
    total = 0.0
    for src_name, key in MAPPING.items():
        src = os.path.join(SRC_DIR, src_name)
        if not os.path.exists(src):
            print("缺文件: %s" % src_name)
            continue

        im = whiten(Image.open(src))
        w, h = im.size
        side = min(w, h)
        im = im.crop(((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2))
        im = im.resize((SIZE, SIZE), Image.LANCZOS)

        dst = os.path.join(DST_DIR, key + ".jpg")
        im.save(dst, "JPEG", quality=QUALITY, optimize=True)

        kb = os.path.getsize(dst) / 1024
        total += kb
        print("%-18s %6.1f KB" % (key + ".jpg", kb))

    print("-" * 28)
    print("合计 %.1f KB" % total)
    return 0


if __name__ == "__main__":
    sys.exit(main())
