"""Build the public CCBABY LINE menu artwork with Pillow; no runtime dependency."""

import json
import math
import re
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "line-official"
CONFIG = json.loads((OUT / "copy.json").read_text())
SITE_CSS = (ROOT / "apps/customer-web/style.css").read_text()
THEME = dict(re.findall(r"--([a-z]+):\s*(#[0-9a-fA-F]{6})", SITE_CSS))
SCALE = 2
W, H = CONFIG["menu"]["width"], CONFIG["menu"]["height"]
PAPER, GREEN, INK, GOLD, MUTED = (THEME[k] for k in ("paper", "green", "ink", "gold", "muted"))
image = Image.new("RGB", (W * SCALE, H * SCALE), THEME["bg"])
draw = ImageDraw.Draw(image)


def font(size, family="sans"):
    if family == "brand":
        path, index = "/System/Library/Fonts/Supplemental/Georgia.ttf", 0
    elif family == "title":
        path, index = "/System/Library/Fonts/Supplemental/Songti.ttc", 7
    else:
        path, index = "/System/Library/Fonts/STHeiti Light.ttc", 0
    return ImageFont.truetype(path, int(size * SCALE), index=index)


def line(points, color, width=5, rounded=False):
    points = [(round(x * SCALE), round(y * SCALE)) for x, y in points]
    stroke = round(width * SCALE)
    draw.line(points, fill=color, width=stroke, joint="curve")
    if rounded:
        for x, y in points:
            r = stroke / 2
            draw.ellipse((x - r, y - r, x + r, y + r), fill=color)


def text_center(text, x, y, size, color, family="sans", tracking=0):
    face = font(size, family)
    width = draw.textlength(text, font=face) + tracking * SCALE * (len(text) - 1)
    cursor = x * SCALE - width / 2
    for char in text:
        if char == "・":
            # Heiti TC lacks this separator; draw the site's dot without a missing-glyph box.
            center_x = cursor + draw.textlength(char, font=face) / 2
            center_y, radius = (y + size * 0.48) * SCALE, size * 0.05 * SCALE
            draw.ellipse((center_x - radius, center_y - radius,
                          center_x + radius, center_y + radius), fill=color)
        else:
            draw.text((cursor, y * SCALE), char, fill=color, font=face, anchor="lt")
        cursor += draw.textlength(char, font=face) + tracking * SCALE


def icon(kind, cx, cy, color, unit=7):
    def p(x, y):
        return (cx + (x - 12) * unit, cy + (y - 12) * unit)

    def stroke(points):
        line([p(x, y) for x, y in points], color, 1.6 * unit, rounded=True)

    if kind == "order":
        # Exact list icon geometry from apps/customer-web/app.js.
        stroke([(8, 3), (16, 3), (20, 7), (20, 21), (4, 21), (4, 3), (8, 3)])
        stroke([(8, 11), (16, 11)])
        stroke([(8, 15), (16, 15)])
        stroke([(8, 7), (11, 7)])
    elif kind == "shop":
        stroke([(5, 7), (19, 7), (20, 21), (4, 21), (5, 7)])
        points = [(9, 8), (9, 6)] + [
            (12 + 3 * math.cos(math.pi + t * math.pi / 24),
             6 + 3 * math.sin(math.pi + t * math.pi / 24)) for t in range(25)
        ] + [(15, 8)]
        stroke(points)
    else:
        # Existing box icon from the site's service strip.
        stroke([(12, 2), (21, 7), (21, 17), (12, 22), (3, 17), (3, 7), (12, 2)])
        stroke([(3, 7), (12, 12), (21, 7)])
        stroke([(12, 12), (12, 22)])
        stroke([(7.5, 4.5), (16.5, 9.5)])


# Match the site's .brand mark, Georgia wordmark and subtitle.
draw.rectangle((0, 0, W * SCALE, 180 * SCALE), fill=PAPER)
line([(0, 180), (W, 180)], THEME["line"], 2)
mark_x, mark_y, mark_w, mark_h = 952, 30, 104, 120
draw.rounded_rectangle(
    (mark_x * SCALE, mark_y * SCALE, (mark_x + mark_w) * SCALE, (mark_y + mark_h) * SCALE),
    radius=46 * SCALE, outline=GREEN, width=3 * SCALE,
)
# The site mark has arched upper corners and almost square lower corners.
draw.rectangle(((mark_x - 1) * SCALE, (mark_y + 62) * SCALE,
                (mark_x + mark_w + 1) * SCALE, (mark_y + mark_h + 1) * SCALE), fill=PAPER)
line([(mark_x, mark_y + 60), (mark_x, mark_y + mark_h),
      (mark_x + mark_w, mark_y + mark_h), (mark_x + mark_w, mark_y + 60)], GREEN, 3)
icon("shop", mark_x + mark_w / 2, mark_y + 63, GREEN, unit=3.2)
text_center("CCBABY", 1335, 34, 86, INK, family="brand", tracking=11)
text_center("韓國・日常選物", 1335, 127, 33, MUTED, tracking=10)

items = [
    (416.5, "order", "我的訂單", "查看明細與進度"),
    (1250, "shop", "看商品", "挑選本期韓國好物"),
    (2083.5, "guide", "預購說明", "到台後通知付款"),
]
for cx, kind, label, subtitle in items:
    bounds = ((cx - 378) * SCALE, 214 * SCALE, (cx + 378) * SCALE, 807 * SCALE)
    fill = "#eaece2" if kind == "shop" else PAPER
    draw.rounded_rectangle(bounds, radius=25 * SCALE, fill=fill, outline=THEME["line"], width=2 * SCALE)
    if kind == "shop":
        arc = Image.new("RGB", image.size, fill)
        arc_draw = ImageDraw.Draw(arc)
        arc_draw.ellipse(((cx + 114) * SCALE, 116 * SCALE, (cx + 590) * SCALE, 592 * SCALE),
                         outline="#d6ddcd", width=2 * SCALE)
        mask = Image.new("L", image.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle(bounds, radius=25 * SCALE, fill=255)
        image.paste(arc, (0, 0), mask)
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle(bounds, radius=25 * SCALE, outline=THEME["line"], width=2 * SCALE)
    icon(kind, cx, 346, GREEN)
    text_center(label, cx, 475, 102, INK, family="title", tracking=7)
    text_center(subtitle, cx, 617, 49, MUTED, tracking=1.5)
    # Same arrow geometry and round caps as the site's action links.
    line([(cx - 41, 740), (cx + 34, 740)], GREEN, 5, rounded=True)
    line([(cx + 4, 710), (cx + 34, 740), (cx + 4, 770)], GREEN, 5, rounded=True)

image = image.resize((W, H), Image.Resampling.LANCZOS)
OUT.mkdir(parents=True, exist_ok=True)
target = OUT / "rich-menu-2500x843.png"
image.save(target, optimize=True)
image.resize((1200, 405), Image.Resampling.LANCZOS).save(OUT / "rich-menu-preview.png", optimize=True)
image.resize((390, 132), Image.Resampling.LANCZOS).save(OUT / "rich-menu-mobile-preview.png", optimize=True)
with zipfile.ZipFile(OUT / "ccbaby-line-menu-upload.zip", "w", zipfile.ZIP_DEFLATED) as package:
    package.write(target, arcname="CCBABY-LINE-2500x843.png")
assert image.size == (2500, 843)
assert Image.open(OUT / "rich-menu-preview.png").size == (1200, 405)
assert target.stat().st_size < 1_000_000
print(f"LINE menu: {W}x{H}, {target.stat().st_size:,} bytes")
