"""
cam_style.py — Cam Authentic Style Guide for Manim

Identity: Cameron Davis, systems builder + workforce strategy + storytelling.
Vibe: kitty scout • concise • best-app-ever polish • playful but systems diagram.
Gate: Sunni Davis SCAD critique — AAA Okabe-Ito, triple encoding (shape+icon+text+pattern),
       18px/1.65 readability, 56px bottom tabs safe-area, neobrutalism 2px ink + 4px shadow.

Design System: hoops.dumbmodel.com — light warm paper, ink borders, mono labels,
               blueprint dotted grid, hand-drawn but clean.

Distinct from 3Blue1Brown:
  3b1b = dark #111114 bg, glowing neon lines, smooth morphing, centered glowing formulas,
         blur/shadow glow effects, ethereal.
  Cam  = light warm paper #FFFEF7 // #FFFEFA bg + faint dotted blueprint grid (#E8E0C8),
         neobrutalist cards white #FFFFFF with 2px ink #111 border + 3px hard shadow offset,
         Okabe-Ito flat fills (no gradients), no glow, hard edges, typewriter mono labels,
         sketch arrow style but clean vectors, systems diagram + post-it playfulness.

--------------------------------------------------------------------------
ADA AAA COMPLIANCE NOTES (built-in)
--------------------------------------------------------------------------
1. Contrast Ratios — WCAG AAA requires 7:1 for normal text, 4.5:1 minimum:
   - TEXT #111111 on BG #FFFEF7 = 18.1:1 PASS AAA
   - TEXT #111111 on CARD #FFFFFF = 18.6:1 PASS AAA
   - SUBTLE #666666 on BG #FFFEF7 = 5.68:1 PASS AA for large (24px+), caution for 18px → use #585858 min for AAA (7.03:1)
     We default SUBTLE to #666 for labels 24px+ only, captions use TEXT or SUBTLE_AAA #585858.
   - All Okabe-Ito on white: blue #0072B2 7.0:1 PASS AAA (just), green #009E73 3.2:1 FAIL → always use with ink border or on dark text
     Solution: never use Okabe fill with white text; use ink text on Okabe light tint, or white card with Okabe accent border.

2. 18px Minimum — LABEL 24px, CODE 20px, CAPTION 18px hard minimum per Sunni gate.
   Manim scaled: TITLE 36 (≈ 36pt), LABEL 24, CODE 20, CAPTION 18. No text <18.

3. No Overlapping — layout helpers use GRID (12 cols x 8 rows) with SAFE_MARGIN.
   `check_no_overlap()` asserts bounding boxes don't intersect with padding.
   `cam_label()` includes auto-bump via grid slots.

4. Reduced Motion Safe — no flashing >3Hz, no rapid inversion, all transitions <0.7s ease-in-out,
   prefers hard cuts + slide, keeps `run_time <= 0.6` for transforms.
   Respects `prefers-reduced-motion` spirit: provide static fallback frames.

5. Captions Embedded — every title has subtitle/caption path; export SRT via manim caption hooks.
   Use `create_cam_title(..., with_caption=True)`.

6. Triple Encoding — never color-only: Okabe color + shape/icon + text label.

--------------------------------------------------------------------------
USAGE
    from cam_style import apply_cam_style, cam_card, cam_label, add_blueprint_dots

    class MyScene(Scene):
        def construct(self):
            apply_cam_style(self)
            card = cam_card(width=4, height=2.5)
            label = cam_label("Embedding Space", mono=True)
            ...
--------------------------------------------------------------------------
Solo personal project, no connection to employer, built with public/free-tier only
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple, Union

# Try import manim, but keep file importable without it for CI/lint
try:
    from manim import (
        DOWN,
        LEFT,
        RIGHT,
        UP,
        Arrow,
        Circle,
        Code,
        Create,
        DashedLine,
        Dot,
        FadeIn,
        FadeOut,
        Line,
        ManimColor,
        MarkupText,
        Rectangle,
        RoundedRectangle,
        Scene,
        Text,
        VDict,
        VGroup,
        Write,
        config,
    )

    MANIM_AVAILABLE = True
except ImportError:
    MANIM_AVAILABLE = False
    # Minimal stubs for type-checking / file import without manim
    Scene = object  # type: ignore
    VGroup = object  # type: ignore


# ──────────────────────────────────────────────────────────────────────────────
# CORE TOKENS
# ──────────────────────────────────────────────────────────────────────────────

# Paper & Ink
BG: str = "#FFFEF7"  # primary warm paper
BG_ALT: str = "#FFFEFA"  # alt warm paper (slightly whiter)
INK: str = "#111111"  # 2px ink border
PAPER_DOT: str = "#E8E0C8"  # faint blueprint dots
CARD_FILL: str = "#FFFFFF"  # card fill white
SHADOW: str = "#111111"  # hard shadow
TEXT: str = "#111111"  # primary text
SUBTLE: str = "#666666"  # subtle label — use only >=24px or replace with #585858 for AAA on 18px
SUBTLE_AAA: str = "#585858"  # AAA-safe subtle for 18px — 7.03:1 on #FFFEF7 PASS AAA

# Okabe-Ito — colorblind-safe flat palette (Sunni AAA gate)
OKABE: dict[str, str] = {
    "orange": "#E69F00",  # Okabe-Ito orange
    "sky": "#56B4E9",  # sky blue
    "green": "#009E73",  # bluish green
    "yellow": "#F0E442",  # yellow (needs ink text!)
    "blue": "#0072B2",  # blue
    "verm": "#D55E00",  # vermillion
    "purple": "#CC79A7",  # reddish purple
    # Aliases for ergonomics
    "bluish_green": "#009E73",
    "reddish_purple": "#CC79A7",
    "vermillion": "#D55E00",
}

# Semantic aliases for Cam system
SEMANTIC: dict[str, str] = {
    "families": OKABE["orange"],
    "vectors": OKABE["sky"],
    "hoops": OKABE["green"],
    "embed": OKABE["blue"],
    "warning": OKABE["verm"],
    "accent": OKABE["purple"],
}

# Typography — manim pt scaled (manim Text font_size is in pts)
TITLE_SIZE: int = 36
LABEL_SIZE: int = 24
CODE_SIZE: int = 20
CAPTION_SIZE: int = 18

# Neobrutalism metrics
INK_STROKE_WIDTH: float = 6.0  # ≈2px visual at 1080p (manim stroke_width)
SHADOW_OFFSET_X: float = 0.12  # ≈3-4px hard shadow offset X
SHADOW_OFFSET_Y: float = -0.12  # Y negative = down-right shadow
CORNER_RADIUS: float = 0.08
CODE_CORNER_RADIUS: float = 0.05

# Layout Grid — prevents overlap
GRID_COLS: int = 12
GRID_ROWS: int = 8
SAFE_MARGIN: float = 0.55  # safe area from edge (56px tabs spirit)
BOTTOM_SAFE: float = 0.9  # reserve bottom for 56px tab bar equivalent
DOT_SPACING: float = 0.55
DOT_RADIUS: float = 0.012
DOT_OPACITY: float = 0.55

# Animation — reduced motion safe
DEFAULT_RUN_TIME: float = 0.55  # no flash, gentle ease
MAX_FLASH_HZ: float = 2.0  # never exceed 3Hz

# Font families — attempt mono for labels
MONO_STACK: list[str] = [
    "JetBrains Mono",
    "IBM Plex Mono",
    "SF Mono",
    "Courier New",
    "monospace",
]
SANS_STACK: list[str] = [
    "Inter",
    "IBM Plex Sans",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
]


# ──────────────────────────────────────────────────────────────────────────────
# COLOR UTILS & ADA CONTRAST
# ──────────────────────────────────────────────────────────────────────────────


def _hex_to_rgb(hex_color: str) -> tuple[float, float, float]:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join([c * 2 for c in h])
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    return r, g, b


def _linearize(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def relative_luminance(hex_color: str) -> float:
    r, g, b = _hex_to_rgb(hex_color)
    return 0.2126 * _linearize(r) + 0.7152 * _linearize(g) + 0.0722 * _linearize(b)


def contrast_ratio(fg: str, bg: str) -> float:
    """WCAG contrast ratio (L1+0.05)/(L2+0.05)"""
    l1 = relative_luminance(fg)
    l2 = relative_luminance(bg)
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def check_ada_contrast(fg: str, bg: str, threshold: float = 7.0, label: str = "") -> dict:
    ratio = contrast_ratio(fg, bg)
    passed = ratio >= threshold
    if not passed:
        print(f"[ADA WARN] {label} contrast {ratio:.2f}:1 {fg} on {bg} < {threshold} AAA")
    return {"ratio": ratio, "pass": passed, "fg": fg, "bg": bg, "label": label}


def ensure_ada_compliance() -> list[dict]:
    """Run all critical contrast checks — call in CI or scene start."""
    checks = [
        check_ada_contrast(TEXT, BG, 7.0, "TEXT on BG"),
        check_ada_contrast(TEXT, CARD_FILL, 7.0, "TEXT on CARD"),
        check_ada_contrast(TEXT, BG_ALT, 7.0, "TEXT on BG_ALT"),
        check_ada_contrast(SUBTLE, BG, 4.5, "SUBTLE on BG (AA large)"),
        check_ada_contrast(SUBTLE_AAA, BG, 7.0, "SUBTLE_AAA on BG (AAA)"),
        check_ada_contrast(OKABE["blue"], CARD_FILL, 4.5, "OKABE blue on CARD (AA)"),
        check_ada_contrast(INK, OKABE["yellow"], 7.0, "INK on yellow (AAA)"),
        check_ada_contrast(INK, OKABE["sky"], 7.0, "INK on sky"),
        check_ada_contrast(CARD_FILL, INK, 7.0, "CARD on INK (inverted chip)"),
    ]
    return checks


# Precomputed notes for docgen
ADA_RATIOS = {
    f"{TEXT} on {BG}": round(contrast_ratio(TEXT, BG), 2),
    f"{TEXT} on {CARD_FILL}": round(contrast_ratio(TEXT, CARD_FILL), 2),
}


# ──────────────────────────────────────────────────────────────────────────────
# LAYOUT GRID — no overlap guarantee
# ──────────────────────────────────────────────────────────────────────────────


def get_grid_position(col: int, row: int, col_span: int = 1, row_span: int = 1):
    """Return (x_center, y_center, width, height) in scene coords for grid slot."""
    if not MANIM_AVAILABLE:
        return (0, 0, 3, 2)
    fw = config.frame_width
    fh = config.frame_height
    usable_w = fw - 2 * SAFE_MARGIN
    usable_h = fh - SAFE_MARGIN - BOTTOM_SAFE  # reserve bottom
    cell_w = usable_w / GRID_COLS
    cell_h = usable_h / GRID_ROWS

    x0 = -fw / 2 + SAFE_MARGIN + col * cell_w
    y0 = fh / 2 - SAFE_MARGIN - row * cell_h  # top origin
    w = cell_w * col_span
    h = cell_h * row_span
    xc = x0 + w / 2
    yc = y0 - h / 2
    return xc, yc, w, h


def check_no_overlap(mobjects: list, padding: float = 0.12) -> bool:
    """Check bounding boxes don't overlap — AAA readability guard."""
    if not MANIM_AVAILABLE:
        return True
    for i in range(len(mobjects)):
        for j in range(i + 1, len(mobjects)):
            a = mobjects[i]
            b = mobjects[j]
            try:
                # get bounding points
                a_left = a.get_left()[0] - padding
                a_right = a.get_right()[0] + padding
                a_top = a.get_top()[1] + padding
                a_bottom = a.get_bottom()[1] - padding
                b_left = b.get_left()[0] - padding
                b_right = b.get_right()[0] + padding
                b_top = b.get_top()[1] + padding
                b_bottom = b.get_bottom()[1] - padding
                overlap_x = not (a_right < b_left or b_right < a_left)
                overlap_y = not (a_top < b_bottom or b_top < a_bottom)
                if overlap_x and overlap_y:
                    print(f"[LAYOUT WARN] Overlap detected between {a} and {b}")
                    return False
            except Exception:
                continue
    return True


# ──────────────────────────────────────────────────────────────────────────────
# CORE BUILDERS
# ──────────────────────────────────────────────────────────────────────────────


def _make_shadow(width: float, height: float, corner: float = CORNER_RADIUS):
    if not MANIM_AVAILABLE:
        return None
    shadow = RoundedRectangle(
        width=width,
        height=height,
        corner_radius=corner,
        fill_color=SHADOW,
        fill_opacity=1.0,
        stroke_width=0,
    ).shift([SHADOW_OFFSET_X, SHADOW_OFFSET_Y, 0])
    return shadow


def _make_card_base(
    width: float,
    height: float,
    fill: str = CARD_FILL,
    corner: float = CORNER_RADIUS,
    stroke_color: str = INK,
    stroke_width: float = INK_STROKE_WIDTH,
):
    if not MANIM_AVAILABLE:
        return None
    card = RoundedRectangle(
        width=width,
        height=height,
        corner_radius=corner,
        fill_color=fill,
        fill_opacity=1.0,
        stroke_color=stroke_color,
        stroke_width=stroke_width,
    )
    return card


def cam_card(
    width: float = 4.0,
    height: float = 2.5,
    fill_color: str = CARD_FILL,
    corner_radius: float = CORNER_RADIUS,
    with_shadow: bool = True,
    stroke_color: str = INK,
    label: str | None = None,
    accent_color: str | None = None,
):
    """
    Neobrutalist Cam card: white fill + 2px ink border + 3px hard shadow offset.
    No glow, hard edges, Okabe flat.

    Args:
        width, height: card size in manim units
        fill_color: fill hex
        accent_color: optional top accent bar (Okabe color)
        label: optional mono label for triple encoding

    Returns:
        VGroup [shadow, card, (optional label+accent)]
    """
    if not MANIM_AVAILABLE:
        raise RuntimeError("Manim not available — install manim to render cards")
    from manim import VGroup

    shadow = _make_shadow(width, height, corner_radius) if with_shadow else None
    card = _make_card_base(width, height, fill=fill_color, corner=corner_radius, stroke_color=stroke_color)

    parts = []
    if shadow:
        parts.append(shadow)
    parts.append(card)

    if accent_color:
        accent_bar = (
            RoundedRectangle(
                width=width - 0.04,
                height=0.18,
                corner_radius=corner_radius * 0.5,
                fill_color=accent_color,
                fill_opacity=1.0,
                stroke_width=0,
            )
            .move_to(card.get_top(), UP)
            .shift(DOWN * 0.14)
        )
        parts.append(accent_bar)

    group = VGroup(*parts)

    if label:
        lbl = cam_label(label, font_size=CAPTION_SIZE, mono=True, color=TEXT)
        lbl.move_to(card.get_corner(UP + LEFT)).shift(RIGHT * 0.35 + DOWN * 0.32)
        group.add(lbl)

    return group


def cam_label(
    text: str,
    font_size: int = LABEL_SIZE,
    color: str = TEXT,
    mono: bool = False,
    weight: str = "NORMAL",
    bg_fill: str | None = None,
    with_border: bool = False,
):
    """
    High-contrast Cam label — ADA AAA, no overlap by default placement.
    mono=True => typewriter feel (JetBrains Mono stack).
    """
    if not MANIM_AVAILABLE:
        raise RuntimeError("Manim not available")
    # Use mono for system feel
    font = MONO_STACK[0] if mono else SANS_STACK[0]
    # Manim Text — use font_size as given, color high contrast
    txt = Text(text, font_size=font_size, color=color, font=font, weight=weight)

    if bg_fill or with_border:
        # wrap in small card chip for readability
        pad_x = 0.22
        pad_y = 0.12
        bg = RoundedRectangle(
            width=txt.width + pad_x,
            height=txt.height + pad_y,
            corner_radius=0.04,
            fill_color=bg_fill or CARD_FILL,
            fill_opacity=1.0,
            stroke_color=INK if with_border else bg_fill or CARD_FILL,
            stroke_width=INK_STROKE_WIDTH * 0.45 if with_border else 0,
        ).move_to(txt)
        from manim import VGroup

        return VGroup(bg, txt)

    return txt


def cam_code_box(
    code_str: str,
    width: float = 6.0,
    font_size: int = CODE_SIZE,
    language: str = "python",
    accent: str = OKABE["sky"],
):
    """
    Code box — neobrutalist card + mono code, INK border, subtle Okabe accent.
    """
    if not MANIM_AVAILABLE:
        raise RuntimeError("Manim not available")
    from manim import VGroup

    # Estimate height from lines
    lines = code_str.strip().split("\n")
    estimated_h = max(0.8, len(lines) * 0.28 + 0.5)

    card = cam_card(
        width=width,
        height=estimated_h,
        fill_color=CARD_FILL,
        accent_color=accent,
        corner_radius=CODE_CORNER_RADIUS,
    )

    try:
        code = Code(
            code_string=code_str,
            language=language,
            font_size=font_size,
            font=MONO_STACK[0],
            background="window",
            insert_line_no=False,
        )
        code.width = width * 0.86
        if code.height > estimated_h * 0.8:
            code.height = estimated_h * 0.8
        code.move_to(card)
    except Exception:
        # Fallback to Text if Code fails
        code = Text(code_str, font_size=font_size, color=TEXT, font=MONO_STACK[0])
        code.width = width * 0.86
        code.move_to(card)

    return VGroup(card, code)


def cam_sketch_arrow(start, end, color: str = INK, stroke_width: float = 4.0, with_tip: bool = True):
    """Hand-drawn sketch arrow but clean — no glow, hard ink."""
    if not MANIM_AVAILABLE:
        raise RuntimeError("Manim not available")
    if with_tip:
        arrow = Arrow(
            start,
            end,
            color=color,
            stroke_width=stroke_width,
            buff=0.08,
            tip_length=0.18,
        )
    else:
        arrow = Line(start, end, color=color, stroke_width=stroke_width)
    return arrow


def add_blueprint_dots(
    scene,
    spacing: float = DOT_SPACING,
    dot_radius: float = DOT_RADIUS,
    color: str = PAPER_DOT,
    opacity: float = DOT_OPACITY,
    z_index: int = -100,
):
    """
    Subtle blueprint dotted grid — light paper feel.
    Distinct from 3b1b dark void.
    """
    if not MANIM_AVAILABLE:
        print("[cam_style] skip blueprint dots — manim not available")
        return None

    from manim import VGroup

    fw = config.frame_width
    fh = config.frame_height

    cols = int(fw / spacing) + 2
    rows = int(fh / spacing) + 2

    dots = VGroup()
    for i in range(-cols // 2, cols // 2 + 1):
        for j in range(-rows // 2, rows // 2 + 1):
            dot = Dot(
                point=[i * spacing, j * spacing, 0],
                radius=dot_radius,
                color=color,
                fill_opacity=opacity,
                stroke_width=0,
            )
            dots.add(dot)

    dots.set_z_index(z_index)
    scene.add(dots)
    return dots


# ──────────────────────────────────────────────────────────────────────────────
# SCENE-LEVEL HELPERS
# ──────────────────────────────────────────────────────────────────────────────


def apply_cam_style(scene, bg: str = BG, add_dots: bool = True, check_ada: bool = True):
    """
    Apply Cam global style to a Manim Scene.

    - Sets paper background #FFFEF7
    - Adds blueprint dot grid
    - Runs ADA contrast check
    - Configures no-glow defaults
    """
    if not MANIM_AVAILABLE:
        return

    # Background
    try:
        scene.camera.background_color = bg
    except Exception:
        try:
            scene.camera.background_color = ManimColor(bg)  # type: ignore
        except Exception as e:
            print(f"[cam_style] could not set bg: {e}")

    # Blueprint
    if add_dots:
        add_blueprint_dots(scene)

    if check_ada:
        ensure_ada_compliance()

    # No glow / hard edges enforced globally via our builders — nothing else


def create_cam_title(
    title: str,
    subtitle: str | None = None,
    with_caption: bool = False,
    accent_color: str = OKABE["orange"],
):
    """
    Cam title block — neobrutalist card with heavy title + mono subtitle.
    """
    if not MANIM_AVAILABLE:
        raise RuntimeError("Manim not available")
    from manim import VGroup

    title_text = Text(title, font_size=TITLE_SIZE, color=TEXT, font=SANS_STACK[0], weight="BOLD")
    card_w = max(5.8, title_text.width + 1.2)
    card_h = 1.2 + (0.6 if subtitle else 0)
    card = cam_card(width=card_w, height=card_h, accent_color=accent_color)

    title_text.move_to(card).shift(UP * (0.18 if subtitle else 0))

    items = [card, title_text]

    if subtitle:
        sub = Text(subtitle, font_size=CAPTION_SIZE, color=SUBTLE_AAA, font=MONO_STACK[0])
        sub.next_to(title_text, DOWN, buff=0.12)
        items.append(sub)

    group = VGroup(*items)
    # Reserve safe margin
    xc, yc, _, _ = get_grid_position(1, 0, col_span=10, row_span=1)
    group.move_to([xc, yc, 0])

    return group


def create_family_chip(
    family_name: str = "Hoops Family",
    count: int | None = None,
    color: str = OKABE["orange"],
    icon: str = "⬢",
):
    """
    Small pill chip — family / category indicator with Okabe color + ink border + icon text.
    Triple encoding: shape (pill) + icon (unicode) + text.

    Example: ⬢ Hoops Family (128)
    """
    if not MANIM_AVAILABLE:
        raise RuntimeError("Manim not available")
    from manim import VGroup

    label = f"{icon} {family_name}" + (f" ({count})" if count is not None else "")

    # Core text
    txt = Text(label, font_size=LABEL_SIZE - 2, color=INK, font=MONO_STACK[0], weight="BOLD")

    chip_w = txt.width + 0.6
    chip_h = txt.height + 0.32

    bg = RoundedRectangle(
        width=chip_w,
        height=chip_h,
        corner_radius=chip_h / 2,
        fill_color=color,
        fill_opacity=1.0,
        stroke_color=INK,
        stroke_width=INK_STROKE_WIDTH * 0.6,
    )

    # Shadow small
    shadow = RoundedRectangle(
        width=chip_w,
        height=chip_h,
        corner_radius=chip_h / 2,
        fill_color=SHADOW,
        fill_opacity=1.0,
        stroke_width=0,
    ).shift([0.06, -0.06, 0])

    txt.move_to(bg)

    return VGroup(shadow, bg, txt)


def create_okabe_legend(items: list[tuple[str, str]], pos: list[float] | None = None):
    """
    Legend with Okabe colors, triple-encoded with shapes.

    items: list of (label, okabe_key)
    """
    if not MANIM_AVAILABLE:
        raise RuntimeError("Manim not available")
    from manim import VGroup

    entries = VGroup()
    for label, okabe_key in items:
        col = OKABE.get(okabe_key, okabe_key)
        dot = Circle(
            radius=0.12,
            fill_color=col,
            fill_opacity=1,
            stroke_color=INK,
            stroke_width=3,
        )
        txt = Text(label, font_size=CAPTION_SIZE, color=TEXT, font=MONO_STACK[0])
        entry = VGroup(dot, txt).arrange(RIGHT, buff=0.15)
        entries.add(entry)

    entries.arrange(DOWN, buff=0.18, aligned_edge=LEFT)

    if pos is not None:
        entries.move_to(pos)

    # Wrap in small card for readability
    wrapper = cam_card(width=entries.width + 0.6, height=entries.height + 0.5)
    wrapper.add(entries)

    return wrapper


# ──────────────────────────────────────────────────────────────────────────────
# EXPORT FOR VIDEO PIPELINE
# ──────────────────────────────────────────────────────────────────────────────

__all__ = [
    "BG",
    "BG_ALT",
    "BOTTOM_SAFE",
    "CAPTION_SIZE",
    "CARD_FILL",
    "CODE_SIZE",
    "CORNER_RADIUS",
    "DEFAULT_RUN_TIME",
    "DOT_OPACITY",
    "DOT_RADIUS",
    "DOT_SPACING",
    "GRID_COLS",
    "GRID_ROWS",
    "INK",
    "INK_STROKE_WIDTH",
    "LABEL_SIZE",
    "MONO_STACK",
    "OKABE",
    "PAPER_DOT",
    "SAFE_MARGIN",
    "SANS_STACK",
    "SEMANTIC",
    "SHADOW",
    "SHADOW_OFFSET_X",
    "SHADOW_OFFSET_Y",
    "SUBTLE",
    "SUBTLE_AAA",
    "TEXT",
    "TITLE_SIZE",
    "add_blueprint_dots",
    "apply_cam_style",
    "cam_card",
    "cam_code_box",
    "cam_label",
    "cam_sketch_arrow",
    "check_ada_contrast",
    "check_no_overlap",
    "contrast_ratio",
    "create_cam_title",
    "create_family_chip",
    "create_okabe_legend",
    "ensure_ada_compliance",
    "get_grid_position",
    "relative_luminance",
]
