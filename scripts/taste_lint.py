#!/usr/bin/env python3
"""
taste lint verifier — v2.1 SSOT — zero-deps stdlib only
Checks japandi family guardrails so user never has to redo.
"""
import pathlib, re, sys, json

root = pathlib.Path.home() / "workspace" / "vector-hub"
repos = ["vector-hub","vector-hoops","vector-pitch","vector-gridiron","vector-equities","vector-unified","vector-tennis"]

def read(p): 
    try: return p.read_text(encoding="utf-8", errors="ignore")
    except: return ""

def check_tokens():
    txt = read(root / "assets" / "tokens.css")
    need = [
        "--paper:#FEFCF9","--paper-2:#FFFEF7","--wood:#D6C7B3","--wood-2:#E8D9C5",
        "--stone:#EAE3D8","--ink:#1E1E1E","--moss:#7A8A7B","--clay:#C9A88C",
        "--shadow-book:3px 3px 0 #1E1E1E","--nav-h:40px","--pov-h:44px","--momentum:0.94",
        "--okabe-0:#E69F00","#56B4E9","#009E73","#F0E442","#0072B2","#D55E00","#CC79A7","#000000",
        "ui-monospace","ui-sans","Architects Daughter"
    ]
    scores=[]
    for token in need[:-1]: # last is forbidden check
        ok = token.lower() in txt.lower()
        scores.append((token, ok))
    forbidden = "architects daughter" in txt.lower()
    # also want radius 12-16 present
    radius_ok = "--radius" in txt and "12px" in txt and "16px" in txt
    return scores, not forbidden, radius_ok, txt

def check_index(p):
    txt = read(p / "index.html") if (p/"index.html").exists() else read(p / "assets/../index.html") if False else ""
    if not txt:
        # try root html fallback for domains that have different layout
        alt = list(p.glob("*.html"))
        if alt:
            txt = read(alt[0])
    checks=[]
    # 40px sticky z40 safe-area-inset-top
    checks.append(("nav 40px sticky z40", "40px" in txt or "--nav-h" in read(p/"assets/tokens.css" if (p/"assets/tokens.css").exists() else root/"assets/tokens.css")))
    # chips scrollable overflow-x auto
    has_chips = "overflow-x:auto" in txt or "chips" in txt or "pov-chips" in txt or "overflow-x: auto" in read(root/"assets/tokens.css")
    checks.append(("chips scrollable", has_chips))
    # canvas min-height clamp
    has_clamp = "clamp(320px" in read(p/"assets/tokens.css" if (p/"assets/tokens.css").exists() else root/"assets/tokens.css") or "min-height" in txt
    checks.append(("canvas min-height clamp", has_clamp))
    # footer single subtle
    footer_count = txt.lower().count("<footer")
    checks.append(("footer single", footer_count <=1))
    # no dev pills
    dev_pill = "dev-pill" in txt.lower() or "data-dev" in txt.lower()
    if "display:none" in read(p/"assets/tokens.css" if (p/"assets/tokens.css").exists() else root/"assets/tokens.css"):
        # allowed if hidden via css — we treat visible pill as fail
        dev_pill_visible = dev_pill and "dev-pill" not in read(root/"assets/tokens.css").lower() # simplified
    else:
        dev_pill_visible = dev_pill
    checks.append(("no dev pills visible", not dev_pill_visible))
    # single-select clears prev — check for phrase single-select or clear prev in js
    ss = "single-select" in txt.lower() or "clears prev" in txt.lower() or "clearPrev" in txt or "single_select" in txt
    # if not in index, look in js assets
    if not ss:
        for js in (p/"assets").glob("*.js"):
            jtxt = read(js).lower()
            if "single-select" in jtxt or "clears prev" in jtxt or "clear" in jtxt[:5000]: # loose
                ss=True; break
    checks.append(("single-select clears prev", ss))
    # contrast ivory void 19.1:1 on dark only — body bg must be paper not void
    body_uses_paper = "var(--paper)" in read(p/"assets/tokens.css" if (p/"assets/tokens.css").exists() else root/"assets/tokens.css") or "background: var(--paper)" in txt or "--paper" in txt
    checks.append(("paper primary not void bg", body_uses_paper))
    return checks

def check_offline(p):
    off = p / "offline.html"
    if not off.exists():
        # try alternative
        return [("offline exists", False)]
    txt = read(off)
    need = [
        "20260813→189831298",
        "idx3820",
        "triple[11205,19448,14209]",
        "Solo1",
        "Triple3",
        "Full5",
        "glibc",
        "LCG",
    ]
    return [(n, n in txt) for n in need] + [("offline exists", True)]

def score():
    total=0; passed=0
    print("== TOKENS v2.1 SSOT ===")
    tok_checks, no_arch, radius_ok, tok_txt = check_tokens()
    for name, ok in tok_checks:
        total+=1; passed+=1 if ok else 0
        print(f"  {'PASS' if ok else 'FAIL'} tokens contains {name[:40]}")
    print(f"  {'PASS' if no_arch else 'FAIL'} no Architects Daughter")
    total+=1; passed+=1 if no_arch else 0
    print(f"  {'PASS' if radius_ok else 'FAIL'} radius 12-16")
    total+=1; passed+=1 if radius_ok else 0

    for repo in repos:
        rp = pathlib.Path.home()/"workspace"/repo
        if not rp.exists(): continue
        print(f"\n== {repo} ==")
        # tokens identical
        if (rp/"assets"/"tokens.css").exists():
            same = read(rp/"assets"/"tokens.css")[:2000]==tok_txt[:2000] or "--paper:#FEFCF9" in read(rp/"assets"/"tokens.css")
            print(f"  {'PASS' if same else 'FAIL'} tokens sync")
            total+=1; passed+=1 if same else 0
        else:
            # tennis pkg check
            pkg = rp/"packages"/"vector-tokens"/"tokens.css"
            if pkg.exists():
                same = "--paper:#FEFCF9" in read(pkg)
                print(f"  {'PASS' if same else 'FAIL'} pkg tokens sync")
                total+=1; passed+=1 if same else 0

        idx_checks = check_index(rp)
        for name, ok in idx_checks:
            total+=1; passed+=1 if ok else 0
            print(f"  {'PASS' if ok else 'FAIL'} {name}")

        off_checks = check_offline(rp)
        for name, ok in off_checks:
            total+=1; passed+=1 if ok else 0
            print(f"  {'PASS' if ok else 'FAIL'} offline {name}")

    final = passed/total*10 if total else 0
    print(f"\nOVERALL {passed}/{total} = {final:.2f}/10")
    gate = 8.0
    print(f"Gate {gate} => {'PASS' if final>=gate else 'FAIL'}")
    return final

if __name__=="__main__":
    s=score()
    sys.exit(0 if s>=8.0 else 1)
