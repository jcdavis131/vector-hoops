"""
v03_mtnn_towers — 17x160->32 LN GELU x2 -> 544 +12 season emb -> 556->128->64 L2, heads 8/5/14/18, ~224K params 549KB ONNX
Cam Authentic style unified
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from cam_style import BG, CARD_FILL, INK, OKABE, SUBTLE_AAA, MONO_STACK, SANS_STACK, SHADOW, apply_cam_style, cam_card
try:
    from manim import *
    MANIM=True
except ImportError:
    MANIM=False
    Scene=object

class V03MTNNTowers(Scene if MANIM else object):
    def construct(self):
        if not MANIM: return
        apply_cam_style(self, bg=BG)
        title=cam_card(width=8.0, height=1.25, accent_color=OKABE["blue"])
        title.to_edge(UP, buff=0.30)
        t1=Text("03 · MTNN v4 — 17×160→32 LN GELU ×2 → 544+12=556→128→64 L2", font_size=20, color=INK, font=SANS_STACK[0], weight=BOLD).move_to(title).shift(UP*0.16)
        t2=Text("cat towers • ~224K params • 549KB ONNX • 12,966 sphere • heads 8/5/14/18", font_size=12, color=SUBTLE_AAA, font=MONO_STACK[0]).next_to(t1,DOWN,buff=0.07)
        tg=VGroup(title,t1,t2)
        self.play(FadeIn(tg, shift=DOWN*0.10), run_time=0.5)

        # tower mini grid 17 cards 160->32
        towers=VGroup()
        for i in range(17):
            col = [OKABE["blue"],OKABE["orange"],OKABE["green"],OKABE["verm"],OKABE["purple"],OKABE["sky"]][i%6]
            c=cam_card(width=1.08, height=0.55, accent_color=col)
            txt=Text(f"T{i+1:02d} {160}→{32}", font_size=9, color=INK, font=MONO_STACK[0], weight=BOLD).move_to(c)
            towers.add(VGroup(c,txt))
        grid=VGroup(*towers[:6]).arrange(RIGHT, buff=0.14)
        grid2=VGroup(*towers[6:12]).arrange(RIGHT, buff=0.14)
        grid3=VGroup(*towers[12:]).arrange(RIGHT, buff=0.14)
        allg=VGroup(grid,grid2,grid3).arrange(DOWN, buff=0.14, aligned_edge=LEFT)
        allg.scale(0.95)
        allg.next_to(tg, DOWN, buff=0.35)
        self.play(FadeIn(allg, shift=UP*0.08), run_time=0.55)

        # detail middle tower
        detail=cam_card(width=3.2, height=1.35, accent_color=OKABE["orange"])
        detail.move_to(allg.get_center())
        d1=Text("TRK 12f×2=24 →160", font_size=11, color=INK, font=MONO_STACK[0], weight=BOLD)
        d2=Text("LN→GELU→Residual ×2", font_size=10, color=INK, font=MONO_STACK[0])
        d3=Text("160→32 + LN", font_size=10, color=SUBTLE_AAA, font=MONO_STACK[0])
        dg=VGroup(d1,d2,d3).arrange(DOWN, buff=0.06).move_to(detail)
        detg=VGroup(detail,dg)
        self.play(allg.animate.set_opacity(0.25), FadeIn(detg, scale=0.94), run_time=0.45)
        self.wait(0.5)
        self.play(FadeOut(detg), allg.animate.set_opacity(1), run_time=0.35)

        arrow1=Arrow(allg.get_bottom()+DOWN*0.06, allg.get_bottom()+DOWN*0.55, color=INK, stroke_width=4, buff=0.02, max_tip_length_to_length_ratio=0.12)
        self.play(GrowArrow(arrow1), run_time=0.28)

        fusion=cam_card(width=5.6, height=1.25, accent_color=OKABE["green"])
        fusion.next_to(arrow1, DOWN, buff=0.12)
        f1=Text("Concat 17×32=544 +12 time =556", font_size=12, color=INK, font=MONO_STACK[0], weight=BOLD)
        f2=Text("556→128 GELU LN →64 → L2 normalize", font_size=11, color=INK, font=MONO_STACK[0])
        f3=Text("v̂=v/||v|| ||v̂||=1 12,966 pts sphere", font_size=10, color=SUBTLE_AAA, font=MONO_STACK[0])
        VGroup(f1,f2,f3).arrange(DOWN, buff=0.06).move_to(fusion)
        fg=VGroup(fusion,f1,f2,f3)
        self.play(FadeIn(fg, shift=UP*0.06), run_time=0.45)

        arrow2=Arrow(fusion.get_bottom()+DOWN*0.05, fusion.get_bottom()+DOWN*0.45, color=INK, stroke_width=4, buff=0.02, max_tip_length_to_length_ratio=0.12)
        self.play(GrowArrow(arrow2), run_time=0.25)

        heads=VGroup()
        for name,cnt,col in [("Arch",8,OKABE["blue"]),("Pos",5,OKABE["green"]),("Next14",14,OKABE["orange"]),("Skill",18,OKABE["purple"])]:
            hc=cam_card(width=1.75, height=0.70, accent_color=col)
            ht=Text(f"{name} {cnt}", font_size=11, color=INK, font=MONO_STACK[0], weight=BOLD).move_to(hc)
            heads.add(VGroup(hc,ht))
        hrow=VGroup(*heads).arrange(RIGHT, buff=0.18).next_to(arrow2, DOWN, buff=0.16)
        hfoot=Text("CE + MSE + InfoNCE anchor • ~224K • 549KB ONNX", font_size=10, color=SUBTLE_AAA, font=MONO_STACK[0]).next_to(hrow, DOWN, buff=0.12)
        self.play(FadeIn(hrow, shift=UP*0.06), FadeIn(hfoot, shift=UP*0.04), run_time=0.45)
        self.wait(1.2)
        self.play(FadeOut(tg),FadeOut(allg),FadeOut(arrow1),FadeOut(fg),FadeOut(arrow2),FadeOut(hrow),FadeOut(hfoot), run_time=0.45)

CAPTIONS=[
    (0.0,2.5,"Seventeen towers — each family lifted one-sixty dims, squeezed to thirty-two."),
    (2.5,5.0,"LayerNorm then GELU, residual twice — stable, deep, tiny."),
    (5.0,7.5,"Concat seventeen times thirty-two is five-forty-four, plus twelve time embeddings is five-fifty-six."),
    (7.5,10.0,"Five-fifty-six to one-twenty-eight to sixty-four, then L2 — unit length, twelve thousand nine sixty six on sphere."),
    (10.0,12.8,"Four heads — archetype eight, position five, next fourteen, skills eighteen — two hundred twenty four K params, five-forty-nine KB ONNX."),
]

if __name__=="__main__":
    pass
