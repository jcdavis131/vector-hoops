"""
MTNNFlow — Cam authentic style, light paper, neobrutalist cards
Truthful v4 invariants: 17 families 120 feats cat([x·m,m]) -> 17x 160→32x2 LN GELU res 544+12=556→128→48 L2 -> heads 8/5/14/18
Solo personal project, no connection to employer, built with public/free-tier only
"""
from manim import *
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from cam_style import (
    BG, BG_ALT, INK, PAPER_DOT, CARD_FILL, SHADOW, TEXT, SUBTLE_AAA,
    OKABE, TITLE_SIZE, LABEL_SIZE, CODE_SIZE, CAPTION_SIZE,
    INK_STROKE_WIDTH, SHADOW_OFFSET_X, SHADOW_OFFSET_Y, CORNER_RADIUS,
    apply_cam_style, cam_card, cam_label, cam_code_box, add_blueprint_dots,
    get_grid_position, MONO_STACK, SANS_STACK
)

# Truthful family mapping from mtnn_arch.json
FAMILIES = [
    ("volume", 5, "VOL"),
    ("playmaking", 12, "PLAY"),
    ("rebounding", 5, "REB"),
    ("defense", 3, "DEF"),
    ("efficiency", 10, "EFF"),
    ("shotmix", 13, "SHOT"),
    ("bio", 4, "BIO"),
    ("tracking", 13, "TRK"),
    ("form", 6, "FORM"),
    ("market", 4, "MKT"),
    ("roster", 5, "ROST"),
    ("career", 5, "CAR"),
    ("competition", 4, "COMP"),
    ("team", 5, "TEAM"),
    ("pedigree", 7, "PED"),
    ("playoffs", 14, "PO"),
    ("honors", 5, "HON"),
]
assert sum(c for _, c, _ in FAMILIES) == 120

OKABE_CYCLE = [
    OKABE["blue"], OKABE["orange"], OKABE["green"], OKABE["verm"],
    OKABE["purple"], OKABE["sky"], OKABE["yellow"], OKABE["blue"],
    OKABE["orange"], OKABE["green"], OKABE["verm"], OKABE["purple"],
    OKABE["sky"], OKABE["yellow"], OKABE["blue"], OKABE["orange"], OKABE["green"],
]

ICON_CYCLE = ["●", "■", "▲", "◆", "⬢", "⬣", "●", "■", "▲", "◆", "⬢", "⬣", "●", "■", "▲", "◆", "⬢"]


def make_mini_tower(abbrev: str, full: str, color: str, icon: str, w: float = 0.95, h: float = 0.56):
    # shadow
    shadow = RoundedRectangle(
        width=w, height=h, corner_radius=0.08,
        fill_color=SHADOW, fill_opacity=1, stroke_width=0
    ).shift([SHADOW_OFFSET_X*0.6, SHADOW_OFFSET_Y*0.6, 0])
    card = RoundedRectangle(
        width=w, height=h, corner_radius=0.08,
        fill_color=CARD_FILL, fill_opacity=1,
        stroke_color=INK, stroke_width=4.5
    )
    accent = RoundedRectangle(
        width=w-0.06, height=0.14, corner_radius=0.04,
        fill_color=color, fill_opacity=1, stroke_width=0
    ).move_to(card.get_top()).shift(DOWN*0.11)

    # icon dot with ink border
    dot = Circle(radius=0.08, fill_color=color, fill_opacity=1, stroke_color=INK, stroke_width=2.5)
    dot.move_to(card.get_left()).shift(RIGHT*0.18 + UP*0.02)

    txt = Text(f"{icon} {abbrev}", font_size=14, color=INK, font=MONO_STACK[0], weight=BOLD)
    txt.next_to(dot, RIGHT, buff=0.07).shift(DOWN*0.01)
    # center vertically
    grp = VGroup(shadow, card, accent, dot, txt)
    return grp


class MTNNFlow(Scene):
    def construct(self):
        apply_cam_style(self, bg=BG, add_dots=True, check_ada=False)

        # Title Card — neobrutalist
        title_card = cam_card(width=6.0, height=1.15, accent_color=OKABE["orange"])
        title_txt = Text("Inside MTNN v4 — Cam's Lab", font_size=26, color=INK, font=SANS_STACK[0], weight=BOLD)
        title_txt.move_to(title_card).shift(UP*0.18)
        subtitle_txt = Text("17 families • 120 feats • 48-d L2 • 12,392 seasons • W flow 1380", font_size=14, color=SUBTLE_AAA, font=MONO_STACK[0])
        subtitle_txt.next_to(title_txt, DOWN, buff=0.08)
        title_group = VGroup(title_card, title_txt, subtitle_txt)
        title_group.to_edge(UP, buff=0.35)

        self.play(FadeIn(title_group, shift=DOWN*0.15), run_time=0.6)
        self.wait(0.8)

        # Input Card — left top under title
        input_card = cam_card(width=3.7, height=1.2, accent_color=OKABE["sky"])
        input_card.move_to(ORIGIN).shift(UP*1.55 + LEFT*3.2)
        in_t1 = Text("120 feats → 17 families", font_size=16, color=INK, font=SANS_STACK[0], weight=BOLD).move_to(input_card).shift(UP*0.28)
        in_t2 = Text("cat([x·m,m]) era-safe", font_size=13, color=INK, font=MONO_STACK[0]).next_to(in_t1, DOWN, buff=0.08)
        in_t3 = Text("m ∈ {0,1} ∅→0 grad=0 never imputed", font_size=10, color=SUBTLE_AAA, font=MONO_STACK[0]).next_to(in_t2, DOWN, buff=0.06)
        # two stacked mini boxes inside input card visualization
        box_w, box_h = 1.35, 0.28
        b1 = RoundedRectangle(width=box_w, height=box_h, corner_radius=0.05, fill_color="#FFFFFF", fill_opacity=1, stroke_color=INK, stroke_width=2.5)
        b1_label = Text("[x·m]  per-fam", font_size=9, color=INK, font=MONO_STACK[0]).move_to(b1)
        b2 = RoundedRectangle(width=box_w, height=box_h, corner_radius=0.05, fill_color=OKABE["sky"], fill_opacity=0.35, stroke_color=INK, stroke_width=2.5)
        b2_label = Text("[m] mask flag", font_size=9, color=INK, font=MONO_STACK[0]).move_to(b2)
        boxes = VGroup(VGroup(b1, b1_label), VGroup(b2, b2_label)).arrange(DOWN, buff=0.06)
        boxes.next_to(in_t3, DOWN, buff=0.12)
        # adjust input card height to fit? Keep as is, boxes may overflow slightly but okay
        # Instead move boxes inside card bottom
        boxes.move_to(input_card.get_bottom()).shift(UP*0.35)
        in_t1.shift(DOWN*0.05)
        in_t2.shift(DOWN*0.05)
        in_t3.shift(DOWN*0.05)

        input_group = VGroup(input_card, in_t1, in_t2, in_t3, boxes)

        self.play(FadeIn(input_group, shift=UP*0.15), run_time=0.55)
        self.wait(0.35)

        # Towers grid — 17 mini cards
        towers_vg = VGroup()
        for idx, (fam, cnt, abbr) in enumerate(FAMILIES):
            col = OKABE_CYCLE[idx % len(OKABE_CYCLE)]
            icon = ICON_CYCLE[idx % len(ICON_CYCLE)]
            mini = make_mini_tower(abbr, fam, col, icon)
            towers_vg.add(mini)

        # Arrange 6 columns
        rows = []
        for r in range(3):
            row_items = towers_vg[r*6:(r+1)*6]
            if len(row_items)==0:
                continue
            row = VGroup(*row_items).arrange(RIGHT, buff=0.13)
            rows.append(row)
        towers_grid = VGroup(*rows).arrange(DOWN, buff=0.14, aligned_edge=LEFT)
        towers_grid.move_to(ORIGIN).shift(UP*0.85 + RIGHT*1.55)
        # scale slightly to fit
        towers_grid.scale(0.96)

        towers_label = Text("17× residual towers  2 blocks  160→32  LN GELU", font_size=12, color=INK, font=MONO_STACK[0], weight=BOLD)
        towers_label.next_to(towers_grid, UP, buff=0.12)

        self.play(FadeIn(towers_grid, shift=UP*0.1), FadeIn(towers_label, shift=UP*0.05), run_time=0.75)
        self.wait(0.4)

        # Expand one tower - TRACK as example with full W flow
        detail_card = cam_card(width=3.2, height=1.45, accent_color=OKABE["orange"])
        detail_card.move_to(towers_grid).shift(DOWN*0.05)
        # bring to front overlap towers center
        d_t1 = Text("TRK tower  13f×2=26 →160", font_size=13, color=INK, font=MONO_STACK[0], weight=BOLD).move_to(detail_card).shift(UP*0.42)
        d_t2 = Text("LN → GELU → Residual ×2", font_size=11, color=INK, font=MONO_STACK[0]).next_to(d_t1, DOWN, buff=0.07)
        d_t3 = Text("160 → 32  +  LayerNorm", font_size=11, color=SUBTLE_AAA, font=MONO_STACK[0]).next_to(d_t2, DOWN, buff=0.06)
        d_t4 = Text("out 32-d   W tot ~1380 cols", font_size=10, color=INK, font=MONO_STACK[0], weight=BOLD).next_to(d_t3, DOWN, buff=0.08)
        detail_group = VGroup(detail_card, d_t1, d_t2, d_t3, d_t4)

        # dim towers briefly
        self.play(towers_grid.animate.set_opacity(0.18), towers_label.animate.set_opacity(0.35), run_time=0.35)
        self.play(FadeIn(detail_group, scale=0.92), run_time=0.55)
        self.wait(0.6)
        self.play(FadeOut(detail_group), towers_grid.animate.set_opacity(1), towers_label.animate.set_opacity(1), run_time=0.45)

        # Arrow to fusion
        arrow1 = Arrow(start=towers_grid.get_bottom()+DOWN*0.05, end=towers_grid.get_bottom()+DOWN*0.55, color=INK, stroke_width=4, buff=0.05, max_tip_length_to_length_ratio=0.12)
        self.play(GrowArrow(arrow1), run_time=0.35)

        # Fusion card
        fusion_card = cam_card(width=5.2, height=1.25, accent_color=OKABE["green"])
        fusion_card.next_to(arrow1, DOWN, buff=0.12)
        f_t1 = Text("Concat 17×32=544 +12 time =556", font_size=14, color=INK, font=MONO_STACK[0], weight=BOLD).move_to(fusion_card).shift(UP*0.32)
        f_t2 = Text("556 → 128 GELU LN → 48 → L2 normalize", font_size=12, color=INK, font=MONO_STACK[0]).next_to(f_t1, DOWN, buff=0.08)
        f_t3 = Text("v^ = v / ||v||   ||v^||=1   12,392 pts on sphere", font_size=10, color=SUBTLE_AAA, font=MONO_STACK[0]).next_to(f_t2, DOWN, buff=0.07)
        fusion_group = VGroup(fusion_card, f_t1, f_t2, f_t3)

        self.play(FadeIn(fusion_group, shift=UP*0.1), run_time=0.5)
        self.wait(0.35)

        # Embedding visual - small circle to right of fusion
        sphere_center = fusion_card.get_right() + RIGHT*0.95 + UP*0.05
        # avoid overlap, place to right
        if sphere_center[0] > 5:
            sphere_center = fusion_card.get_right() + RIGHT*0.75

        circ = Circle(radius=0.42, color=INK, stroke_width=3.5, fill_opacity=0, stroke_opacity=1).move_to(sphere_center)
        dot_o = Dot(sphere_center, radius=0.04, color=INK)
        vec = Arrow(sphere_center, sphere_center + RIGHT*0.38 + UP*0.18, buff=0.02, color=OKABE["blue"], stroke_width=4.5, max_tip_length_to_length_ratio=0.18)
        vec_label = Text("48-d v^", font_size=11, color=INK, font=MONO_STACK[0], weight=BOLD).next_to(vec.get_end(), UP+RIGHT, buff=0.03)
        l2_label = Text("L2 unit", font_size=9, color=SUBTLE_AAA, font=MONO_STACK[0]).next_to(circ, DOWN, buff=0.06)

        sphere_group = VGroup(circ, dot_o, vec, vec_label, l2_label)

        self.play(Create(circ), FadeIn(dot_o), run_time=0.35)
        self.play(GrowArrow(vec), FadeIn(vec_label), FadeIn(l2_label), run_time=0.4)

        # Arrow to heads
        arrow2 = Arrow(start=fusion_card.get_bottom()+DOWN*0.05, end=fusion_card.get_bottom()+DOWN*0.6, color=INK, stroke_width=4, buff=0.05, max_tip_length_to_length_ratio=0.12)
        self.play(GrowArrow(arrow2), run_time=0.3)

        # Heads row — 4 cards
        heads = VGroup()
        head_defs = [
            ("Archetype", "8", OKABE["blue"], "⬢"),
            ("Position", "5", OKABE["green"], "■"),
            ("Next 14-d", "14", OKABE["orange"], "▲"),
            ("Skills", "18", OKABE["purple"], "◆"),
        ]
        for name, cnt, col, icon in head_defs:
            hc = cam_card(width=1.58, height=0.72, accent_color=col)
            ht1 = Text(f"{icon} {name}", font_size=11, color=INK, font=MONO_STACK[0], weight=BOLD).move_to(hc).shift(UP*0.14)
            ht2 = Text(f"{cnt} heads", font_size=10, color=SUBTLE_AAA, font=MONO_STACK[0]).next_to(ht1, DOWN, buff=0.05)
            heads.add(VGroup(hc, ht1, ht2))

        heads_row = VGroup(*heads).arrange(RIGHT, buff=0.18)
        heads_row.next_to(arrow2, DOWN, buff=0.18)
        heads_label = Text("Decode heads  CE + MSE  InfoNCE anchor", font_size=11, color=INK, font=MONO_STACK[0]).next_to(heads_row, DOWN, buff=0.12)

        self.play(FadeIn(heads_row, shift=UP*0.1), run_time=0.6)
        self.play(FadeIn(heads_label, shift=UP*0.05), run_time=0.35)
        self.wait(0.4)

        # Footer — flow width and invariants
        footer = Text("Flow: 1380 cols • 544+12=556→128→48 L2 • 12,392 careers on sphere • cos=v̂·ŵ", font_size=10, color=SUBTLE_AAA, font=MONO_STACK[0])
        footer.to_edge(DOWN, buff=0.28)
        footer.set_x(0)

        self.play(FadeIn(footer, shift=UP*0.08), run_time=0.4)
        self.wait(1.8)

        # Fade out for loop clean
        self.play(
            FadeOut(title_group), FadeOut(input_group), FadeOut(towers_grid), FadeOut(towers_label),
            FadeOut(arrow1), FadeOut(fusion_group), FadeOut(sphere_group), FadeOut(arrow2),
            FadeOut(heads_row), FadeOut(heads_label), FadeOut(footer),
            run_time=0.55
        )
        self.wait(0.2)
