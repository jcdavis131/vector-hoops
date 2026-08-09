"""
ChimeraEquation — fixed for no cutoff / no overlap
Solo personal project, no connection to employer, built with public/free-tier only
"""

import numpy as np
from cam_style import (
    BG,
    CAPTION_SIZE,
    CARD_FILL,
    CODE_SIZE,
    CORNER_RADIUS,
    INK,
    INK_STROKE_WIDTH,
    LABEL_SIZE,
    OKABE,
    SUBTLE_AAA,
    TEXT,
    TITLE_SIZE,
    apply_cam_style,
    cam_card,
)
from manim import *


class ChimeraEquation(Scene):
    def construct(self):
        apply_cam_style(self, bg=BG, add_dots=True, check_ada=True)

        # Safe frame bounds for 16:9 — keep everything within y -3.0 to 3.2 and x -6.5 to 6.5
        SAFE_TOP = 3.2
        SAFE_BOTTOM = -3.0

        # Title
        title_text = Text("Chimera Equation", font_size=32, color=TEXT, weight=BOLD)
        title_card = cam_card(
            width=5.0,
            height=0.85,
            accent_color=OKABE["orange"],
            corner_radius=CORNER_RADIUS,
        )
        title_text.move_to(title_card)
        title_group = VGroup(title_card, title_text)
        title_group.to_edge(UP, buff=0.3)
        # ensure title inside top
        if title_group.get_top()[1] > SAFE_TOP:
            title_group.to_edge(UP, buff=0.35)

        subtitle = Text(
            "Donor A + Donor B → closest real among 12,392",
            font_size=16,
            color=SUBTLE_AAA,
            font="JetBrains Mono",
        )
        subtitle.next_to(title_group, DOWN, buff=0.15)

        self.play(
            FadeIn(title_group, shift=DOWN * 0.1),
            FadeIn(subtitle, shift=DOWN * 0.06),
            run_time=0.5,
        )
        self.wait(0.2)

        # Donor A card — smaller to prevent overflow
        donor_a_base = cam_card(
            width=2.4,
            height=1.1,
            accent_color=OKABE["blue"],
            corner_radius=CORNER_RADIUS,
        )
        donor_a_icon = Text("Donor A", font_size=16, color=TEXT, weight=BOLD)
        donor_a_code1 = Text("v_A = f(season)", font_size=14, color=TEXT, font="JetBrains Mono")
        donor_a_code2 = Text("48-d  |v|=1", font_size=12, color=SUBTLE_AAA, font="JetBrains Mono")
        donor_a_content = VGroup(donor_a_icon, donor_a_code1, donor_a_code2).arrange(DOWN, buff=0.08, aligned_edge=LEFT)
        donor_a_content.move_to(donor_a_base.get_center())
        donor_a = VGroup(donor_a_base, donor_a_content)

        donor_b_base = cam_card(
            width=2.4,
            height=1.1,
            accent_color=OKABE["verm"],
            corner_radius=CORNER_RADIUS,
        )
        donor_b_icon = Text("Donor B", font_size=16, color=TEXT, weight=BOLD)
        donor_b_code1 = Text("v_B = f(season)", font_size=14, color=TEXT, font="JetBrains Mono")
        donor_b_code2 = Text("48-d  |v|=1", font_size=12, color=SUBTLE_AAA, font="JetBrains Mono")
        donor_b_content = VGroup(donor_b_icon, donor_b_code1, donor_b_code2).arrange(DOWN, buff=0.08, aligned_edge=LEFT)
        donor_b_content.move_to(donor_b_base.get_center())
        donor_b = VGroup(donor_b_base, donor_b_content)

        plus_text = Text("+", font_size=28, color=TEXT, weight=BOLD)
        plus_bg = RoundedRectangle(
            width=0.45,
            height=0.45,
            corner_radius=0.08,
            fill_color=CARD_FILL,
            fill_opacity=1,
            stroke_color=INK,
            stroke_width=INK_STROKE_WIDTH * 0.6,
        )
        plus_group = VGroup(plus_bg, plus_text)

        donor_row = VGroup(donor_a, plus_group, donor_b).arrange(RIGHT, buff=0.35, aligned_edge=UP)
        donor_row.next_to(subtitle, DOWN, buff=0.35)
        donor_row.move_to([0, 1.05, 0])  # force centered, well above middle

        self.play(
            FadeIn(donor_a, shift=RIGHT * 0.1),
            FadeIn(plus_group),
            FadeIn(donor_b, shift=LEFT * 0.1),
            run_time=0.5,
        )
        self.wait(0.15)

        # Arrow down to fuse
        arrow1_start = donor_row.get_bottom() + DOWN * 0.05
        arrow1_end = arrow1_start + DOWN * 0.35
        arrow1 = Arrow(
            arrow1_start,
            arrow1_end,
            color=INK,
            stroke_width=5,
            buff=0,
            max_tip_length_to_length_ratio=0.18,
        )

        # Fuse card — compact, centered
        fuse_base = cam_card(
            width=3.6,
            height=0.8,
            accent_color=OKABE["green"],
            corner_radius=CORNER_RADIUS,
        )
        fuse_title = Text("fuse 48-d", font_size=16, color=TEXT, weight=BOLD)
        fuse_eq = Text(
            "(v_A + v_B)/2 -> v_f L2",
            font_size=13,
            color=SUBTLE_AAA,
            font="JetBrains Mono",
        )
        fuse_content = VGroup(fuse_title, fuse_eq).arrange(DOWN, buff=0.06, aligned_edge=LEFT)
        fuse_content.move_to(fuse_base.get_center())
        fuse_card = VGroup(fuse_base, fuse_content)
        fuse_card.next_to(arrow1, DOWN, buff=0.15)

        self.play(GrowArrow(arrow1), run_time=0.3)
        self.play(FadeIn(fuse_card, shift=UP * 0.08), run_time=0.4)
        self.wait(0.15)

        # Arrow down to final
        arrow2_start = fuse_card.get_bottom() + DOWN * 0.05
        arrow2_end = arrow2_start + DOWN * 0.35
        arrow2 = Arrow(
            arrow2_start,
            arrow2_end,
            color=INK,
            stroke_width=5,
            buff=0,
            max_tip_length_to_length_ratio=0.18,
        )

        # Final argmin card — WIDE but NOT too wide, font reduced, ensure bottom stays inside SAFE_BOTTOM
        # Use 2-line layout to prevent horizontal cutoff
        final_base = cam_card(width=7.8, height=1.15, accent_color=OKABE["blue"], corner_radius=0.08)
        final_line1 = Text(
            "Chimera(A,B) = argmin r in 12,392",
            font_size=15,
            color=TEXT,
            font="JetBrains Mono",
            weight=BOLD,
        )
        final_line2 = Text(
            "|| (f(A)+f(B))/2 - f(r) ||_2",
            font_size=15,
            color=TEXT,
            font="JetBrains Mono",
        )
        final_sub = Text(
            "powers daily Chimera game • cosine = similarity",
            font_size=11,
            color=SUBTLE_AAA,
            font="JetBrains Mono",
        )
        final_content = VGroup(final_line1, final_line2, final_sub).arrange(DOWN, buff=0.08, aligned_edge=LEFT)
        final_content.move_to(final_base.get_center())
        final_card = VGroup(final_base, final_content)
        final_card.next_to(arrow2, DOWN, buff=0.15)

        # Safety check: push up if bottom goes out of frame
        if final_card.get_bottom()[1] < SAFE_BOTTOM:
            over = SAFE_BOTTOM - final_card.get_bottom()[1]
            donor_row.shift(UP * over)
            arrow1.shift(UP * over)
            fuse_card.shift(UP * over)
            arrow2.shift(UP * over)
            final_card.shift(UP * over)

        self.play(GrowArrow(arrow2), run_time=0.3)
        self.play(FadeIn(final_card, shift=UP * 0.08), run_time=0.45)
        self.wait(1.8)

        # Fade out cleanly for loop
        self.play(
            FadeOut(title_group),
            FadeOut(subtitle),
            FadeOut(donor_row),
            FadeOut(arrow1),
            FadeOut(fuse_card),
            FadeOut(arrow2),
            FadeOut(final_card),
            run_time=0.6,
        )
        self.wait(0.5)
