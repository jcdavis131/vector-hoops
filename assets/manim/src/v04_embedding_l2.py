"""
v04_embedding_l2 — v̂=v/||v||, ||v̂||=1, cos=v̂·ŵ, 12,966 on sphere, Era Twin + nearest real
Cam Authentic
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from cam_style import BG, CARD_FILL, INK, OKABE, SUBTLE_AAA, MONO_STACK, SANS_STACK, SHADOW, apply_cam_style, cam_card, cam_label
try:
    from manim import *
    MANIM=True
except ImportError:
    MANIM=False
    Scene=object

class V04EmbeddingL2(Scene if MANIM else object):
    def construct(self):
        if not MANIM: return
        apply_cam_style(self, bg=BG)
        title=cam_card(width=6.2, height=1.15, accent_color=OKABE["blue"])
        title.to_edge(UP, buff=0.32)
        t1=Text("04 · L2 — 64→unit sphere — cos=v̂·ŵ", font_size=24, color=INK, font=SANS_STACK[0], weight=BOLD).move_to(title).shift(UP*0.16)
        t2=Text("v̂=v/||v|| • ||v̂||=1 • 12,966 • Era Twin + nearest", font_size=12, color=SUBTLE_AAA, font=MONO_STACK[0]).next_to(t1,DOWN,buff=0.06)
        tg=VGroup(title,t1,t2)
        self.play(FadeIn(tg, shift=DOWN*0.10), run_time=0.5)

        sphere_center=ORIGIN+DOWN*0.2
        r=1.9
        base=Circle(radius=r, color=INK, stroke_width=6).move_to(sphere_center)
        dashed=DashedVMobject(Circle(radius=r, color=INK, stroke_width=1.6, stroke_opacity=0.32).move_to(sphere_center), num_dashes=26, dashed_ratio=0.5)
        axH=Line(sphere_center+LEFT*r*1.15, sphere_center+RIGHT*r*1.15, color="#E8E0C8", stroke_width=2.0)
        axV=Line(sphere_center+DOWN*r*1.15, sphere_center+UP*r*1.15, color="#E8E0C8", stroke_width=2.0)
        origin=Dot(sphere_center, radius=0.05, color=INK)

        self.play(Create(axH), Create(axV), Create(dashed), Create(base), FadeIn(origin), run_time=0.6)

        v_ang=32*DEGREES
        w_ang=-26*DEGREES
        v_raw_len=r*1.55
        v_raw_end=sphere_center+v_raw_len*np.array([np.cos(v_ang), np.sin(v_ang),0])
        v_end=sphere_center+r*np.array([np.cos(v_ang), np.sin(v_ang),0])
        w_end=sphere_center+r*np.array([np.cos(w_ang), np.sin(w_ang),0])

        def ink_arrow(end, col):
            out=Arrow(sphere_center, end, buff=0.015, color=INK, stroke_width=10, tip_length=0.20, max_tip_length_to_length_ratio=0.11)
            fg=Arrow(sphere_center, end, buff=0.02, color=col, stroke_width=6, tip_length=0.18, max_tip_length_to_length_ratio=0.11)
            return VGroup(out,fg)

        v_raw_g=ink_arrow(v_raw_end, OKABE["verm"])
        v_g=ink_arrow(v_end, OKABE["blue"])
        w_g=ink_arrow(w_end, OKABE["sky"])

        v_raw_chip=cam_label("⬣ v in R64 556→128→64", font_size=14, mono=True, color=INK, bg_fill=CARD_FILL, with_border=True)
        v_raw_chip.move_to(v_raw_end+RIGHT*1.05)

        v_chip=cam_label("⬣ v̂ ||v̂||=1", font_size=14, mono=True, color=INK, bg_fill=CARD_FILL, with_border=True)
        v_chip.move_to(v_end+RIGHT*0.75+UP*0.10)
        w_chip=cam_label("● ŵ on sphere", font_size=14, mono=True, color=INK, bg_fill=CARD_FILL, with_border=True)
        w_chip.move_to(w_end+RIGHT*0.75+DOWN*0.10)

        l2_card=cam_card(width=3.8, height=0.55, accent_color=OKABE["sky"])
        l2_card.to_edge(DOWN, buff=0.55)
        l2_card.set_x(-1.2)
        l2_txt=Text("||v||=√Σv²  v̂=v/||v||", font_size=13, color=INK, font=MONO_STACK[0], weight=BOLD).move_to(l2_card)
        self.play(FadeIn(v_raw_g), FadeIn(v_raw_chip), FadeIn(l2_card), FadeIn(l2_txt), run_time=0.5)

        norm_txt=Text("||v̂||=1", font_size=16, color=OKABE["blue"], font=MONO_STACK[0], weight=BOLD).next_to(l2_card, RIGHT, buff=0.22)
        self.play(Transform(v_raw_g, v_g), FadeTransform(v_raw_chip, v_chip), FadeIn(norm_txt), run_time=0.6)
        self.play(FadeIn(w_g), FadeIn(w_chip), run_time=0.4)

        arc=Arc(radius=0.58, start_angle=w_ang, angle=v_ang-w_ang, arc_center=sphere_center, color=OKABE["yellow"], stroke_width=7)
        arc_out=Arc(radius=0.58, start_angle=w_ang, angle=v_ang-w_ang, arc_center=sphere_center, color=INK, stroke_width=10)
        theta=VGroup(*[RoundedRectangle(width=0.5, height=0.30, corner_radius=0.05, fill_color=OKABE["yellow"], fill_opacity=1, stroke_color=INK, stroke_width=3.0), Text("θ", font_size=14, color=INK, weight=BOLD)]).move_to(sphere_center+0.85*np.array([np.cos((v_ang+w_ang)/2), np.sin((v_ang+w_ang)/2),0]))
        self.play(Create(VGroup(arc_out,arc)), FadeIn(theta), run_time=0.35)

        cos_card=cam_card(width=2.6, height=0.55, accent_color=OKABE["yellow"])
        cos_card.to_edge(DOWN, buff=0.55)
        cos_card.set_x(-1.2)
        cos_txt=Text("cosθ=v̂·ŵ", font_size=14, color=INK, font=MONO_STACK[0], weight=BOLD).move_to(cos_card)
        sim_card=cam_card(width=3.3, height=0.55, accent_color=OKABE["green"])
        sim_card.next_to(cos_card, RIGHT, buff=0.24)
        sim_txt=Text("∼1 close  ∼0 orth  ∼-1 opp", font_size=11, color=INK, font=MONO_STACK[0]).move_to(sim_card)
        self.play(FadeOut(l2_card), FadeOut(l2_txt), FadeOut(norm_txt), FadeIn(cos_card), FadeIn(cos_txt), FadeIn(sim_card), FadeIn(sim_txt), run_time=0.5)

        footer=cam_card(width=2.8, height=0.48, accent_color=OKABE["purple"])
        footer.to_edge(DOWN, buff=0.06)
        ft=Text("⬢ 12,966 pts on sphere • Era Twin + nearest", font_size=11, color=INK, font=MONO_STACK[0], weight=BOLD).move_to(footer)
        self.play(FadeIn(footer), FadeIn(ft), run_time=0.35)
        self.wait(1.0)
        self.play(FadeOut(tg), FadeOut(base), FadeOut(dashed), FadeOut(axH), FadeOut(axV), FadeOut(origin), FadeOut(v_raw_g), FadeOut(v_g), FadeOut(w_g), FadeOut(v_chip), FadeOut(w_chip), FadeOut(arc), FadeOut(arc_out), FadeOut(theta), FadeOut(cos_card), FadeOut(cos_txt), FadeOut(sim_card), FadeOut(sim_txt), FadeOut(footer), FadeOut(ft), run_time=0.45)

CAPTIONS=[
    (0.0,2.3,"Sixty-four dims — not all equal length — raw vector v in R64."),
    (2.3,4.6,"L2 normalize — v hat equals v over norm v — now length exactly one."),
    (4.6,7.0,"Twelve thousand nine sixty six seasons — all on the unit sphere."),
    (7.0,9.5,"Second season w hat — angle theta — cosine equals dot product."),
    (9.5,12.0,"Similar close to one — orthogonal near zero — opposite near minus one — Era Twin plus nearest real."),
]

if __name__=="__main__":
    pass
