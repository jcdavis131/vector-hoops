"""
v05_chimera — donor A + B fuse 48-d -> argmin cosine, deterministic LCG (seed*1103515245+12345)&0x7fffffff, same seed same puzzle
Note: earlier called 48-d fuse; MTNN v4 true is 64-d embedding fuse (we keep 64-d truthful, label 48-d legacy for compatibility)
Cam Authentic
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from cam_style import BG, CARD_FILL, INK, OKABE, SUBTLE_AAA, MONO_STACK, SANS_STACK, apply_cam_style, cam_card, cam_label, cam_code_box
try:
    from manim import *
    MANIM=True
except ImportError:
    MANIM=False
    Scene=object

class V05Chimera(Scene if MANIM else object):
    def construct(self):
        if not MANIM: return
        apply_cam_style(self, bg=BG)
        SAFE_TOP=3.2
        SAFE_BOTTOM=-3.0

        title_card=cam_card(width=5.2, height=0.9, accent_color=OKABE["orange"])
        title_card.to_edge(UP, buff=0.30)
        title=Text("05 · Chimera — A+B → closest real", font_size=24, color=INK, font=SANS_STACK[0], weight=BOLD).move_to(title_card)
        subtitle=Text("Donor A + Donor B → fuse 64-d → argmin cosine • LCG deterministic", font_size=12, color=SUBTLE_AAA, font=MONO_STACK[0]).next_to(title_card, DOWN, buff=0.10)
        self.play(FadeIn(title_card), FadeIn(title), FadeIn(subtitle), run_time=0.45)

        # donors
        donor_a=cam_card(width=2.45, height=1.05, accent_color=OKABE["blue"])
        da_t=Text("Donor A\nv_A=f(season)\n64-d |v|=1", font_size=12, color=INK, font=MONO_STACK[0], weight=BOLD)
        da_t.move_to(donor_a)
        dba=VGroup(donor_a,da_t)

        donor_b=cam_card(width=2.45, height=1.05, accent_color=OKABE["verm"])
        db_t=Text("Donor B\nv_B=f(season)\n64-d |v|=1", font_size=12, color=INK, font=MONO_STACK[0], weight=BOLD)
        db_t.move_to(donor_b)
        dbb=VGroup(donor_b,db_t)

        plus=Text("+", font_size=28, color=INK, weight=BOLD)

        row=VGroup(dba, plus, dbb).arrange(RIGHT, buff=0.32, aligned_edge=UP)
        row.move_to(ORIGIN+UP*1.0)
        self.play(FadeIn(row, shift=UP*0.08), run_time=0.5)

        arrow1=Arrow(row.get_bottom()+DOWN*0.05, row.get_bottom()+DOWN*0.4, color=INK, stroke_width=4, buff=0.02, max_tip_length_to_length_ratio=0.15)
        self.play(GrowArrow(arrow1), run_time=0.25)

        fuse=cam_card(width=3.8, height=0.85, accent_color=OKABE["green"])
        fuse.next_to(arrow1, DOWN, buff=0.12)
        ft=Text("fuse 64-d\n(v_A+v_B)/2 → v_f L2", font_size=12, color=INK, font=MONO_STACK[0], weight=BOLD)
        ft.move_to(fuse)
        self.play(FadeIn(fuse), FadeIn(ft), run_time=0.35)

        arrow2=Arrow(fuse.get_bottom()+DOWN*0.05, fuse.get_bottom()+DOWN*0.4, color=INK, stroke_width=4, buff=0.02, max_tip_length_to_length_ratio=0.15)
        self.play(GrowArrow(arrow2), run_time=0.25)

        lcg_card=cam_card(width=6.2, height=0.8, accent_color=OKABE["sky"])
        lcg_card.next_to(arrow2, DOWN, buff=0.12)
        lcg_t=Text("LCG seed'=(seed*1103515245+12345)&0x7fffffff  same seed=same puzzle", font_size=10, color=INK, font=MONO_STACK[0], weight=BOLD)
        lcg_t.move_to(lcg_card)
        self.play(FadeIn(lcg_card), FadeIn(lcg_t), run_time=0.35)

        arrow3=Arrow(lcg_card.get_bottom()+DOWN*0.05, lcg_card.get_bottom()+DOWN*0.35, color=INK, stroke_width=4, buff=0.02, max_tip_length_to_length_ratio=0.15)
        self.play(GrowArrow(arrow3), run_time=0.25)

        final=cam_card(width=8.0, height=1.15, accent_color=OKABE["blue"])
        final.next_to(arrow3, DOWN, buff=0.12)
        if final.get_bottom()[1] < SAFE_BOTTOM:
            row.shift(UP*0.4); arrow1.shift(UP*0.4); fuse.shift(UP*0.4); ft.shift(UP*0.4); arrow2.shift(UP*0.4); lcg_card.shift(UP*0.4); lcg_t.shift(UP*0.4); arrow3.shift(UP*0.4); final.shift(UP*0.4)
        f1=Text("Chimera(A,B)=argmin_r∈12,966 ||(f(A)+f(B))/2 - f(r)||₂", font_size=12, color=INK, font=MONO_STACK[0], weight=BOLD)
        f2=Text("powers daily game • cosine=similarity • 48-d legacy label = 64-d truthful MTNN v4", font_size=9, color=SUBTLE_AAA, font=MONO_STACK[0])
        VGroup(f1,f2).arrange(DOWN, buff=0.08).move_to(final)
        self.play(FadeIn(final), FadeIn(f1), FadeIn(f2), run_time=0.5)
        self.wait(1.3)
        self.play(FadeOut(title_card), FadeOut(title), FadeOut(subtitle), FadeOut(row), FadeOut(arrow1), FadeOut(fuse), FadeOut(ft), FadeOut(arrow2), FadeOut(lcg_card), FadeOut(lcg_t), FadeOut(arrow3), FadeOut(final), FadeOut(f1), FadeOut(f2), run_time=0.45)

CAPTIONS=[
    (0.0,2.0,"Pick two seasons — Donor A, Donor B — each a unit vector sixty-four dims."),
    (2.0,4.3,"Average them — divide by two — L2 renormalize — fused chimera vector."),
    (4.3,6.8,"Linear congruential — seed times eleven-o-three-five-one-five-two-four-five plus twelve-three-four-five mask — deterministic."),
    (6.8,9.5,"Same seed same puzzle — every player sees same daily Chimera — same-link same-stars."),
    (9.5,12.0,"Search twelve thousand nine sixty six reals — argmin cosine distance — closest real wins daily game."),
]

if __name__=="__main__":
    pass
