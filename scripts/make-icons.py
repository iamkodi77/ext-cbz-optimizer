#!/usr/bin/env python3
"""Generate PanelForge extension icons (green rounded square + manga panels).

Usage: python3 scripts/make-icons.py   (requires Pillow)
"""
from pathlib import Path

from PIL import Image, ImageDraw

GREEN = (33, 92, 70, 255)
CREAM = (244, 241, 232, 255)
ORANGE = (239, 127, 77, 255)
WHITE = (255, 255, 255, 255)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"


def rounded(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def make_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size
    # Background tile
    rounded(d, [0, 0, s - 1, s - 1], int(s * 0.22), GREEN)
    # Manga page (cream) with a slight tilt feel via inset panels
    m = int(s * 0.16)  # margin
    page = [m, m, s - m, s - m]
    rounded(d, page, int(s * 0.08), CREAM)
    # Panels: two stacked left, one tall right (manga reading order)
    pw = (page[2] - page[0]) - int(s * 0.18)
    ph = (page[3] - page[1]) - int(s * 0.18)
    gap = int(s * 0.07)
    x0 = page[0] + int(s * 0.09)
    y0 = page[1] + int(s * 0.09)
    left_w = int(pw * 0.52)
    right_w = pw - left_w - gap
    top_h = int(ph * 0.48)
    bot_h = ph - top_h - gap
    rounded(d, [x0, y0, x0 + left_w, y0 + top_h], int(s * 0.04), GREEN)
    rounded(d, [x0, y0 + top_h + gap, x0 + left_w, y0 + top_h + gap + bot_h], int(s * 0.04), GREEN)
    rounded(d, [x0 + left_w + gap, y0, x0 + left_w + gap + right_w, y0 + ph], int(s * 0.04), ORANGE)
    return img


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for size in (16, 32, 48, 128):
        make_icon(size).save(OUT / f"icon{size}.png")
        print(f"wrote icons/icon{size}.png")


if __name__ == "__main__":
    main()
