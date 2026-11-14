"""Regenerate the Open Graph set in the lotería style (2026-11-14 reskin).

Cream paper ground, giant bold ink headline with the key phrase on a black
highlight bar (the @hoopers_stats reel language), one lotería card per image
(number badge, data art, coloured name banner, hard offset shadow), footer
with the site name. PIL + Noto Sans only — no new dependencies, no webfonts.

Only verified facts appear on the images: 12,966 NBA player-seasons,
1996-2026, and the Wemby -> Hakeem twin (distance 3.86, the reel's #1).
The old 9:16 carried unverified claims ("48-d cosine 91.2%", "Recall@10
0.977") — those are gone.

    python scripts/build_og_loteria.py            # write assets/og-*.png
    python scripts/build_og_loteria.py --check    # verify sizes + report

Outputs (root assets/; mirror to public/ byte-identical, see the brief):
    assets/og-1200x630.png    1200x630   link preview
    assets/og-1080x1920.png   1080x1920  9:16 reel / story cover
    assets/og-embed.png       1200x630   embed variant (plain headline)
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

PAPER = (252, 251, 247)     # --board #FCFBF7
INK = (35, 35, 35)          # --ink #232323
INK2 = (87, 87, 79)         # --fg-2 #57574F
RED = (193, 39, 45)         # --loteria-red #C1272D
MARIGOLD = (232, 163, 23)   # --loteria-marigold #E8A317
GREEN = (28, 115, 49)       # --loteria-green #1C7331
BLUE = (43, 108, 229)       # --loteria-blue #2B6CE5

FONT_DIR = Path("/usr/share/fonts/truetype/noto")
BOLD = str(FONT_DIR / "NotoSans-Bold.ttf")
REGULAR = str(FONT_DIR / "NotoSans-Regular.ttf")
MONO = str(FONT_DIR / "NotoSansMono-Regular.ttf")


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def text_w(draw: ImageDraw.ImageDraw, s: str, f: ImageFont.FreeTypeFont) -> int:
    return draw.textbbox((0, 0), s, font=f)[2]


def text_h(draw: ImageDraw.ImageDraw, s: str, f: ImageFont.FreeTypeFont) -> int:
    box = draw.textbbox((0, 0), s, font=f)
    return box[3] - box[1]


def centered(draw: ImageDraw.ImageDraw, cx: int, y: int, s: str,
             f: ImageFont.FreeTypeFont, fill) -> None:
    draw.text((cx - text_w(draw, s, f) // 2, y), s, font=f, fill=fill)


def line_h(f: ImageFont.FreeTypeFont) -> int:
    """Full line advance (ascent + descent). textbbox gives the ink box,
    which is shorter — advancing by it stacks lines on top of each other."""
    ascent, descent = f.getmetrics()
    return ascent + descent


def highlight_bar(draw: ImageDraw.ImageDraw, x: int, y: int, s: str,
                  f: ImageFont.FreeTypeFont, pad_x: int = 18, pad_y: int = 8) -> int:
    """Black highlight bar with cream text; returns the bar width."""
    w = text_w(draw, s, f) + 2 * pad_x
    h = line_h(f) + 2 * pad_y
    draw.rectangle([x, y, x + w, y + h], fill=INK)
    draw.text((x + pad_x, y + pad_y), s, font=f, fill=PAPER)
    return w


def loteria_card(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int,
                 number: int, banner: str, banner_bg, banner_fg,
                 art_lines: list[tuple[str, ImageFont.FreeTypeFont, tuple]],
                 badge: int = 44, banner_h: int = 64) -> None:
    """One lotería card: hard shadow, 3px ink frame, 1px hairline, number
    badge top-left, centred art lines, coloured name banner at the bottom."""
    draw.rectangle([x + 6, y + 6, x + w + 6, y + h + 6], fill=INK)
    draw.rectangle([x, y, x + w, y + h], fill=PAPER, outline=INK, width=3)
    draw.rectangle([x + 6, y + 6, x + w - 6, y + h - 6], outline=INK, width=1)
    # number badge: black square, cream mono numerals
    bx, by = x + 12, y + 12
    draw.rectangle([bx, by, bx + badge, by + badge], fill=INK)
    num = str(number)
    nf = font(MONO, int(badge * 0.52))
    draw.text((bx + (badge - text_w(draw, num, nf)) // 2,
               by + (badge - text_h(draw, num, nf)) // 2 - 1),
              num, font=nf, fill=PAPER)
    # art: centred lines in the space between badge and banner
    art_top = y + 12 + badge + 10
    art_bottom = y + h - banner_h
    total = sum(text_h(draw, s, f) for s, f, _ in art_lines) + 10 * (len(art_lines) - 1)
    cy = art_top + max(0, (art_bottom - art_top - total) // 2)
    for s, f, fill in art_lines:
        centered(draw, x + w // 2, cy, s, f, fill)
        cy += text_h(draw, s, f) + 10
    # name banner: full-width coloured band, 3px ink top rule
    draw.rectangle([x, y + h - banner_h, x + w, y + h], fill=banner_bg)
    draw.line([x, y + h - banner_h, x + w, y + h - banner_h], fill=INK, width=3)
    bf = font(BOLD, int(banner_h * 0.34))
    draw.text((x + w // 2 - text_w(draw, banner, bf) // 2,
               y + h - banner_h + (banner_h - text_h(draw, banner, bf)) // 2),
              banner, font=bf, fill=banner_fg)


def footer(draw: ImageDraw.ImageDraw, w: int, h: int, s: str, f) -> None:
    centered(draw, w // 2, h - 52, s, f, INK2)


def build_1200x630(bar: bool) -> Image.Image:
    """Link preview (bar=True) / embed variant (bar=False, plain headline)."""
    W, H = 1200, 630
    im = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(im)
    hf = font(BOLD, 74)
    mf = font(MONO, 22)
    # headline, left block
    x, y = 64, 118
    d.text((x, y), "Who plays", font=hf, fill=INK)
    y += line_h(hf) + 14
    d.text((x, y), "like", font=hf, fill=INK)
    y += line_h(hf) + 14
    if bar:
        highlight_bar(d, x, y, "this?", hf)
    else:
        d.text((x, y), "this?", font=hf, fill=INK)
    # lotería card, right side — Wemby's twin, Hakeem, distance 3.86
    loteria_card(d, 760, 88, 360, 440, 1, "HAKEEM OLAJUWON", RED, PAPER, [
        ("WEMBY'S TWIN", font(BOLD, 26), INK),
        ("DISTANCE 3.86", font(MONO, 30), INK),
        ("1993-94", font(MONO, 24), INK2),
    ])
    footer(d, W, H, "12,966 NBA player-seasons  ·  1996-2026  ·  hoops.dumbmodel.com", mf)
    return im


def build_1080x1920() -> Image.Image:
    """9:16 reel / story cover: giant headline, black bar on the key phrase,
    one lotería card, site footer."""
    W, H = 1080, 1920
    im = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(im)
    hf = font(BOLD, 148)
    mf = font(MONO, 30)
    sf = font(BOLD, 34)
    # headline, centred
    y = 130
    for line in ("WHO PLAYS", "LIKE"):
        centered(d, W // 2, y, line, hf, INK)
        y += line_h(hf) + 18
    bar_w = text_w(d, "THIS?", hf) + 36
    highlight_bar(d, (W - bar_w) // 2, y, "THIS?", hf, pad_x=18, pad_y=10)
    # lotería card, centred below the headline
    loteria_card(d, 230, 860, 620, 780, 1, "HAKEEM OLAJUWON '93-94", RED, PAPER, [
        ("WEMBY'S TWIN", font(BOLD, 40), INK),
        ("DISTANCE 3.86", font(MONO, 52), INK),
        ("14 era-adjusted stats", font(REGULAR, 30), INK2),
        ("nearest neighbour wins", font(REGULAR, 30), INK2),
    ], badge=72, banner_h=96)
    centered(d, W // 2, 1720, "hoops.dumbmodel.com", sf, INK)
    centered(d, W // 2, 1776, "12,966 player-seasons  ·  1996-2026", mf, INK2)
    return im


TARGETS = {
    "og-1200x630.png": (1200, 630),
    "og-1080x1920.png": (1080, 1920),
    "og-embed.png": (1200, 630),
}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Regenerate the lotería OG set.")
    ap.add_argument("--check", action="store_true",
                    help="verify sizes and report sha256 without writing")
    args = ap.parse_args(argv)
    jobs = [
        ("og-1200x630.png", lambda: build_1200x630(bar=True)),
        ("og-1080x1920.png", build_1080x1920),
        ("og-embed.png", lambda: build_1200x630(bar=False)),
    ]
    rc = 0
    for name, build in jobs:
        path = ASSETS / name
        want_w, want_h = TARGETS[name]
        if args.check:
            if not path.exists():
                print(f"MISSING {name}")
                rc = 1
                continue
            im = Image.open(path)
            ok = im.size == (want_w, want_h)
            print(f"{name}: {im.size[0]}x{im.size[1]} {'OK' if ok else 'WRONG SIZE'} "
                  f"sha256={hashlib.sha256(path.read_bytes()).hexdigest()[:12]}")
            rc = 0 if ok else 1
        else:
            im = build()
            im.save(path)
            print(f"wrote {path} {im.size[0]}x{im.size[1]} "
                  f"sha256={hashlib.sha256(path.read_bytes()).hexdigest()[:12]}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
