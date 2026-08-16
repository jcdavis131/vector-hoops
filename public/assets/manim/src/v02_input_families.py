"""
v02_input_families — 130 feats -> 17 towers cat([x·m,m]) masking pre-2013
Cam Authentic: warm paper #FFFEF7 dots #E8E0C8 white 2px ink+3px shadow Okabe flat mono 24px+ captions 18px+ AAA
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from cam_style import BG, CARD_FILL, INK, OKABE, SUBTLE_AAA, TEXT, SANS_STACK, MONO_STACK, SHADOW, apply_cam_style, cam_card, cam_label
try:
    from manim import *
    MANIM=True
except ImportError:
    MANIM=False
    Scene=object

# 130 feats breakdown — updated from 120 to include tracking+form+market extensions
FAMILIES = [
    ("volume", 10, OKABE["blue"]),
    ("playmaking", 10, OKABE["orange"]),
    ("rebounding", 8, OKABE["green"]),
    ("defense", 8, OKABE["verm"]),
    ("efficiency", 10, OKABE["purple"]),
    ("shotmix", 10, OKABE["sky"]),
    ("bio", 5, OKABE["yellow"]),
    ("tracking", 12, OKABE["blue"]),  # pre-2013 ∅
    ("form", 8, OKABE["orange"]),     # pre-2015 ∅ + expanded
    ("market", 6, OKABE["green"]),
    ("roster", 5, OKABE["verm"]),
    ("career", 6, OKABE["purple"]),
    ("competition", 6, OKABE["sky"]),
    ("team", 8, OKABE["yellow"]),
    ("pedigree", 5, OKABE["blue"]),
    ("playoffs", 7, OKABE["orange"]),
    ("honors", 6, OKABE["green"]),
]
assert sum(c for _,c,_ in FAMILIES) == 130

class V02InputFamilies(Scene if MANIM else object):
    def construct(self):
        if not MANIM: return
        apply_cam_style(self, bg=BG)
        title = cam_card(width=7.4, height=1.25, accent_color=OKABE["orange"])
        title.to_edge(UP, buff=0.32)
        t1 = Text("02 · 130 feats → 17 families → cat([x·m,m])", font_size=26, color=INK, font=SANS_STACK[0], weight=BOLD).move_to(title).shift(UP*0.16)
        t2 = Text("130 total • 17 towers • m∈{0,1} • ∅→0 grad 0 never imputed", font_size=14, color=SUBTLE_AAA, font=MONO_STACK[0]).next_to(t1, DOWN, buff=0.08)
        tg = VGroup(title,t1,t2)
        self.play(FadeIn(tg, shift=DOWN*0.12), run_time=0.55)

        chips=[]
        for name,cnt,col in FAMILIES:
            card = cam_card(width=2.05, height=0.52, accent_color=col)
            txt = Text(f"● {name} {cnt}", font_size=14, color=INK, font=MONO_STACK[0], weight=BOLD)
            txt.move_to(card)
            chips.append(VGroup(card,txt))

        col1=VGroup(*chips[0:6]).arrange(DOWN, buff=0.14, aligned_edge=LEFT)
        col2=VGroup(*chips[6:12]).arrange(DOWN, buff=0.14, aligned_edge=LEFT)
        col3=VGroup(*chips[12:]).arrange(DOWN, buff=0.14, aligned_edge=LEFT)
        grid=VGroup(col1,col2,col3).arrange(RIGHT, buff=0.22, aligned_edge=UP)
        grid.next_to(tg, DOWN, buff=0.35)
        grid.scale(0.92)
        self.play(FadeIn(grid, shift=UP*0.10), run_time=0.6)
        self.wait(0.3)

        # highlight masking
        hlA = SurroundingRectangle(chips[7], color=OKABE["verm"], stroke_width=4, buff=0.05)
        hlB = SurroundingRectangle(chips[8], color=OKABE["verm"], stroke_width=4, buff=0.05)
        empt1 = Text("∅ pre-2013", font_size=12, color=OKABE["verm"], font=MONO_STACK[0], weight=BOLD).next_to(chips[7], RIGHT, buff=0.10)
        empt2 = Text("∅ pre-2015", font_size=12, color=OKABE["verm"], font=MONO_STACK[0], weight=BOLD).next_to(chips[8], RIGHT, buff=0.10)

        self.play(Create(hlA), Create(hlB), FadeIn(empt1), FadeIn(empt2), run_time=0.45)
        self.wait(0.4)

        cat_card = cam_card(width=7.6, height=1.6, accent_color=OKABE["green"])
        cat_card.to_edge(DOWN, buff=0.55)
        lx = Text("x_i ∈ R^d  →  m∈{0,1}^d", font_size=16, color=INK, font=MONO_STACK[0], weight=BOLD)
        ly = Text("cat([x·m, m]) → 2·d_in per tower • grad=0 when ∅ • era-safe", font_size=13, color=SUBTLE_AAA, font=MONO_STACK[0])
        lz = Text("never impute — tell the model what's missing", font_size=12, color=INK, font=MONO_STACK[0])
        VGroup(lx,ly,lz).arrange(DOWN, buff=0.08).move_to(cat_card)
        cg = VGroup(cat_card,lx,ly,lz)
        self.play(FadeIn(cg, shift=UP*0.08), run_time=0.5)
        self.wait(1.1)
        self.play(FadeOut(tg),FadeOut(grid),FadeOut(hlA),FadeOut(hlB),FadeOut(empt1),FadeOut(empt2),FadeOut(cg), run_time=0.45)

CAPTIONS = [
    (0.0,2.2,"One hundred thirty features — from volume to honors — grouped into seventeen families."),
    (2.2,4.8,"Each family gets its own tower — no cross-contamination at input."),
    (4.8,7.0,"Tracking is empty before 2013 — form before 2015 — we don't guess."),
    (7.0,9.5,"Mask m is zero or one — cat of x times m and m — twice the width, twice the honesty."),
    (9.5,12.0,"Gradient zero when missing — tower learns to ignore, never impute — era safe."),
]

if __name__=="__main__":
    pass
