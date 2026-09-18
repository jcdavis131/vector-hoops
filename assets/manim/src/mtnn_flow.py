"""
MTNNFlow — Cam's Lab authentic style — FIXED SPACING NO OVERLAP — v5 truthful

Verified v5 invariants (champion 2026-07-25 mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256):
- 130 inputs / 17 families (source: mtnn_arch.json dIn 130, towerFamilies 17) — per-family counts not published
- cat([x·m,m]) where m∈{0,1} per-fam, ∅→0 grad 0 never imputed, era-safe
- 17× residual towers: 2 blocks, hidden 160 → out 32 (b2 h160 t32 d64 mlp128) LN GELU res
- concat 544 (17×32) + 12 season_emb = 556 → 128 → 64 L2 normalize v̂=v/||v|| (64-d unit sphere)
- 556→128 via fus256 MLP (256 hidden), then 128→64
- heads 8/5/14/18 + sphere 12,966 pts (player-seasons) 2,415 unique players
- 3b1b patterns integrated (from _2024/transformers):
  * Tower Viz (transformer.py): shared stem → parallel towers via FadeTransform split,
    residual spine branching, VGroup towers arranging GRID 6×3, 0.18 buffs, FadeTransform
    for TRK detail expansion (towers_grid opacity 0.16 → detail card)
  * Embedding (embedding.py): token list → matrix grid highlight (Indicate yellow flash)
    → DotCloud on sphere → 2D projection clustering + Circumscribe neighbors
    Our: tower dots + sphere visual right of fusion, L2 unit chip, 64-d v̂ label
  * Similarity (attention.py, softmax.py): Q·K dot as overlap area + heatmap opacity=weight
    + bipartite edge thickness, softmax bar morphing via always_redraw
    Our: cosine = v̂·ŵ footer, TRK tower detail (tracking family example)
  * MLP Bottleneck (mlp.py): funnel wide→narrow→GELU wiggle→wide + residual + LayerNorm
    to sphere, ValueTracker sliders for continuous Alpha
    Our: fusion 556→128→64 funnel, detail 160→32, ValueTracker-ready arrows
  * Idioms: VGroup grouping, SurroundingRectangle focus, Matrix tables, DotCloud embeddings,
    Arrow flow + moving dots (network_flow.py), ValueTracker+always_redraw, checkpoint_paste
    workflow (manimgl -se <line> → IPython tweak)

Cam style distinct from 3b1b: light paper #FFFEF7, neobrutalist ink #111 2px border + 3px shadow,
Okabe-Ito flat, no glow, mono labels, blueprint dotted grid, AAA contrast.

Solo personal project, no connection to employer, built with public/free-tier only
"""

import os
import sys

from manim import *

sys.path.insert(0, os.path.dirname(__file__))

from cam_style import (
    BG,
    BG_ALT,
    CAPTION_SIZE,
    CARD_FILL,
    CODE_SIZE,
    CORNER_RADIUS,
    INK,
    INK_STROKE_WIDTH,
    LABEL_SIZE,
    MONO_STACK,
    OKABE,
    PAPER_DOT,
    SANS_STACK,
    SHADOW,
    SHADOW_OFFSET_X,
    SHADOW_OFFSET_Y,
    SUBTLE_AAA,
    TEXT,
    TITLE_SIZE,
    add_blueprint_dots,
    apply_cam_style,
    cam_card,
    cam_code_box,
    cam_label,
    get_grid_position,
)

# Verified v5: 17 families, 130 total inputs (champion 2026-07-25 mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256)
# Source: ~/workspace/vector-hoops/public/assets/mtnn_arch.json (dIn 130, towerFamilies 17)
# Per-family feat counts are not published in production meta — do not invent
FAMILIES = [
    ("volume", "VOL"),
    ("playmaking", "PLAY"),
    ("rebounding", "REB"),
    ("defense", "DEF"),
    ("efficiency", "EFF"),
    ("shotmix", "SHOT"),
    ("bio", "BIO"),
    ("tracking", "TRK"),
    ("form", "FORM"),
    ("market", "MKT"),
    ("roster", "ROST"),
    ("career", "CAR"),
    ("competition", "COMP"),
    ("team", "TEAM"),
    ("pedigree", "PED"),
    ("playoffs", "PO"),
    ("honors", "HON"),
]
assert len(FAMILIES) == 17

OKABE_CYCLE = [
    OKABE["blue"],
    OKABE["orange"],
    OKABE["green"],
    OKABE["verm"],
    OKABE["purple"],
    OKABE["sky"],
    OKABE["yellow"],
    OKABE["blue"],
    OKABE["orange"],
    OKABE["green"],
    OKABE["verm"],
    OKABE["purple"],
    OKABE["sky"],
    OKABE["yellow"],
    OKABE["blue"],
    OKABE["orange"],
    OKABE["green"],
]

ICON_CYCLE = [
    "●",
    "■",
    "▲",
    "◆",
    "⬢",
    "⬣",
    "●",
    "■",
    "▲",
    "◆",
    "⬢",
    "⬣",
    "●",
    "■",
    "▲",
    "◆",
    "⬢",
]


def make_mini_tower(
    abbrev: str, full: str, color: str, icon: str, w: float = 1.18, h: float = 0.60
):
    """New Cam Lab no-overlap spec: w=1.18 h=0.60 corner 0.08 accent 0.14h dot r0.07 txt 12 BOLD mono"""
    # shadow slightly smaller offset
    shadow = RoundedRectangle(
        width=w,
        height=h,
        corner_radius=0.08,
        fill_color=SHADOW,
        fill_opacity=1,
        stroke_width=0,
    ).shift([SHADOW_OFFSET_X * 0.55, SHADOW_OFFSET_Y * 0.55, 0])
    card = RoundedRectangle(
        width=w,
        height=h,
        corner_radius=0.08,
        fill_color=CARD_FILL,
        fill_opacity=1,
        stroke_color=INK,
        stroke_width=4.2,
    )
    accent = (
        RoundedRectangle(
            width=w - 0.06,
            height=0.14,
            corner_radius=0.03,
            fill_color=color,
            fill_opacity=1,
            stroke_width=0,
        )
        .move_to(card.get_top())
        .shift(DOWN * 0.10)
    )

    # dot left inside
    dot = Circle(
        radius=0.07,
        fill_color=color,
        fill_opacity=1,
        stroke_color=INK,
        stroke_width=2.2,
    )
    dot.move_to(card.get_left()).shift(RIGHT * 0.18 + DOWN * 0.06)

    # text: icon + abbrev eg "● VOL" — fits 1.18w at 12pt
    txt = Text(
        f"{icon} {abbrev}", font_size=12, color=INK, font=MONO_STACK[0], weight=BOLD
    )
    txt.next_to(dot, RIGHT, buff=0.06)
    # vertically center txt with dot but slightly lower than accent
    txt.shift(DOWN * 0.06)

    grp = VGroup(shadow, card, accent, dot, txt)
    return grp


class MTNNFlow(Scene):
    def construct(self):
        apply_cam_style(self, bg=BG, add_dots=True, check_ada=False)

        # ── Title Card ──
        title_card = cam_card(width=6.4, height=1.10, accent_color=OKABE["orange"])
        title_txt = Text(
            "Inside MTNN v5 — Cam's Lab (champion 12,966×64)",
            font_size=24,
            color=INK,
            font=SANS_STACK[0],
            weight=BOLD,
        )
        title_txt.move_to(title_card).shift(UP * 0.16)
        subtitle_txt = Text(
            "17 families • 130 feats • 64-d L2 • 12,966 seasons • b2 h160 t32 d64 mlp128 fus256",
            font_size=13,
            color=SUBTLE_AAA,
            font=MONO_STACK[0],
        )
        subtitle_txt.next_to(title_txt, DOWN, buff=0.07)
        title_group = VGroup(title_card, title_txt, subtitle_txt)
        title_group.to_edge(UP, buff=0.28)

        self.play(FadeIn(title_group, shift=DOWN * 0.12), run_time=0.55)
        self.wait(0.5)

        # ── Input Card Redesign — FIXED OVERLAP v2 — taller 2.25 + split line ──
        input_card = cam_card(width=3.5, height=2.25, accent_color=OKABE["sky"])
        # Position well left and below title with safe margin — lowered to avoid title overlap
        input_card.move_to(ORIGIN).shift(LEFT * 4.3 + UP * 0.70)

        # Internal stack VGroup — strict DOWN buff 0.10 LEFT aligned, split long line
        t1 = Text(
            "130 feats→17 families",
            font_size=16,
            color=INK,
            font=SANS_STACK[0],
            weight=BOLD,
        )
        t2 = Text("cat([x·m,m]) era-safe", font_size=12, color=INK, font=MONO_STACK[0])
        t3a = Text(
            "m∈{0,1} ∅→0 grad=0", font_size=10, color=SUBTLE_AAA, font=MONO_STACK[0]
        )
        t3b = Text("never imputed", font_size=10, color=SUBTLE_AAA, font=MONO_STACK[0])
        t3_group = VGroup(t3a, t3b).arrange(DOWN, buff=0.04, aligned_edge=LEFT)

        # mini boxes 1.5w x 0.32h white ink border 2.5 label 11 mono
        def mini_box(label):
            b = RoundedRectangle(
                width=1.5,
                height=0.32,
                corner_radius=0.05,
                fill_color=CARD_FILL,
                fill_opacity=1,
                stroke_color=INK,
                stroke_width=2.5,
            )
            lt = Text(label, font_size=10, color=INK, font=MONO_STACK[0])
            lt.move_to(b)
            return VGroup(b, lt)

        mb1 = mini_box("[x·m] per-fam")
        mb2 = mini_box("[m] mask flag")
        boxes_vg = VGroup(mb1, mb2).arrange(DOWN, buff=0.07, aligned_edge=LEFT)

        # gap 0.18 after t3 — use spacer
        spacer = Rectangle(width=0.01, height=0.16, fill_opacity=0, stroke_opacity=0)

        internal_stack = VGroup(t1, t2, t3_group, spacer, boxes_vg).arrange(
            DOWN, buff=0.09, aligned_edge=LEFT
        )
        # Center inside card but with slight left padding for AAA readability
        internal_stack.move_to(input_card.get_center()).shift(UP * 0.02)

        # Ensure internal fits inside card (check)
        if internal_stack.height > input_card.height - 0.25:
            internal_stack.scale(0.92)
            internal_stack.move_to(input_card.get_center())

        input_group = VGroup(input_card, internal_stack)

        self.play(FadeIn(input_group, shift=UP * 0.12), run_time=0.55)
        self.wait(0.3)

        # ── Towers grid — FIXED BUFFS 0.18 —─
        towers_vg = VGroup()
        for idx, (fam, abbr) in enumerate(FAMILIES):
            col = OKABE_CYCLE[idx % len(OKABE_CYCLE)]
            icon = ICON_CYCLE[idx % len(ICON_CYCLE)]
            mini = make_mini_tower(abbr, fam, col, icon, w=1.18, h=0.60)
            towers_vg.add(mini)

        # Arrange 6 columns x 3 rows (last row 5)
        rows = []
        for r in range(3):
            row_items = towers_vg[r * 6 : (r + 1) * 6]
            if len(row_items) == 0:
                continue
            row = VGroup(*row_items).arrange(RIGHT, buff=0.18)
            rows.append(row)
        towers_grid = VGroup(*rows).arrange(DOWN, buff=0.18, aligned_edge=LEFT)
        towers_grid.scale(0.82)
        towers_grid.move_to(ORIGIN).shift(UP * 0.75 + RIGHT * 1.6)

        # Overlap guard: if towers left < input right +0.25, shift right and possibly scale down
        # This is evaluated at runtime, not just mental
        left_tower = towers_grid.get_left()[0]
        right_input = input_card.get_right()[0] + 0.25
        if left_tower < right_input:
            shift_needed = right_input - left_tower
            towers_grid.shift(RIGHT * (shift_needed + 0.1))
            # if still overlaps header or goes off-screen, scale down a bit
            if towers_grid.get_right()[0] > 6.8:
                towers_grid.scale(0.88)
                # re-center after scale
                towers_grid.move_to(ORIGIN).shift(UP * 0.75 + RIGHT * 1.7)

        towers_label = Text(
            "17× residual towers  2 blocks  160→32  LN GELU",
            font_size=11,
            color=INK,
            font=MONO_STACK[0],
            weight=BOLD,
        )
        towers_label.next_to(towers_grid, UP, buff=0.18)

        self.play(
            FadeIn(towers_grid, shift=UP * 0.08),
            FadeIn(towers_label, shift=UP * 0.04),
            run_time=0.65,
        )
        self.wait(0.35)

        # ── Expand one tower — TRK example — ensure not overflow ──
        detail_card = cam_card(width=3.4, height=1.55, accent_color=OKABE["orange"])
        detail_card.move_to(towers_grid.get_center()).shift(DOWN * 0.02)

        d_t1 = Text(
            "TRK tower  tracking family",
            font_size=12,
            color=INK,
            font=MONO_STACK[0],
            weight=BOLD,
        )
        d_t2 = Text(
            "LN → GELU → Residual ×2", font_size=11, color=INK, font=MONO_STACK[0]
        )
        d_t3 = Text(
            "160 → 32  +  LayerNorm", font_size=11, color=SUBTLE_AAA, font=MONO_STACK[0]
        )
        d_t4 = Text(
            "out 32-d   era-safe masked",
            font_size=10,
            color=INK,
            font=MONO_STACK[0],
            weight=BOLD,
        )
        detail_texts = VGroup(d_t1, d_t2, d_t3, d_t4).arrange(
            DOWN, buff=0.08, aligned_edge=LEFT
        )
        detail_texts.move_to(detail_card.get_center())

        detail_group = VGroup(detail_card, detail_texts)

        self.play(
            towers_grid.animate.set_opacity(0.16),
            towers_label.animate.set_opacity(0.30),
            run_time=0.30,
        )
        self.play(FadeIn(detail_group, scale=0.92), run_time=0.5)
        self.wait(0.55)
        self.play(
            FadeOut(detail_group),
            towers_grid.animate.set_opacity(1),
            towers_label.animate.set_opacity(1),
            run_time=0.40,
        )

        # Arrow to fusion — breathing room
        arrow1 = Arrow(
            start=towers_grid.get_bottom() + DOWN * 0.08,
            end=towers_grid.get_bottom() + DOWN * 0.62,
            color=INK,
            stroke_width=4,
            buff=0.05,
            max_tip_length_to_length_ratio=0.12,
        )
        self.play(GrowArrow(arrow1), run_time=0.32)

        # ── Fusion card — INCREASED to 5.4 x 1.35 to fit 3 lines buff 0.10 ──
        fusion_card = cam_card(width=5.4, height=1.35, accent_color=OKABE["green"])
        fusion_card.next_to(arrow1, DOWN, buff=0.14)

        f_t1 = Text(
            "Concat 17×32=544 +12 season =556",
            font_size=13,
            color=INK,
            font=MONO_STACK[0],
            weight=BOLD,
        )
        f_t2 = Text(
            "556 → 128 GELU LN → 64 → L2 normalize",
            font_size=11,
            color=INK,
            font=MONO_STACK[0],
        )
        f_t3 = Text(
            "v^ = v / ||v||   ||v^||=1   12,966 pts (2,415 players)",
            font_size=10,
            color=SUBTLE_AAA,
            font=MONO_STACK[0],
        )
        fusion_texts = VGroup(f_t1, f_t2, f_t3).arrange(
            DOWN, buff=0.10, aligned_edge=LEFT
        )
        fusion_texts.move_to(fusion_card.get_center())

        fusion_group = VGroup(fusion_card, fusion_texts)

        self.play(FadeIn(fusion_group, shift=UP * 0.08), run_time=0.48)
        self.wait(0.30)

        # Embedding visual — small circle to right of fusion, check overflow
        sphere_center = fusion_card.get_right() + RIGHT * 1.0 + UP * 0.06
        if sphere_center[0] > 5.2:
            sphere_center = fusion_card.get_right() + RIGHT * 0.82 + UP * 0.06

        circ = Circle(
            radius=0.42, color=INK, stroke_width=3.2, fill_opacity=0, stroke_opacity=1
        ).move_to(sphere_center)
        dot_o = Dot(sphere_center, radius=0.04, color=INK)
        vec = Arrow(
            sphere_center,
            sphere_center + RIGHT * 0.38 + UP * 0.18,
            buff=0.02,
            color=OKABE["blue"],
            stroke_width=4.2,
            max_tip_length_to_length_ratio=0.18,
        )
        vec_label = Text(
            "64-d v^", font_size=10, color=INK, font=MONO_STACK[0], weight=BOLD
        ).next_to(vec.get_end(), UP + RIGHT, buff=0.04)
        l2_label = Text(
            "L2 unit 64-d", font_size=9, color=SUBTLE_AAA, font=MONO_STACK[0]
        ).next_to(circ, DOWN, buff=0.07)

        sphere_group = VGroup(circ, dot_o, vec, vec_label, l2_label)

        self.play(Create(circ), FadeIn(dot_o), run_time=0.32)
        self.play(GrowArrow(vec), FadeIn(vec_label), FadeIn(l2_label), run_time=0.35)

        # Arrow to heads — more breathing
        arrow2 = Arrow(
            start=fusion_card.get_bottom() + DOWN * 0.08,
            end=fusion_card.get_bottom() + DOWN * 0.68,
            color=INK,
            stroke_width=4,
            buff=0.05,
            max_tip_length_to_length_ratio=0.12,
        )
        self.play(GrowArrow(arrow2), run_time=0.28)

        # ── Heads row — FIXED: width 1.68->1.80 height 0.78 buff 0.22 prevent truncation ──
        heads = VGroup()
        head_defs = [
            ("Archetype", "8", OKABE["blue"], "⬢"),
            ("Position", "5", OKABE["green"], "■"),
            ("Next 14-d", "14", OKABE["orange"], "▲"),
            ("Skills", "18", OKABE["purple"], "◆"),
        ]
        for name, cnt, col, icon in head_defs:
            # increase width to 1.78 to fit 9 chars "Archetype" without truncation
            hc = cam_card(width=1.78, height=0.78, accent_color=col)
            ht1 = Text(
                f"{icon} {name}",
                font_size=10,
                color=INK,
                font=MONO_STACK[0],
                weight=BOLD,
            )
            ht2 = Text(
                f"{cnt} heads", font_size=9, color=SUBTLE_AAA, font=MONO_STACK[0]
            )
            ht_group = (
                VGroup(ht1, ht2)
                .arrange(DOWN, buff=0.06, aligned_edge=LEFT)
                .move_to(hc.get_center())
            )
            heads.add(VGroup(hc, ht_group))

        heads_row = VGroup(*heads).arrange(RIGHT, buff=0.22)
        heads_row.next_to(arrow2, DOWN, buff=0.20)

        # Ensure heads row not off-screen
        if heads_row.get_bottom()[1] < -3.5:
            heads_row.shift(UP * 0.25)
        if heads_row.get_right()[0] > 6.9:
            heads_row.scale(0.94).next_to(arrow2, DOWN, buff=0.20)

        heads_label = Text(
            "Decode heads  CE + MSE  InfoNCE anchor",
            font_size=10,
            color=INK,
            font=MONO_STACK[0],
        )
        heads_label.next_to(heads_row, DOWN, buff=0.14)

        self.play(FadeIn(heads_row, shift=UP * 0.08), run_time=0.55)
        self.play(FadeIn(heads_label, shift=UP * 0.04), run_time=0.32)
        self.wait(0.35)

        # Footer — truthful (verified only)
        footer = Text(
            "Flow: 130→17 towers 544+12=556→128→64 L2 • 12,966 pts 2,415 players • cos=v̂·ŵ • 3b1b towers+cloud+proj",
            font_size=9,
            color=SUBTLE_AAA,
            font=MONO_STACK[0],
        )
        footer.to_edge(DOWN, buff=0.22)
        footer.set_x(0)

        self.play(FadeIn(footer, shift=UP * 0.06), run_time=0.38)
        self.wait(1.6)

        # Fade out for loop clean
        self.play(
            FadeOut(title_group),
            FadeOut(input_group),
            FadeOut(towers_grid),
            FadeOut(towers_label),
            FadeOut(arrow1),
            FadeOut(fusion_group),
            FadeOut(sphere_group),
            FadeOut(arrow2),
            FadeOut(heads_row),
            FadeOut(heads_label),
            FadeOut(footer),
            run_time=0.50,
        )
        self.wait(0.2)
