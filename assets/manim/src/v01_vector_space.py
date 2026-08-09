"""
v01_vector_space — 14d era-z, per-100, MIN>=800, cleaning
Cam Authentic Style: #FFFEF7 paper, #E8E0C8 dots, neobrute 2px ink+3px shadow, Okabe-Ito flat, mono 24px+, captions 18px+ AAA
720p 16:9 auto-loop muted + SRT
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from cam_style import BG, CARD_FILL, INK, OKABE, SUBTLE_AAA, TEXT, SANS_STACK, MONO_STACK, SHADOW, apply_cam_style, cam_card, cam_label, add_blueprint_dots
try:
    from manim import *
    MANIM=True
except ImportError:
    MANIM=False
    Scene=object

class V01VectorSpace(Scene if MANIM else object):
    def construct(self):
        if not MANIM: return
        apply_cam_style(self, bg=BG, add_dots=True, check_ada=False)

        title = cam_card(width=7.2, height=1.25, accent_color=OKABE["blue"])
        title.to_edge(UP, buff=0.35)
        t1 = Text("01 · Vector Space — from boxscore to clean seasons", font_size=28, color=INK, font=SANS_STACK[0], weight=BOLD).move_to(title).shift(UP*0.18)
        t2 = Text("14d era-z • per-100 • MIN ≥ 800 • cleaning", font_size=16, color=SUBTLE_AAA, font=MONO_STACK[0]).next_to(t1, DOWN, buff=0.10)
        tg = VGroup(title, t1, t2)
        self.play(FadeIn(tg, shift=DOWN*0.12), run_time=0.55)
        self.wait(0.3)

        # pipeline 4 cards
        cards = VGroup()
        steps = [
            ("RAW", "CSV\n23 seasons", OKABE["verm"], "⬣"),
            ("MIN≥800", "≥10 mpg\nfilter bj", OKABE["orange"], "■"),
            ("PER-100", "pts ast reb\n/100 poss", OKABE["sky"], "▲"),
            ("ERA-Z", "14 dims\nz=(x-μ)/σ", OKABE["green"], "◆"),
        ]
        for name, desc, col, icon in steps:
            c = cam_card(width=2.75, height=1.55, accent_color=col)
            a = Text(f"{icon} {name}", font_size=18, color=INK, font=MONO_STACK[0], weight=BOLD)
            b = Text(desc, font_size=13, color=SUBTLE_AAA, font=MONO_STACK[0])
            VGroup(a,b).arrange(DOWN, buff=0.08).move_to(c)
            cards.add(VGroup(c,a,b))
        row = VGroup(*cards).arrange(RIGHT, buff=0.28)
        row.next_to(tg, DOWN, buff=0.45)
        arrows = VGroup(*[Arrow(cards[i].get_right()+RIGHT*0.02, cards[i+1].get_left()-LEFT*0.02, color=INK, stroke_width=4, buff=0.05, max_tip_length_to_length_ratio=0.14) for i in range(3)])

        self.play(FadeIn(row, shift=UP*0.10), run_time=0.6)
        self.play(*[GrowArrow(a) for a in arrows], run_time=0.4)
        self.wait(0.4)

        # cleaning detail
        clean = cam_card(width=7.8, height=1.15, accent_color=OKABE["yellow"])
        clean.next_to(row, DOWN, buff=0.40)
        ct = Text("clean: dup pid+season → latest • rookie 3yr? keep • Jr/Sr name+dob key • NaN→mask ∅", font_size=13, color=INK, font=MONO_STACK[0], weight=BOLD)
        ct.move_to(clean)
        footer = cam_label("12,966 careers • 14-d unit input ready for towers", font_size=18, mono=True, color=INK, bg_fill=CARD_FILL, with_border=True)
        footer.next_to(clean, DOWN, buff=0.18)

        self.play(FadeIn(clean, shift=UP*0.08), run_time=0.45)
        self.play(FadeIn(footer, shift=UP*0.05), run_time=0.35)
        self.wait(1.2)

        self.play(FadeOut(tg), FadeOut(row), FadeOut(arrows), FadeOut(clean), FadeOut(footer), run_time=0.45)

# captions reference
CAPTIONS = [
    (0.0, 2.0, "Every NBA season is a raw boxscore — noisy, pace-biased."),
    (2.0, 4.2, "We keep MIN >= 800 — about ten minutes per game minimum."),
    (4.2, 6.5, "Per-100 possession strips pace — points, assists, rebounds."),
    (6.5, 8.8, "Era-z normalizes fourteen dimensions — subtract era mean, divide sigma."),
    (8.8, 11.2, "Cleaning: dedup PID plus season, keep rookies, split Jr and Sr by name plus dob."),
    (11.2, 14.0, "Result — twelve thousand nine sixty six careers on a fourteen-d unit input."),
]

if __name__ == "__main__":
    pass
