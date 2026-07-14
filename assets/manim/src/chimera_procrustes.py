"""
ChimeraEquation — Cam authentic style
Donor A + Donor B -> fuse 48-d -> nearest real L2 among 12,392
Solo personal project, no connection to employer, built with public/free-tier only
"""
from manim import *
import numpy as np

from cam_style import (
    BG, BG_ALT, INK, PAPER_DOT, CARD_FILL, SHADOW, TEXT, SUBTLE, SUBTLE_AAA,
    OKABE, TITLE_SIZE, LABEL_SIZE, CODE_SIZE, CAPTION_SIZE,
    INK_STROKE_WIDTH, SHADOW_OFFSET_X, SHADOW_OFFSET_Y, CORNER_RADIUS,
    DOT_SPACING, DOT_RADIUS, DOT_OPACITY,
    apply_cam_style, cam_card, cam_label, cam_code_box, cam_sketch_arrow,
    add_blueprint_dots, get_grid_position,
)

class ChimeraEquation(Scene):
    def construct(self):
        apply_cam_style(self, bg=BG, add_dots=True, check_ada=True)

        # Title — high contrast, 36pt, ink on paper
        title_text = Text("Chimera Equation", font_size=TITLE_SIZE, color=TEXT, weight=BOLD)
        title_card = cam_card(width=max(5.4, title_text.width+1.2), height=1.0, accent_color=OKABE["orange"], corner_radius=CORNER_RADIUS)
        title_text.move_to(title_card)
        title_group = VGroup(title_card, title_text)
        title_group.to_edge(UP, buff=0.35)

        subtitle = Text("Donor A + Donor B → closest real among 12,392", font_size=CAPTION_SIZE, color=SUBTLE_AAA, font="JetBrains Mono")
        # move subtitle below title with safe spacing
        subtitle.next_to(title_group, DOWN, buff=0.18)

        self.play(FadeIn(title_group, shift=DOWN*0.12), FadeIn(subtitle, shift=DOWN*0.08), run_time=0.7)
        self.wait(0.3)

        # ── Donor cards row ──
        # Donor A
        donor_a_card_base = cam_card(width=2.7, height=1.55, accent_color=OKABE["blue"], corner_radius=CORNER_RADIUS)
        donor_a_title = Text("\u2B22 Donor A", font_size=20, color=TEXT, weight=BOLD)  # ⬢
        donor_a_v = Text("v_A = f(season)", font_size=16, color=TEXT)
        donor_a_dim = Text("48-d  ||v||=1", font_size=16, color=SUBTLE_AAA)
        donor_a_content = VGroup(donor_a_title, donor_a_v, donor_a_dim).arrange(DOWN, buff=0.12, aligned_edge=LEFT)
        donor_a_content.move_to(donor_a_card_base.get_center()).shift(DOWN*0.08)
        donor_a = VGroup(donor_a_card_base, donor_a_content)

        # Donor B
        donor_b_card_base = cam_card(width=2.7, height=1.55, accent_color=OKABE["orange"], corner_radius=CORNER_RADIUS)
        donor_b_title = Text("\u25B2 Donor B", font_size=20, color=TEXT, weight=BOLD)  # ▲
        donor_b_v = Text("v_B = f(season)", font_size=16, color=TEXT)
        donor_b_dim = Text("48-d  ||v||=1", font_size=16, color=SUBTLE_AAA)
        donor_b_content = VGroup(donor_b_title, donor_b_v, donor_b_dim).arrange(DOWN, buff=0.12, aligned_edge=LEFT)
        donor_b_content.move_to(donor_b_card_base.get_center()).shift(DOWN*0.08)
        donor_b = VGroup(donor_b_card_base, donor_b_content)

        # Plus symbol — ink black, high contrast, triple encoded shape+text+color? Use text plus with box
        plus_label = Text("+", font_size=32, color=TEXT, weight=BOLD)
        # small card for plus to keep no-overlap and ink border
        plus_bg = RoundedRectangle(width=0.55, height=0.55, corner_radius=0.08, fill_color=CARD_FILL, fill_opacity=1.0, stroke_color=INK, stroke_width=INK_STROKE_WIDTH*0.6)
        plus_group = VGroup(plus_bg, plus_label)

        # Row positioning — ensure 20px+ spacing (~0.25 units)
        donor_row = VGroup(donor_a, plus_group, donor_b).arrange(RIGHT, buff=0.35, aligned_edge=UP)
        donor_row.move_to(ORIGIN + UP*0.85)

        self.play(FadeIn(donor_a, shift=RIGHT*0.15), run_time=0.5)
        self.play(FadeIn(plus_group, scale=0.9), run_time=0.3)
        self.play(FadeIn(donor_b, shift=LEFT*0.15), run_time=0.5)
        self.wait(0.2)

        # ── Fuse arrow + Fuse card ──
        fuse_arrow = cam_sketch_arrow(donor_row.get_bottom()+DOWN*0.08, donor_row.get_bottom()+DOWN*0.7, color=INK, stroke_width=4.5, with_tip=True)

        fuse_card_base = cam_card(width=4.2, height=1.0, accent_color=OKABE["green"], corner_radius=CORNER_RADIUS)
        fuse_icon = Text("\u25C6 fuse 48-d", font_size=20, color=TEXT, weight=BOLD)  # ◆
        fuse_eq = Text("(v_A + v_B)/2  ->  v_f  L2", font_size=16, color=SUBTLE_AAA)
        fuse_content = VGroup(fuse_icon, fuse_eq).arrange(DOWN, buff=0.08, aligned_edge=LEFT)
        fuse_content.move_to(fuse_card_base.get_center()).shift(DOWN*0.05 + RIGHT*0.1)
        fuse_card = VGroup(fuse_card_base, fuse_content)
        fuse_card.next_to(fuse_arrow, DOWN, buff=0.18)

        # Small L2 badge — high contrast ink on yellow (ADA 15:1)
        l2_badge_bg = RoundedRectangle(width=1.1, height=0.38, corner_radius=0.12, fill_color=OKABE["yellow"], fill_opacity=1.0, stroke_color=INK, stroke_width=INK_STROKE_WIDTH*0.5)
        l2_badge_text = Text("||v||=1", font_size=14, color=INK, weight=BOLD)
        l2_badge = VGroup(l2_badge_bg, l2_badge_text)
        l2_badge.move_to(fuse_card_base.get_corner(UP+RIGHT)).shift(LEFT*0.25 + DOWN*0.25)

        fuse_group = VGroup(fuse_card, l2_badge)

        self.play(GrowArrow(fuse_arrow), run_time=0.4)
        self.play(FadeIn(fuse_group, shift=UP*0.12), run_time=0.5)
        self.wait(0.3)

        # ── Nearest search arrow + visual field of 12,392 points (dots) ──
        search_arrow = cam_sketch_arrow(fuse_group.get_bottom()+DOWN*0.05, fuse_group.get_bottom()+DOWN*0.65, color=INK, stroke_width=3.5, with_tip=True)

        # Dots field representing 12,392 points — use ~120 dots as proxy, neobrutalist dots
        dots_field = VGroup()
        rng = np.random.default_rng(7)
        # create scatter proxy around center
        for _ in range(36):
            x = rng.uniform(-1.2, 1.2)
            y = rng.uniform(-0.35, 0.35)
            dot = Dot(point=[x, y, 0], radius=0.022, color=OKABE["sky"], fill_opacity=0.55, stroke_color=INK, stroke_width=1)
            dots_field.add(dot)
        dots_field.next_to(search_arrow, DOWN, buff=0.22)
        dots_field.shift(LEFT*1.1)

        dots_label = Text("12,392 pts on sphere (48-d)", font_size=14, color=SUBTLE_AAA)
        dots_label.next_to(dots_field, DOWN, buff=0.12)

        # Argmin code box — high contrast mono, ink on white, Okabe sky accent
        # Use cam_code_box but ensure readability
        formula_text_code = "argmin_r  || v_f - v_r ||_2"
        try:
            code_group = cam_code_box(formula_text_code, width=4.6, font_size=16, accent=OKABE["sky"])
        except Exception:
            # fallback manual card
            cb_base = cam_card(width=4.6, height=0.9, accent_color=OKABE["sky"], corner_radius=0.05)
            cb_text = Text(formula_text_code, font_size=16, color=TEXT, font="JetBrains Mono", weight=BOLD)
            cb_text.move_to(cb_base)
            code_group = VGroup(cb_base, cb_text)

        code_group.next_to(dots_field, RIGHT, buff=0.35)

        self.play(FadeIn(search_arrow), FadeIn(dots_field, shift=UP*0.1), FadeIn(dots_label), run_time=0.5)
        self.play(FadeIn(code_group, shift=LEFT*0.1), run_time=0.45)
        self.wait(0.25)

        # Highlight nearest — pick one dot, flash green, draw arrow to result
        target_dot = dots_field[16]
        target_highlight = Dot(point=target_dot.get_center(), radius=0.055, color=OKABE["green"], fill_opacity=1.0, stroke_color=INK, stroke_width=2.5)
        nearest_arrow = cam_sketch_arrow(code_group.get_right()+RIGHT*0.05, code_group.get_right()+RIGHT*0.05+RIGHT*1.0, color=INK, stroke_width=3.5, with_tip=True)
        nearest_arrow.put_start_and_end_on(code_group.get_right()+RIGHT*0.08, code_group.get_right()+RIGHT*0.85)

        # Result card — purple accent, checkmark triple encoded
        result_card_base = cam_card(width=3.1, height=1.05, accent_color=OKABE["purple"], corner_radius=CORNER_RADIUS)
        result_title = Text("\u2713 Chimera = real", font_size=20, color=TEXT, weight=BOLD)  # ✓
        result_sub = Text("nearest L2 among 12,392", font_size=14, color=SUBTLE_AAA)
        result_content = VGroup(result_title, result_sub).arrange(DOWN, buff=0.08, aligned_edge=LEFT)
        result_content.move_to(result_card_base.get_center()).shift(DOWN*0.04)
        result_card = VGroup(result_card_base, result_content)
        result_card.next_to(code_group, RIGHT, buff=0.9)

        # To ensure no overlap, shift dots_field etc if needed — ensure spacing >=0.2
        # Position result to right of code with buffer

        self.play(TransformFromCopy(target_dot, target_highlight), run_time=0.35)
        self.play(GrowArrow(nearest_arrow), run_time=0.35)
        self.play(FadeIn(result_card, shift=LEFT*0.15), run_time=0.45)
        self.wait(0.3)

        # ── Bottom footer formula box — full equation high contrast ──
        foot_formula = "Chimera(A,B) = argmin_{r in 12,392} || (f(A)+f(B))/2 - f(r) ||_2"
        foot_group_base = cam_card(width=10.2, height=0.85, accent_color=OKABE["verm"], corner_radius=0.06)
        foot_text = Text(foot_formula, font_size=18, color=TEXT, font="JetBrains Mono")
        foot_text.move_to(foot_group_base.get_center())
        foot_group = VGroup(foot_group_base, foot_text)
        foot_group.to_edge(DOWN, buff=0.32)

        # Game hint
        game_hint = Text("powers daily Chimera game  •  cosine = similarity", font_size=14, color=SUBTLE_AAA, font="JetBrains Mono")
        game_hint.next_to(foot_group, UP, buff=0.14)

        self.play(FadeIn(foot_group, shift=UP*0.12), FadeIn(game_hint, shift=UP*0.08), run_time=0.6)
        self.wait(2.0)

        # Outro fade to keep loop clean
        self.play(
            FadeOut(title_group, shift=UP*0.1),
            FadeOut(subtitle),
            FadeOut(donor_row),
            FadeOut(fuse_arrow), FadeOut(fuse_group),
            FadeOut(search_arrow), FadeOut(dots_field), FadeOut(dots_label),
            FadeOut(code_group), FadeOut(target_highlight), FadeOut(nearest_arrow),
            FadeOut(result_card),
            FadeOut(foot_group), FadeOut(game_hint),
            run_time=0.7
        )
        self.wait(0.8)
