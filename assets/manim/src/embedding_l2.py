"""
EmbeddingL2 — Cam authentic style, light paper, neobrutalist
Truthful v4 invariants: 544+12=556→128→48 L2, 12,392 pts on sphere, cos=v̂·ŵ
Solo personal project, no connection to employer, built with public/free-tier only
"""
from manim import *
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from cam_style import (
    BG, INK, CARD_FILL, PAPER_DOT, SHADOW, TEXT, SUBTLE_AAA,
    OKABE, TITLE_SIZE, LABEL_SIZE, CODE_SIZE, CAPTION_SIZE,
    INK_STROKE_WIDTH, SHADOW_OFFSET_X, SHADOW_OFFSET_Y, CORNER_RADIUS,
    apply_cam_style, cam_card, cam_label, cam_code_box,
    get_grid_position, MONO_STACK, SANS_STACK,
)

class EmbeddingL2(Scene):
    def construct(self):
        apply_cam_style(self, bg=BG, add_dots=True, check_ada=False)

        # ── Title card ──
        title_card = cam_card(width=5.9, height=1.15, accent_color=OKABE["blue"])
        title_card.to_edge(UP, buff=0.32)
        t1 = Text("48-d → L2 → unit sphere", font_size=26, color=INK, font=SANS_STACK[0], weight=BOLD)
        t1.move_to(title_card).shift(UP*0.20)
        t2 = Text("544+12=556 → 128 → 48  L2 • 12,392 careers", font_size=14, color=SUBTLE_AAA, font=MONO_STACK[0])
        t2.next_to(t1, DOWN, buff=0.08)
        title_group = VGroup(title_card, t1, t2)

        self.play(FadeIn(title_group, shift=DOWN*0.12), run_time=0.55)
        self.wait(0.25)

        # ── Sphere center ──
        sphere_center = ORIGIN + DOWN*0.25
        sphere_radius = 1.95

        # Subtle axes — very light, blueprint feel, no glow
        ax_h = Line(
            sphere_center + LEFT*sphere_radius*1.18,
            sphere_center + RIGHT*sphere_radius*1.18,
            stroke_width=2.2, color=PAPER_DOT, stroke_opacity=0.9
        )
        ax_v = Line(
            sphere_center + DOWN*sphere_radius*1.18,
            sphere_center + UP*sphere_radius*1.18,
            stroke_width=2.2, color=PAPER_DOT, stroke_opacity=0.9
        )
        # Dashed hint for interior
        base_circle = Circle(radius=sphere_radius, color=INK, stroke_width=6, stroke_opacity=1, fill_opacity=0).move_to(sphere_center)
        # faint inner dashed circle for slice cue
        dashed_circle = DashedVMobject(
            Circle(radius=sphere_radius, color=INK, stroke_width=1.8, stroke_opacity=0.35).move_to(sphere_center),
            num_dashes=28, dashed_ratio=0.55
        )
        dashed_circle.set_z_index(-1)

        origin_dot = Dot(sphere_center, color=INK, radius=0.055)
        slice_chip = cam_label("2D slice of 48-d  •  ||v̂||=1", font_size=12, color=INK, mono=True, bg_fill=CARD_FILL, with_border=True)
        slice_chip.next_to(base_circle, DOWN, buff=0.14)
        slice_chip.set_z_index(3)

        # ── Vectors ──
        v_angle = 34 * DEGREES
        w_angle = -28 * DEGREES

        v_raw_len = sphere_radius * 1.58
        v_raw_end = sphere_center + v_raw_len * np.array([np.cos(v_angle), np.sin(v_angle), 0])
        v_norm_end = sphere_center + sphere_radius * np.array([np.cos(v_angle), np.sin(v_angle), 0])
        w_end = sphere_center + sphere_radius * np.array([np.cos(w_angle), np.sin(w_angle), 0])

        # Raw arrow (vermillion) — longer
        v_raw = Arrow(
            sphere_center, v_raw_end, buff=0.02,
            color=OKABE["verm"], stroke_width=7, stroke_opacity=1,
            tip_length=0.22, max_tip_length_to_length_ratio=0.11
        )
        # Add ink outline via background stroke? Simulate with slightly larger black arrow behind
        v_raw_outline = Arrow(
            sphere_center, v_raw_end, buff=0.015,
            color=INK, stroke_width=10, stroke_opacity=1,
            tip_length=0.24, max_tip_length_to_length_ratio=0.11
        )
        v_raw_group = VGroup(v_raw_outline, v_raw)

        # Normalized arrows (blue / sky) with ink outline behind
        def ink_arrow(end, col):
            outline = Arrow(sphere_center, end, buff=0.015, color=INK, stroke_width=10, tip_length=0.22, max_tip_length_to_length_ratio=0.11)
            fg = Arrow(sphere_center, end, buff=0.02, color=col, stroke_width=7, tip_length=0.20, max_tip_length_to_length_ratio=0.11)
            return VGroup(outline, fg), fg

        v_norm_out_fg_group, v_norm_fg = ink_arrow(v_norm_end, OKABE["blue"])
        w_out_fg_group, w_fg = ink_arrow(w_end, OKABE["sky"])

        # Labels as Cam chips — white card ink border + colored dot triple encoding
        def make_vec_chip(icon, txt_str, col, pos_anchor):
            dot = Circle(radius=0.085, fill_color=col, fill_opacity=1, stroke_color=INK, stroke_width=2.5)
            txt = Text(f"{icon} {txt_str}", font_size=15, color=INK, font=MONO_STACK[0], weight=BOLD)
            txt.next_to(dot, RIGHT, buff=0.08)
            chip_bg = RoundedRectangle(
                width=txt.width + dot.width + 0.38,
                height=0.36,
                corner_radius=0.08,
                fill_color=CARD_FILL, fill_opacity=1,
                stroke_color=INK, stroke_width=3.2
            )
            # shadow
            sh = RoundedRectangle(
                width=chip_bg.width, height=chip_bg.height,
                corner_radius=0.08,
                fill_color=SHADOW, fill_opacity=1, stroke_width=0
            ).shift([0.06, -0.06, 0])
            chip = VGroup(sh, chip_bg, dot, txt)
            # place: dot+txt centered in bg then whole offset
            g = VGroup(dot, txt)
            g.move_to(chip_bg)
            chip = VGroup(sh, chip_bg, g)
            chip.move_to(pos_anchor)
            return chip

        v_raw_chip = make_vec_chip("⬣", "v in R48 128→48", OKABE["verm"], v_raw_end + RIGHT*1.1 + UP*0.05)
        v_hat_chip = make_vec_chip("⬣", "v̂  ||v̂||=1", OKABE["blue"], v_norm_end + RIGHT*0.78 + UP*0.12)
        w_hat_chip = make_vec_chip("●", "ŵ on sphere", OKABE["sky"], w_end + RIGHT*0.78 + DOWN*0.12)

        # v_sub mono small inside raw label
        v_sub = Text("fusion 556→128→48", font_size=11, color=SUBTLE_AAA, font=MONO_STACK[0])
        v_sub.next_to(v_raw_chip, DOWN, buff=0.06).align_to(v_raw_chip, LEFT)

        # ── L2 formula code box — bottom center
        l2_txt = "||v||=√Σv_i²   v̂=v/||v||"
        l2_code_group = cam_code_box(l2_txt, width=4.2, font_size=16, accent=OKABE["sky"])
        l2_code_group.to_edge(DOWN, buff=0.58)
        l2_code_group.set_x(-1.1)

        l2_second = Text("||v̂|| = 1", font_size=18, color=OKABE["blue"], font=MONO_STACK[0], weight=BOLD)
        l2_second.next_to(l2_code_group, RIGHT, buff=0.28)

        cos_txt = "cos θ = v̂·ŵ"
        cos_box = cam_code_box(cos_txt, width=2.8, font_size=18, accent=OKABE["yellow"])
        cos_box.to_edge(DOWN, buff=0.58)
        cos_box.set_x(-1.1)
        cos_box.set_opacity(0) # we'll fade in later

        # ── Angle arc (yellow #F0E442 with ink text)
        arc = Arc(radius=0.62, start_angle=w_angle, angle=v_angle-w_angle, arc_center=sphere_center, color=OKABE["yellow"], stroke_width=7)
        # ink outline for arc: thicker black behind
        arc_outline = Arc(radius=0.62, start_angle=w_angle, angle=v_angle-w_angle, arc_center=sphere_center, color=INK, stroke_width=10)
        arc_group = VGroup(arc_outline, arc)

        mid_angle = (v_angle + w_angle)/2
        theta_pos = sphere_center + 0.92*np.array([np.cos(mid_angle), np.sin(mid_angle), 0])
        # theta chip — ink on yellow (ADA 15:1)
        theta_bg = RoundedRectangle(width=0.58, height=0.32, corner_radius=0.06, fill_color=OKABE["yellow"], fill_opacity=1, stroke_color=INK, stroke_width=3)
        theta_txt = Text("θ", font_size=18, color=INK, font=SANS_STACK[0], weight=BOLD).move_to(theta_bg)
        theta_chip = VGroup(theta_bg, theta_txt).move_to(theta_pos)

        # similarity legend — bottom right
        sim_row_bg = cam_card(width=3.15, height=0.62, accent_color=OKABE["green"])
        sim_row_bg.next_to(cos_box, RIGHT, buff=0.28)
        sim_t1 = Text("∼1 close", font_size=11, color=OKABE["green"], font=MONO_STACK[0], weight=BOLD)
        sim_t2 = Text("∼0 orthog", font_size=11, color=SUBTLE_AAA, font=MONO_STACK[0])
        sim_t3 = Text("∼-1 opp", font_size=11, color=OKABE["verm"], font=MONO_STACK[0])
        sim_row = VGroup(sim_t1, sim_t2, sim_t3).arrange(RIGHT, buff=0.22).move_to(sim_row_bg)
        sim_group = VGroup(sim_row_bg, sim_row)
        sim_group.set_opacity(0)

        # Footer — 12,392 pts
        footer_card = cam_card(width=2.55, height=0.48, accent_color=OKABE["purple"])
        footer_card.to_edge(DOWN, buff=0.1)
        footer_card.set_x(0)
        footer_txt = Text("⬢ 12,392 pts on sphere", font_size=12, color=INK, font=MONO_STACK[0], weight=BOLD).move_to(footer_card)

        final_footer_group = VGroup(footer_card, footer_txt)

        # ── Animation timeline ~6.9s ──
        # 0.0-0.85
        self.play(
            Create(ax_h), Create(ax_v),
            Create(dashed_circle), Create(base_circle),
            FadeIn(origin_dot), FadeIn(slice_chip, shift=UP*0.05),
            run_time=0.72
        )
        # 0.85-1.9
        self.play(
            FadeIn(v_raw_group, shift=RIGHT*0.08),
            FadeIn(v_raw_chip, shift=LEFT*0.08),
            FadeIn(v_sub, shift=UP*0.05),
            FadeIn(l2_code_group, shift=UP*0.08),
            FadeIn(l2_second, shift=UP*0.05),
            run_time=0.62
        )
        self.wait(0.18)

        # 1.9-3.1 normalize shrink
        self.play(
            Transform(v_raw_group, v_norm_out_fg_group),
            FadeOut(v_sub),
            FadeTransform(v_raw_chip, v_hat_chip),
            l2_code_group.animate.set_opacity(0.35),
            l2_second.animate.set_opacity(1),
            run_time=0.72
        )
        self.play(Flash(v_norm_end, color=OKABE["blue"], flash_radius=0.24, line_length=0.07), run_time=0.18)
        self.wait(0.08)

        # 3.1-4.2 w + angle
        self.play(FadeIn(w_out_fg_group, shift=UP*0.08), FadeIn(w_hat_chip, shift=LEFT*0.08), run_time=0.42)
        self.play(Create(arc_group), FadeIn(theta_chip, scale=0.88), run_time=0.34)

        # 4.2-5.4 cos
        self.play(
            FadeOut(l2_code_group), FadeOut(l2_second),
            FadeIn(cos_box, shift=UP*0.08),
            FadeIn(sim_group, shift=UP*0.06),
            run_time=0.52
        )
        self.wait(0.32)

        # 5.4-6.4 show dots + final footer
        v_dot = Dot(v_norm_end, radius=0.07, color=OKABE["blue"], fill_opacity=1, stroke_color=INK, stroke_width=2)
        w_dot = Dot(w_end, radius=0.07, color=OKABE["sky"], fill_opacity=1, stroke_color=INK, stroke_width=2)
        self.play(FadeIn(v_dot), FadeIn(w_dot), FadeIn(final_footer_group, shift=UP*0.06), run_time=0.38)
        self.wait(0.85)

        # fade out clean
        self.play(
            FadeOut(title_group), FadeOut(ax_h), FadeOut(ax_v),
            FadeOut(base_circle), FadeOut(dashed_circle), FadeOut(origin_dot), FadeOut(slice_chip),
            FadeOut(v_raw_group), FadeOut(v_norm_out_fg_group), FadeOut(w_out_fg_group),
            FadeOut(v_hat_chip), FadeOut(w_hat_chip), FadeOut(arc_group), FadeOut(theta_chip),
            FadeOut(cos_box), FadeOut(sim_group), FadeOut(final_footer_group),
            FadeOut(v_dot), FadeOut(w_dot),
            run_time=0.45
        )
        self.wait(0.15)
