"""InputFamilies — MTNN v4 truthful explainer
120 feats → 17 families, masking x·m m∈{0,1}, cat([x·m,m]) → 2·d_in per tower
Solo personal project, no connection to employer, free-tier only, 480p15 <10s
"""
from manim import *

# Okabe-Ito AAA palette — colorblind safe
OKABE = {
    "orange": "#E69F00",
    "sky": "#56B4E9",
    "green": "#009E73",
    "yellow": "#F0E442",
    "blue": "#0072B2",
    "verm": "#D55E00",
    "purple": "#CC79A7",
    "gray": "#999999",
}
BG = "#0a0a0a"

FAMILIES = [
    ("volume", 10),
    ("playmaking", 10),
    ("rebounding", 8),
    ("defense", 8),
    ("efficiency", 8),
    ("shotmix", 10),
    ("bio", 5),
    ("tracking", 12),  # masked pre-2013
    ("form", 6),       # masked pre-2015
    ("market", 4),
    ("roster", 5),
    ("career", 6),
    ("competition", 6),
    ("team", 8),
    ("pedigree", 4),
    ("playoffs", 5),
    ("honors", 5),
]
# check sum 120
assert sum(c for _, c in FAMILIES) == 120

COLOR_CYCLE = [
    OKABE["blue"], OKABE["orange"], OKABE["green"], OKABE["verm"],
    OKABE["purple"], OKABE["sky"], OKABE["yellow"], OKABE["blue"],
    OKABE["orange"], OKABE["green"], OKABE["verm"], OKABE["purple"],
    OKABE["sky"], OKABE["yellow"], OKABE["blue"], OKABE["orange"], OKABE["green"]
]

class InputFamilies(Scene):
    def construct(self):
        self.camera.background_color = BG

        # --- Title ---
        title = Text("120 feats → 17 families", font_size=36, weight=BOLD, color=WHITE).to_edge(UP, buff=0.4)
        subtitle = Text("MTNN v4  per-100 zσ  cat([x·m,m])", font_size=18, color=OKABE["gray"]).next_to(title, DOWN, buff=0.15)
        self.play(FadeIn(title, shift=DOWN*0.2), FadeIn(subtitle), run_time=0.6)
        self.wait(0.4)

        # --- Families grid ---
        # Build rows: each row = dot icon + label + count badge + dots strip
        rows = VGroup()
        for idx, (name, cnt) in enumerate(FAMILIES):
            col = COLOR_CYCLE[idx % len(COLOR_CYCLE)]
            # icon shape triple-encoding: cycle shapes ● ■ ▲ ◆ (using unicode via Text for simplicity)
            shapes = ["●", "■", "▲", "◆"]
            shape_char = shapes[idx % len(shapes)]
            icon = Text(shape_char, font_size=16, color=col)
            label = Text(f"{name}", font_size=14, color=WHITE)
            count_badge = Text(f"{cnt}", font_size=14, weight=BOLD, color=col)
            # dots strip: cnt dots mini
            dots = VGroup(*[Dot(radius=0.045, color=col, fill_opacity=0.95) for _ in range(cnt)])
            dots.arrange(RIGHT, buff=0.05)
            # row assemble
            row = VGroup(icon, label, count_badge, dots)
            row.arrange(RIGHT, buff=0.12)
            rows.add(row)

        # Arrange in 2 columns: 9 left, 8 right
        left_rows = VGroup(*rows[:9]).arrange(DOWN, aligned_edge=LEFT, buff=0.12)
        right_rows = VGroup(*rows[9:]).arrange(DOWN, aligned_edge=LEFT, buff=0.12)
        grid = VGroup(left_rows, right_rows).arrange(RIGHT, buff=0.6, aligned_edge=UP)
        grid.scale(0.85)
        grid.next_to(subtitle, DOWN, buff=0.35)

        self.play(FadeIn(grid, shift=UP*0.2), run_time=0.8)
        self.wait(0.8)

        # --- Masking step ---
        # Highlight tracking (index 7) and form (index 8) as historically masked
        # rows[7] = tracking 12, rows[8]=form 6
        tracking_row = rows[7]
        form_row = rows[8]

        # Create mask indicators
        mask_eq = Text("x · m   where   m ∈ {0,1}", font_size=22, color=WHITE, weight=BOLD).to_edge(DOWN, buff=1.0)
        mask_note = Text("tracking pre-2013  form pre-2015  →  ∅ masked as 0", font_size=14, color=OKABE["gray"]).next_to(mask_eq, DOWN, buff=0.12)

        # Dim effect: reduce opacity of tracking + form dots
        tracking_dots = tracking_row[3]
        form_dots = form_row[3]

        self.play(
            tracking_dots.animate.set_fill(opacity=0.15).set_stroke(opacity=0.15),
            form_dots.animate.set_fill(opacity=0.15).set_stroke(opacity=0.15),
            FadeIn(mask_eq),
            FadeIn(mask_note),
            run_time=0.7
        )
        # Add ∅ symbols over masked rows
        empty_sym1 = Text("∅", font_size=18, color=OKABE["yellow"], weight=BOLD).move_to(tracking_dots.get_center())
        empty_sym2 = Text("∅", font_size=18, color=OKABE["yellow"], weight=BOLD).move_to(form_dots.get_center())
        self.play(FadeIn(empty_sym1), FadeIn(empty_sym2), run_time=0.4)
        self.wait(0.6)

        # --- cat([x·m,m]) ---
        self.play(
            FadeOut(mask_eq), FadeOut(mask_note),
            FadeOut(empty_sym1), FadeOut(empty_sym2),
            FadeOut(grid),
            run_time=0.5
        )

        # Visual cat operation
        # Two blocks: [x·m] and [m] concatenated
        block_width = 2.2
        block_height = 0.6
        block1 = RoundedRectangle(width=block_width, height=block_height, corner_radius=0.12, color=OKABE["blue"], fill_opacity=0.25, stroke_width=2)
        block1_label = Text("[x·m]", font_size=20, color=WHITE, weight=BOLD).move_to(block1)
        block1_group = VGroup(block1, block1_label)

        block2 = RoundedRectangle(width=block_width*0.7, height=block_height, corner_radius=0.12, color=OKABE["orange"], fill_opacity=0.25, stroke_width=2)
        block2_label = Text("[m]", font_size=20, color=WHITE, weight=BOLD).move_to(block2)
        block2_group = VGroup(block2, block2_label)

        cat_label = Text("cat", font_size=16, color=OKABE["gray"]).next_to(VGroup(block1_group, block2_group), UP, buff=0.15)
        plus = Text("+", font_size=20, color=OKABE["gray"])

        top_row = VGroup(block1_group, plus, block2_group).arrange(RIGHT, buff=0.2)
        top_row.move_to(ORIGIN).shift(UP*0.3)

        arrow = Arrow(start=top_row.get_bottom()+DOWN*0.1, end=top_row.get_bottom()+DOWN*0.9, color=WHITE, stroke_width=4, buff=0.1)
        result_text = Text("cat([x·m,m]) → 2·d_in per tower", font_size=24, weight=BOLD, color=WHITE).next_to(arrow, DOWN, buff=0.2)
        check = Text("✓ era-safe  missing → 0 + flag", font_size=16, color=OKABE["green"]).next_to(result_text, DOWN, buff=0.15)

        # Animate cat build
        self.play(FadeIn(top_row), run_time=0.5)
        self.play(GrowArrow(arrow), run_time=0.4)
        self.play(FadeIn(result_text), run_time=0.4)
        self.play(FadeIn(check), run_time=0.3)
        self.wait(1.2)

        # End hold for loop
        self.wait(0.5)
