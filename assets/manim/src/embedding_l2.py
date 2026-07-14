from manim import *

# Solo personal project, no connection to employer, built with public/free-tier only
# Okabe-Ito AAA, #121210 bg, truthful v4 invariants

OKABE = {
    "blue": "#56B4E9",
    "verm": "#D55E00",
    "green": "#009E73",
    "orange": "#E69F00",
    "white": "#FEFEFE",
    "gray": "#8A8A8A",
    "black": "#121210",
}

class EmbeddingL2(Scene):
    def construct(self):
        self.camera.background_color = OKABE["black"]

        title = Text("48-d → L2 → unit sphere", font_size=30, color=WHITE, weight=BOLD).to_edge(UP, buff=0.28)
        subtitle = Text("544+12=556 → 128 → 48 L2 • ~224K • 12,392 seasons", font_size=13, color=GRAY_B).next_to(title, DOWN, buff=0.07)

        sphere_center = ORIGIN + DOWN*0.15
        sphere_radius = 2.05
        sphere_circle = Circle(radius=sphere_radius, color=WHITE, stroke_width=2.5, stroke_opacity=0.9).move_to(sphere_center)
        sphere_dashed = DashedVMobject(sphere_circle.copy().set_stroke(width=1.5, opacity=0.4), num_dashes=32, dashed_ratio=0.6)
        sphere_dashed.set_color(GREY_B)

        slice_label = Text("2D slice of 48-d sphere • ||v=1", font_size=12, color=GRAY_B).next_to(sphere_circle, DOWN, buff=0.12)
        origin_dot = Dot(sphere_center, color=WHITE, radius=0.055)
        ax_h = Line(sphere_center+LEFT*sphere_radius*1.18, sphere_center+RIGHT*sphere_radius*1.18, stroke_width=1, color=GRAY, stroke_opacity=0.25)
        ax_v = Line(sphere_center+DOWN*sphere_radius*1.18, sphere_center+UP*sphere_radius*1.18, stroke_width=1, color=GRAY, stroke_opacity=0.25)

        v_angle = 34*DEGREES
        v_raw_len = sphere_radius*1.55
        v_raw_end = sphere_center + v_raw_len*np.array([np.cos(v_angle), np.sin(v_angle), 0])
        v_raw = Arrow(sphere_center, v_raw_end, buff=0.02, color=OKABE["verm"], stroke_width=6, max_tip_length_to_length_ratio=0.09)
        v_label = Text("v in R48 (128->48)", font_size=16, color=OKABE["verm"]).next_to(v_raw_end, RIGHT, buff=0.08)
        v_sub = Text("fusion 556->128->48", font_size=11, color=GRAY_B).next_to(v_label, DOWN, buff=0.04).align_to(v_label, LEFT)

        l2_formula = Text("||v|| = sqrt(sum v_i^2)   v^ = v / ||v||", font_size=20, color=WHITE).to_edge(DOWN, buff=0.5)
        l2_formula2 = Text("||v^|| = 1", font_size=24, color=OKABE["green"]).next_to(l2_formula, UP, buff=0.12)
        l2_formula2.set_opacity(0)

        w_angle = -30*DEGREES
        w_end = sphere_center + sphere_radius*np.array([np.cos(w_angle), np.sin(w_angle), 0])
        w_arrow = Arrow(sphere_center, w_end, buff=0.02, color=OKABE["blue"], stroke_width=6, max_tip_length_to_length_ratio=0.09)
        w_label = Text("w^", font_size=18, color=OKABE["blue"]).next_to(w_end, RIGHT+DOWN, buff=0.06)

        arc = Arc(radius=0.65, start_angle=w_angle, angle=v_angle - w_angle, arc_center=sphere_center, color=OKABE["orange"], stroke_width=4)
        theta_label = Text("theta", font_size=18, color=OKABE["orange"]).move_to(sphere_center + 0.9*np.array([np.cos((v_angle+w_angle)/2), np.sin((v_angle+w_angle)/2), 0]))

        cos_formula = Text("cos theta = v^ . w^", font_size=22, color=WHITE).to_edge(DOWN, buff=0.5)
        sim_row = VGroup(
            Text("~1 close", font_size=13, color=OKABE["green"]),
            Text("~0 orthog", font_size=13, color=GRAY_B),
            Text("~-1 opposite", font_size=13, color=OKABE["verm"]),
        ).arrange(RIGHT, buff=0.32).next_to(cos_formula, UP, buff=0.1)

        final_line = Text("cosine = similarity - Chimera + Era Twin - 12,392 pts on sphere", font_size=13, color=WHITE).to_edge(DOWN, buff=0.22)

        self.add(title, subtitle)
        self.play(Create(ax_h), Create(ax_v), Create(sphere_dashed), Create(sphere_circle), FadeIn(origin_dot), FadeIn(slice_label), run_time=0.85)

        self.play(GrowArrow(v_raw), FadeIn(v_label), FadeIn(v_sub), run_time=0.6)
        self.play(FadeIn(l2_formula, shift=UP*0.1), run_time=0.45)
        self.wait(0.25)

        v_norm_end = sphere_center + sphere_radius*np.array([np.cos(v_angle), np.sin(v_angle), 0])
        v_norm = Arrow(sphere_center, v_norm_end, buff=0.02, color=OKABE["green"], stroke_width=6, max_tip_length_to_length_ratio=0.09)
        vhat_label = Text("v^  ||v^||=1", font_size=16, color=OKABE["green"]).next_to(v_norm_end, UP+RIGHT, buff=0.06)

        self.play(
            Transform(v_raw, v_norm),
            FadeTransform(v_label, vhat_label),
            FadeOut(v_sub),
            l2_formula.animate.set_opacity(0.35),
            l2_formula2.animate.set_opacity(1),
            run_time=0.75
        )
        self.play(Flash(v_norm_end, color=OKABE["green"], flash_radius=0.28, line_length=0.08), run_time=0.25)
        self.wait(0.15)

        self.play(GrowArrow(w_arrow), FadeIn(w_label), run_time=0.45)
        self.play(Create(arc), FadeIn(theta_label), run_time=0.35)
        self.play(
            FadeOut(l2_formula), FadeOut(l2_formula2),
            FadeIn(cos_formula, shift=UP*0.08),
            FadeIn(sim_row, shift=UP*0.08),
            run_time=0.55
        )
        self.wait(0.35)

        v_dot = Dot(v_norm_end, color=OKABE["green"], radius=0.075)
        w_dot = Dot(w_end, color=OKABE["blue"], radius=0.075)
        self.play(FadeIn(v_dot), FadeIn(w_dot), v_raw.animate.set_color(WHITE), w_arrow.animate.set_color(WHITE), run_time=0.35)

        self.play(FadeOut(sim_row), FadeOut(theta_label), FadeOut(arc), FadeIn(final_line, shift=UP*0.08), run_time=0.45)
        self.wait(0.9)
