"""
v06_archetypes_skills_drift — k-means K=8 era-z, 12 skills 0-99 percentile, Procrustes drift Q rotation angle
Cam Authentic
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from cam_style import BG, CARD_FILL, INK, OKABE, SUBTLE_AAA, MONO_STACK, SANS_STACK, apply_cam_style, cam_card, cam_label
try:
    from manim import *
    MANIM=True
except ImportError:
    MANIM=False
    Scene=object

class V06ArchetypesSkillsDrift(Scene if MANIM else object):
    def construct(self):
        if not MANIM: return
        apply_cam_style(self, bg=BG)
        title=cam_card(width=7.8, height=1.2, accent_color=OKABE["purple"])
        title.to_edge(UP, buff=0.30)
        t1=Text("06 · Archetypes×8 • Skills×12 • Drift Q", font_size=22, color=INK, font=SANS_STACK[0], weight=BOLD).move_to(title).shift(UP*0.14)
        t2=Text("k-means K=8 era-z sphere • 12 skills 0-99 • Procrustes Q rot angle", font_size=12, color=SUBTLE_AAA, font=MONO_STACK[0]).next_to(t1,DOWN,buff=0.06)
        tg=VGroup(title,t1,t2)
        self.play(FadeIn(tg, shift=DOWN*0.10), run_time=0.5)

        # archetype row K=8
        archs=VGroup()
        arch_names=["Rim","Wing","Play","3&D","Stretch","Post","Big","Hybrid"]
        colors=[OKABE["blue"],OKABE["orange"],OKABE["green"],OKABE["verm"],OKABE["purple"],OKABE["sky"],OKABE["yellow"],OKABE["blue"]]
        for i,name in enumerate(arch_names):
            c=cam_card(width=1.55, height=0.65, accent_color=colors[i])
            txt=Text(f"● {name}", font_size=10, color=INK, font=MONO_STACK[0], weight=BOLD).move_to(c)
            archs.add(VGroup(c,txt))
        arch_row=VGroup(*archs[:4]).arrange(RIGHT, buff=0.14)
        arch_row2=VGroup(*archs[4:]).arrange(RIGHT, buff=0.14)
        arch_all=VGroup(arch_row, arch_row2).arrange(DOWN, buff=0.12, aligned_edge=LEFT)
        arch_all.next_to(tg, DOWN, buff=0.35)
        arch_all.scale(0.92)
        k_label=cam_label("K=8 k-means era-z • shape+color+text triple", font_size=14, mono=True, color=INK, bg_fill=CARD_FILL, with_border=True)
        k_label.next_to(arch_all, DOWN, buff=0.12)
        self.play(FadeIn(arch_all, shift=UP*0.06), FadeIn(k_label, shift=UP*0.04), run_time=0.55)

        # skills 12
        skills=VGroup()
        skill_names=["Scor","Play","D","Reb","3PT","Mid","Rim%","FT","AST%","STL","BLK","IQ"]
        for i,s in enumerate(skill_names):
            col=colors[i%8]
            sc=cam_card(width=1.18, height=0.48, accent_color=col)
            st=Text(f"◆ {s} 0-99", font_size=9, color=INK, font=MONO_STACK[0], weight=BOLD).move_to(sc)
            skills.add(VGroup(sc,st))
        skill_grid=VGroup(*skills[:6]).arrange(RIGHT, buff=0.10)
        skill_grid2=VGroup(*skills[6:]).arrange(RIGHT, buff=0.10)
        skill_all=VGroup(skill_grid, skill_grid2).arrange(DOWN, buff=0.10, aligned_edge=LEFT)
        skill_all.next_to(k_label, DOWN, buff=0.28)
        skill_all.scale(0.90)
        self.play(FadeIn(skill_all, shift=UP*0.06), run_time=0.5)

        # Procrustes
        pro_card=cam_card(width=7.4, height=1.15, accent_color=OKABE["yellow"])
        pro_card.to_edge(DOWN, buff=0.55)
        p1=Text("Procrustes Q: min_Q ||A - BQ||_F  s.t. QᵀQ=I  θ=arccos((tr Q -1)/2)", font_size=11, color=INK, font=MONO_STACK[0], weight=BOLD)
        p2=Text("drift angle • 1990s vs 2020s semantic rotation • skills shift 3PT ↑ Rim ↓", font_size=10, color=SUBTLE_AAA, font=MONO_STACK[0])
        VGroup(p1,p2).arrange(DOWN, buff=0.08).move_to(pro_card)
        self.play(FadeIn(pro_card), FadeIn(p1), FadeIn(p2), run_time=0.5)
        self.wait(1.0)
        self.play(FadeOut(tg), FadeOut(arch_all), FadeOut(k_label), FadeOut(skill_all), FadeOut(pro_card), FadeOut(p1), FadeOut(p2), run_time=0.45)

CAPTIONS=[
    (0.0,2.4,"Eight archetypes — k-means on era-z normalized sphere — rim, wing, play, three-and-D."),
    (2.4,5.0,"Twelve skills percentile zero to ninety-nine — scoring, playmaking, defense, rebounding — triple encoded color plus icon plus text."),
    (5.0,7.8,"Procrustes finds rotation Q — minimize Frobenius between 1990s and 2020s centroids."),
    (7.8,11.0,"Angle theta from trace Q — drift quantified — three-point up, rim protection shift — game evolves."),
]

if __name__=="__main__":
    pass
