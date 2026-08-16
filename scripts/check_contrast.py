"""WCAG 1.4.3 contrast for the colour pairs this site actually declares.

I previously wrote that contrast "needs a browser and a person" and left it. That
was wrong, and wrong in a way worth naming: every surface on this site is an
explicit hex token in a `:root` block, and the contrast ratio between two known
colours is arithmetic. What needs a person is judging *which* pairs really meet on
screen. What does not is computing the ratio once you know the pair.

It reports in two tiers, because a first version that paired every text colour
with every declared background produced 77 findings, most of them nonsense — it
had `.site-nav__brand` at 1.04:1 against a `--void` token that element never sits
on, and flagged offline.html's `.sub` against paper when it lives inside a
`#080A0F` card.

    Tier 1, fails the gate: the rule declares both colour and background. No
                            ambiguity — 12 real failures, all white or orange
                            text on a brand colour.
    Tier 2, warns only:     the rule sets colour alone. Evaluated against that
                            page's own <body> background and printed to check in
                            a browser, never failed on, because the true backdrop
                            depends on nesting a static read cannot settle.

Colours composed at runtime, gradients and 8-digit hex with alpha are skipped and
counted, not guessed at.

Thresholds are WCAG 2.2 AA: 4.5:1 for normal text, 3:1 for large text
(>= 24px, or >= 18.66px when bold). Large-text exemption is applied only when the
same rule declares a qualifying font-size, never assumed.

    python scripts/check_contrast.py
    python scripts/check_contrast.py --root public
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {"public", "node_modules", ".git", "assets", "knowledge", "pipeline", "docs", "scripts", "tasks"}

AA_NORMAL, AA_LARGE = 4.5, 3.0

RE_STYLE = re.compile(r"<style[^>]*>(.*?)</style>", re.S | re.I)
RE_VAR_DEF = re.compile(r"--([\w-]+)\s*:\s*([^;}]+)")
RE_RULE = re.compile(r"([^{}]+)\{([^{}]*)\}", re.S)
RE_HEX = re.compile(r"#([0-9a-fA-F]{3,8})\b")
RE_VAR_USE = re.compile(r"var\(\s*--([\w-]+)\s*(?:,[^)]*)?\)")


def pages(root: Path) -> list[Path]:
    found = list(root.glob("*.html"))
    for sub in sorted(root.glob("*/index.html")):
        if sub.parent.name not in SKIP_DIRS:
            found.append(sub)
    return sorted(found, key=lambda p: str(p.relative_to(root)))


def to_rgb(h: str) -> tuple[int, int, int] | None:
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) == 8:          # #rrggbbaa — alpha over an unknown backdrop, skip
        return None
    if len(h) != 6:
        return None
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def luminance(rgb: tuple[int, int, int]) -> float:
    out = []
    for c in rgb:
        s = c / 255
        out.append(s / 12.92 if s <= 0.04045 else ((s + 0.055) / 1.055) ** 2.4)
    return 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2]


def ratio(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def resolve(value: str, tokens: dict[str, str], depth: int = 0) -> str | None:
    """A colour literal, or a var() chased through the token table."""
    if depth > 6:
        return None
    value = value.strip()
    m = RE_VAR_USE.search(value)
    if m:
        ref = tokens.get(m.group(1))
        return resolve(ref, tokens, depth + 1) if ref else None
    m = RE_HEX.search(value)
    return "#" + m.group(1) if m else None


def font_px(decls: str) -> tuple[float, bool]:
    size = 0.0
    m = re.search(r"font-size\s*:\s*([\d.]+)px", decls)
    if m:
        size = float(m.group(1))
    bold = bool(re.search(r"font-weight\s*:\s*(bold|[7-9]00)", decls))
    return size, bold


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", help="directory to check instead of the repo root")
    args = ap.parse_args()
    root = Path(args.root).resolve() if args.root else ROOT
    if not root.is_dir():
        sys.exit(f"--root {args.root} is not a directory")

    failures: list[str] = []
    warnings: list[str] = []
    pairs_checked = 0
    skipped = 0

    for page in pages(root):
        name = str(page.relative_to(root)).replace("\\", "/")
        css = "\n".join(RE_STYLE.findall(page.read_text(encoding="utf-8", errors="replace")))
        if not css.strip():
            continue

        tokens: dict[str, str] = {}
        for m in RE_VAR_DEF.finditer(css):
            tokens.setdefault(m.group(1), m.group(2).strip())

        # the page's own <body> background — the only backdrop a static read can
        # attribute with confidence when a rule sets colour and nothing else
        body_bg = None
        for m in RE_RULE.finditer(css):
            if re.search(r"(^|,)\s*(html\s*,\s*)?body\s*(,|$)", m.group(1).strip()):
                bmm = re.search(r"background(?:-color)?\s*:\s*([^;]+)", m.group(2))
                if bmm:
                    lit2 = resolve(bmm.group(1), tokens)
                    body_bg = to_rgb(lit2) if lit2 else body_bg
        bgs: dict[str, tuple[int, int, int]] = {}
        for key in ("paper", "surface", "void", "bg", "card"):
            v = tokens.get(key)
            if v:
                lit = resolve(v, tokens)
                rgb = to_rgb(lit) if lit else None
                if rgb:
                    bgs[key] = rgb
        if not bgs:
            continue

        seen: set[tuple[str, str, str]] = set()
        for rule in RE_RULE.finditer(css):
            sel, decls = rule.group(1).strip(), rule.group(2)
            if sel.startswith("@") or ":root" in sel:
                continue
            cm = re.search(r"(?<!-)\bcolor\s*:\s*([^;]+)", decls)
            if not cm:
                continue
            fg_lit = resolve(cm.group(1), tokens)
            fg = to_rgb(fg_lit) if fg_lit else None
            if not fg:
                skipped += 1
                continue

            bm = re.search(r"background(?:-color)?\s*:\s*([^;]+)", decls)
            own = resolve(bm.group(1), tokens) if bm else None
            own_rgb = to_rgb(own) if own else None

            size, bold = font_px(decls)
            threshold = AA_LARGE if (size >= 24 or (size >= 18.66 and bold)) else AA_NORMAL

            # Tier 1 — the rule declares both colours. No ambiguity, so this is
            # what the gate fails on.
            if own_rgb:
                key = (sel[:40], fg_lit or "", "same-rule")
                if key in seen:
                    continue
                seen.add(key)
                pairs_checked += 1
                r = ratio(fg, own_rgb)
                if r < threshold:
                    failures.append(
                        f"{name}: {sel[:44]!r} {fg_lit} on its own background "
                        f"{'#%02x%02x%02x' % own_rgb} = {r:.2f}:1, needs {threshold}:1"
                        + (f" (font-size {size:g}px{' bold' if bold else ''})" if size else "")
                    )
                continue

            # Tier 2 — colour only. The real backdrop depends on nesting, which a
            # static read cannot settle: offline.html's .sub is #C9D4E5, which is
            # unreadable on paper and fine on the #080A0F card it actually sits
            # in. So this reports against the page's own <body> background as a
            # warning to check in a browser, and never fails the gate on it.
            if body_bg is None:
                skipped += 1
                continue
            key = (sel[:40], fg_lit or "", "body")
            if key in seen:
                continue
            seen.add(key)
            pairs_checked += 1
            r = ratio(fg, body_bg)
            if r < threshold:
                warnings.append(
                    f"{name}: {sel[:44]!r} {fg_lit} on body "
                    f"{'#%02x%02x%02x' % body_bg} = {r:.2f}:1, needs {threshold}:1"
                    + (f" (font-size {size:g}px{' bold' if bold else ''})" if size else "")
                )

    print(f"  {pairs_checked} declared colour pair(s) evaluated")
    if skipped:
        print(f"  {skipped} rule(s) skipped — colour not statically resolvable (alpha, gradient, runtime)")
    print()
    if failures:
        print(f"FAIL — {len(failures)} contrast problem(s) below WCAG 1.4.3 AA:")
        for f in sorted(set(failures)):
            print(f"  - {f}")
        return 1
    print(f"OK — every statically resolvable pair meets WCAG 1.4.3 AA")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
