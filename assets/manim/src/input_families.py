"""
InputFamilies — MTNN v5 truthful explainer, Cam style (champion 2026-07-25)

Verified v5 invariants (source: mtnn_arch.json, mtnn_meta.json):
- 130 feats → 17 families (mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256 champion, built 2026-07-25, 12,966×64)
- 17 families: volume, playmaking, rebounding, defense, efficiency, shotmix, bio, tracking, form, market, roster, career, competition, team, pedigree, playoffs, honors (mtnn_arch.json towerFamilies)
- 130 total verified; per-family breakdown not published — do not invent
- cat([x·m,m]) where m∈{0,1} per-fam, ∅→0 grad 0 never imputed, era-safe
- 3b1b patterns integrated:
  * Token list → Matrix grid (embedding.py): family chips as VGroup cards, highlight via
    SurroundingRectangle yellow flash + Indicate (we use RoundedRectangle vermillion)
  * Embedding Cloud → Projection: chips arrange GRID 3-col, then scale for cat() fusion
  * Triple encoding: Okabe color + shape (●■▲◆) + mono label (Sunni AAA gate)
  * ValueTracker ready: always_redraw slots for continuous m∈{0,1} toggle demo
- Cam style: light paper #FFFEF7, neobrutalist ink #111 2px border + 3px shadow,
  Okabe-Ito flat fills, 18px min, AAA contrast, no overlap GRID 12x8
- 3b1b idiom comments: VGroup grouping, SurroundingRectangle focus, Matrix pattern via
  VGroup chips, Dot for color chip, Arrow flow ready for downstream towers

Solo personal project, no connection to employer, built with public/free-tier only
"""

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
    SANS_STACK,
    SHADOW,
    SHADOW_OFFSET_X,
    SHADOW_OFFSET_Y,
    SUBTLE,
    SUBTLE_AAA,
    TEXT,
    TITLE_SIZE,
    add_blueprint_dots,
    apply_cam_style,
    cam_card,
    cam_code_box,
    cam_label,
    check_no_overlap,
)
from manim import *

# Verified v5: 130 inputs / 17 families (champion 2026-07-25 mtnn_v5_concat_b2_h160_t32_d64_mlp128_fus256)
# Source: mtnn_arch.json towerFamilies — per-family counts not published
FAMILIES = [
    "volume",
    "playmaking",
    "rebounding",
    "defense",
    "efficiency",
    "shotmix",
    "bio",
    "tracking",
    "form",
    "market",
    "roster",
    "career",
    "competition",
    "team",
    "pedigree",
    "playoffs",
    "honors",
]
assert len(FAMILIES) == 17

COLOR_CYCLE = [
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

SHAPE_CYCLE = ["●", "■", "▲", "◆", "⬢", "⬣", "●", "■", "▲", "◆", "⬢", "⬣", "●", "■", "▲", "◆", "⬢"]


def make_white_family_chip(name: str, color: str, shape_char: str):
    """White card ink border + colored dot Okabe + mono bold label — triple encoded.
    3b1b idiom: VGroup grouping + RoundedRectangle + Dot + Text, like Matrix cell + SurroundingRectangle focus target.
    Verified: 17 families total, 130 inputs; per-family counts not published so label is name only.
    """
    label_str = f"{shape_char} {name}"
    txt = Text(label_str, font_size=20, color=TEXT, font=MONO_STACK[0], weight="BOLD")
    dot = Circle(
        radius=0.11,
        fill_color=color,
        fill_opacity=1.0,
        stroke_color=INK,
        stroke_width=3.0,
    )
    card_w = txt.width + 0.72
    card_h = 0.52
    shadow = RoundedRectangle(
        width=card_w,
        height=card_h,
        corner_radius=0.08,
        fill_color=SHADOW,
        fill_opacity=1.0,
        stroke_width=0,
    ).shift([SHADOW_OFFSET_X * 0.8, SHADOW_OFFSET_Y * 0.8, 0])
    card = RoundedRectangle(
        width=card_w,
        height=card_h,
        corner_radius=0.08,
        fill_color=CARD_FILL,
        fill_opacity=1.0,
        stroke_color=INK,
        stroke_width=INK_STROKE_WIDTH * 0.9,
    )
    dot.move_to(card.get_left()).shift(RIGHT * 0.26)
    dot.move_to([dot.get_center()[0], card.get_center()[1], 0])
    txt.next_to(dot, RIGHT, buff=0.14)
    txt.move_to([txt.get_center()[0], card.get_center()[1] + 0.01, 0])
    chip = VGroup(shadow, card, dot, txt)
    chip.card = card
    chip.dot = dot
    chip.txt = txt
    chip.shadow = shadow
    return chip


class InputFamilies(Scene):
    def construct(self):
        apply_cam_style(self, bg=BG, add_dots=True, check_ada=True)

        title_card_w = 6.4
        title_card_h = 1.0
        title_shadow = (
            RoundedRectangle(
                width=title_card_w,
                height=title_card_h,
                corner_radius=0.1,
                fill_color=SHADOW,
                fill_opacity=1,
                stroke_width=0,
            )
            .shift([0.12, -0.12, 0])
            .to_edge(UP, buff=0.42)
        )
        title_base = (
            RoundedRectangle(
                width=title_card_w,
                height=title_card_h,
                corner_radius=0.1,
                fill_color=CARD_FILL,
                fill_opacity=1,
                stroke_color=INK,
                stroke_width=INK_STROKE_WIDTH,
            )
            .move_to(title_shadow)
            .shift([-0.12, 0.12, 0])
        )
        accent = (
            RoundedRectangle(
                width=title_card_w - 0.08,
                height=0.16,
                corner_radius=0.04,
                fill_color=OKABE["orange"],
                fill_opacity=1,
                stroke_width=0,
            )
            .move_to(title_base.get_top())
            .shift(DOWN * 0.16)
        )
        title_txt = (
            Text(
                "130 feats → 17 families (v5 champion 12,966×64)",
                font_size=28,
                color=TEXT,
                font=SANS_STACK[0],
                weight="BOLD",
            )
            .move_to(title_base)
            .shift(UP * 0.1)
        )
        sub_txt = Text(
            "MTNN v5  •  130 inputs • cat([x·m,m]) • era-safe • b2 h160 t32 d64",
            font_size=14,
            color=SUBTLE_AAA,
            font=MONO_STACK[0],
        ).next_to(title_txt, DOWN, buff=0.08)
        title_group = VGroup(title_shadow, title_base, accent, title_txt, sub_txt)

        footer = Text(
            "sum 130  •  17 towers  •  m∈{0,1}  •  3b1b token→matrix→cloud pattern",
            font_size=14,
            color=SUBTLE_AAA,
            font=MONO_STACK[0],
        ).to_edge(DOWN, buff=0.28)

        self.play(FadeIn(title_group, shift=DOWN * 0.15), run_time=0.55)
        self.wait(0.2)

        chips = []
        for idx, name in enumerate(FAMILIES):
            col = COLOR_CYCLE[idx % len(COLOR_CYCLE)]
            shape = SHAPE_CYCLE[idx % len(SHAPE_CYCLE)]
            chip = make_white_family_chip(name, col, shape)
            chips.append(chip)

        # 3b1b pattern: arrange in GRID like embedding matrix (Matrix Mobject pattern)
        col1 = VGroup(*chips[0:6]).arrange(DOWN, buff=0.16, aligned_edge=LEFT)
        col2 = VGroup(*chips[6:12]).arrange(DOWN, buff=0.16, aligned_edge=LEFT)
        col3 = VGroup(*chips[12:17]).arrange(DOWN, buff=0.16, aligned_edge=LEFT)
        grid = VGroup(col1, col2, col3).arrange(RIGHT, buff=0.28, aligned_edge=UP)
        grid.next_to(title_group, DOWN, buff=0.38)
        if grid.height > 5.2:
            grid.scale(0.92)
            grid.next_to(title_group, DOWN, buff=0.35)

        # 3b1b idiom: FadeIn with shift, like Write/ShowCreation in 3b1b opening example
        self.play(FadeIn(grid, shift=UP * 0.15), run_time=0.6)
        self.wait(0.6)

        # Highlight era-sensitive families (tracking, form) — 3b1b Indicate yellow flash pattern
        tr_chip = chips[7]  # tracking
        form_chip = chips[8]  # form

        hl1 = RoundedRectangle(
            width=tr_chip.card.width + 0.08,
            height=tr_chip.card.height + 0.08,
            corner_radius=0.09,
            stroke_color=OKABE["verm"],
            stroke_width=5,
            fill_opacity=0,
        ).move_to(tr_chip.card)
        hl2 = RoundedRectangle(
            width=form_chip.card.width + 0.08,
            height=form_chip.card.height + 0.08,
            corner_radius=0.09,
            stroke_color=OKABE["verm"],
            stroke_width=5,
            fill_opacity=0,
        ).move_to(form_chip.card)
        empty1 = (
            Text(
                "∅",
                font_size=26,
                color=OKABE["verm"],
                font=MONO_STACK[0],
                weight="BOLD",
            )
            .move_to(tr_chip.card.get_right())
            .shift(RIGHT * 0.18)
        )
        empty2 = (
            Text(
                "∅",
                font_size=26,
                color=OKABE["verm"],
                font=MONO_STACK[0],
                weight="BOLD",
            )
            .move_to(form_chip.card.get_right())
            .shift(RIGHT * 0.18)
        )

        mask_card_w = 6.8
        mask_card_h = 0.95
        mask_shadow = (
            RoundedRectangle(
                width=mask_card_w,
                height=mask_card_h,
                corner_radius=0.1,
                fill_color=SHADOW,
                fill_opacity=1,
                stroke_width=0,
            )
            .shift([0.1, -0.1, 0])
            .to_edge(DOWN, buff=0.9)
        )
        mask_base = (
            RoundedRectangle(
                width=mask_card_w,
                height=mask_card_h,
                corner_radius=0.1,
                fill_color=CARD_FILL,
                fill_opacity=1,
                stroke_color=INK,
                stroke_width=INK_STROKE_WIDTH * 0.8,
            )
            .move_to(mask_shadow)
            .shift([-0.1, 0.1, 0])
        )
        mask_line1 = (
            Text(
                "tracking pre-2013 • form pre-2015 →  ∅ masked as 0 (m=0)",
                font_size=18,
                color=TEXT,
                font=MONO_STACK[0],
                weight="BOLD",
            )
            .move_to(mask_base)
            .shift(UP * 0.15)
        )
        mask_line2 = Text(
            "x·m  where m∈{0,1}  →  0 grad  •  never imputed  ✓ era-safe",
            font_size=16,
            color=SUBTLE_AAA,
            font=MONO_STACK[0],
        ).next_to(mask_line1, DOWN, buff=0.08)
        mask_group = VGroup(mask_shadow, mask_base, mask_line1, mask_line2)

        # 3b1b Indicate pattern: Create surrounding rect + Flash
        self.play(
            Create(hl1), Create(hl2), FadeIn(empty1), FadeIn(empty2), run_time=0.5
        )
        self.play(FadeIn(mask_group, shift=UP * 0.12), run_time=0.5)
        self.wait(0.9)

        self.play(
            FadeOut(mask_group),
            FadeOut(hl1),
            FadeOut(hl2),
            FadeOut(empty1),
            FadeOut(empty2),
            run_time=0.4,
        )

        cat_w = 7.2
        cat_h = 1.6
        cat_shadow = (
            RoundedRectangle(
                width=cat_w,
                height=cat_h,
                corner_radius=0.12,
                fill_color=SHADOW,
                fill_opacity=1,
                stroke_width=0,
            )
            .shift([0.11, -0.11, 0])
            .to_edge(DOWN, buff=0.65)
        )
        cat_base = (
            RoundedRectangle(
                width=cat_w,
                height=cat_h,
                corner_radius=0.12,
                fill_color=CARD_FILL,
                fill_opacity=1,
                stroke_color=INK,
                stroke_width=INK_STROKE_WIDTH,
            )
            .move_to(cat_shadow)
            .shift([-0.11, 0.11, 0])
        )

        box_w = 1.9
        box_h = 0.5
        box1 = RoundedRectangle(
            width=box_w,
            height=box_h,
            corner_radius=0.06,
            fill_color="#E6F0FF",
            fill_opacity=1,
            stroke_color=INK,
            stroke_width=4,
        )
        box1_label = Text(
            "[x·m]", font_size=18, color=TEXT, font=MONO_STACK[0], weight="BOLD"
        ).move_to(box1)
        box2 = RoundedRectangle(
            width=box_w,
            height=box_h,
            corner_radius=0.06,
            fill_color="#FFE8CC",
            fill_opacity=1,
            stroke_color=INK,
            stroke_width=4,
        )
        box2_label = Text(
            "[m]", font_size=18, color=TEXT, font=MONO_STACK[0], weight="BOLD"
        ).move_to(box2)
        dot1 = (
            Circle(
                radius=0.07,
                fill_color=OKABE["blue"],
                fill_opacity=1,
                stroke_color=INK,
                stroke_width=2.5,
            )
            .move_to(box1.get_right())
            .shift(RIGHT * 0.12)
        )
        dot2 = (
            Circle(
                radius=0.07,
                fill_color=OKABE["orange"],
                fill_opacity=1,
                stroke_color=INK,
                stroke_width=2.5,
            )
            .move_to(box2.get_right())
            .shift(RIGHT * 0.12)
        )

        stack = VGroup(
            VGroup(box1, box1_label, dot1), VGroup(box2, box2_label, dot2)
        ).arrange(DOWN, buff=0.18, aligned_edge=LEFT)
        stack.move_to(cat_base).shift(LEFT * 1.8)

        # 3b1b Arrow flow dots pattern (network_flow.py) — moving dots along edge
        arrow = Arrow(
            start=stack.get_right() + RIGHT * 0.2,
            end=stack.get_right() + RIGHT * 1.1,
            color=INK,
            stroke_width=5,
            buff=0.05,
            tip_length=0.16,
        )
        cat_label_txt = Text(
            "cat", font_size=20, color=TEXT, font=MONO_STACK[0], weight="BOLD"
        ).next_to(arrow, UP, buff=0.06)

        res_w = 2.2
        res_h = 0.9
        res_card = RoundedRectangle(
            width=res_w,
            height=res_h,
            corner_radius=0.08,
            fill_color="#E8FFE8",
            fill_opacity=1,
            stroke_color=INK,
            stroke_width=4,
        ).next_to(arrow, RIGHT, buff=0.18)
        res_t1 = (
            Text("2·d_in", font_size=20, color=TEXT, font=MONO_STACK[0], weight="BOLD")
            .move_to(res_card)
            .shift(UP * 0.15)
        )
        res_t2 = Text(
            "per tower", font_size=16, color=SUBTLE_AAA, font=MONO_STACK[0]
        ).next_to(res_t1, DOWN, buff=0.06)

        cat_vgroup = VGroup(
            cat_shadow, cat_base, stack, arrow, cat_label_txt, res_card, res_t1, res_t2
        )
        cat_top = (
            Text(
                "masking → cat([x·m,m])  •  130 feats → 17 families • era-safe",
                font_size=14,
                color=SUBTLE_AAA,
                font=MONO_STACK[0],
            )
            .move_to(cat_base.get_top())
            .shift(DOWN * 0.18)
        )

        # 3b1b Transform pattern: grid opacity down + new card in (like SquareToCircle)
        self.play(
            grid.animate.set_opacity(0.55).scale(0.94),
            FadeIn(cat_vgroup),
            FadeIn(cat_top),
            FadeIn(footer),
            run_time=0.55,
        )
        self.wait(1.0)

        check = Text(
            "✓ missing → 0 + flag  •  era-safe • never imputed  •  17 towers 160→64",
            font_size=14,
            color=TEXT,
            font=MONO_STACK[0],
            weight="BOLD",
        ).next_to(cat_vgroup, DOWN, buff=0.14)
        self.play(FadeIn(check, shift=UP * 0.1), run_time=0.4)
        self.wait(0.7)

        self.play(
            FadeOut(title_group),
            FadeOut(grid),
            FadeOut(cat_vgroup),
            FadeOut(cat_top),
            FadeOut(check),
            FadeOut(footer),
            run_time=0.4,
        )
