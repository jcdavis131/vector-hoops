"""scripts/check_design.py: every detector catches its case and passes a clean one.

A three-page synthetic site in tmp_path (atlas/shell/fonts sheets, a site-nav.js
with an EXPLORE list, a vercel.json with rewrites) passes all eighteen detectors.
Each case below breaks exactly one thing and asserts that detector names it at
the right file, then a matching clean variant proves the detector does not fire
on the shape wave 1 will ship. D19 shells out, so it gets an injected command
instead of the repo's ledger checks.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from collections.abc import Callable
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod  # dataclasses resolve the module by name
    spec.loader.exec_module(mod)
    return mod


cd = _load("check_design")

ATLAS = """:root{ --board:#FCFBF7; --ink:#232323; --bg:var(--board); --fg:var(--ink); --accent:#E0483B;
  --void:#1E2022; --coin-1:#FFD94D; --font-display:"Archivo",sans-serif; --font-text:"Inter",sans-serif;
  --font-code:ui-monospace,monospace; --t-2xs:11px; --t-xs:11px; --line:#E7E4DA; }
@media (prefers-color-scheme: dark){ :root{ --board:#0F1114; --ink:#ECEEF1; --accent:#FF7A33; --line:#1D232C; } }
[hidden]{ display:none !important; }
body{ font-family:var(--font-text); font-size:15px; color:var(--fg); background:var(--bg); }
.card{ border:1px solid var(--line); }
.disclosure summary{ min-height:48px; }
@media (prefers-reduced-motion: reduce){ *{ animation-duration:.01ms !important; } }
"""
SHELL = ".site-nav{ position:sticky; top:0; }\n.site-footer{ padding:8px; }\n"
FONTS = '@font-face{ font-family:"Archivo"; src:url(archivo.woff2); }\n'
SITE_NAV = (
    "var MAP = { href: '/#atlas', label: 'Map' };\nvar PLAY = { href: '/play', label: 'Play' };\n"
    "var HOW = { href: '/methods', label: 'How it works' };\n"
    "var EXPLORE = [\n  { href: '/', label: 'Atlas' },\n  { href: '/play', label: 'Play' },\n"
    "  { href: '/methods', label: 'Methods' }\n];\n"
)
VERCEL = {
    "rewrites": [
        {"source": "/play", "destination": "/play.html"},
        {"source": "/methods", "destination": "/methods.html"},
    ],
    "redirects": [{"source": "/teams", "destination": "/", "permanent": True}],
}
FOOTER = (
    '<footer class="site-footer"><nav aria-label="Sitemap"><a href="/">Atlas</a><a href="/play">Play</a>'
    '<a href="https://dumbmodel.com" rel="noopener">dumbmodel</a></nav></footer>'
)
LEDGER_OK = [[sys.executable, "-c", "raise SystemExit(0)"]]
LEDGER_BAD = [[sys.executable, "-c", "print('stale: assets/x.js'); raise SystemExit(1)"]]


def head(
    url: str,
    title: str,
    description: str = "A test page.",
    canonical: bool = True,
    themes: tuple = ((cd.THEME_LIGHT, "light"), (cd.THEME_DARK, "dark")),
    og: bool = True,
    twitter: bool = True,
    sheets: tuple = ("fonts", "atlas", "shell"),
    extra: str = "",
) -> str:
    h = [
        '<meta charset="utf-8"/>',
        '<meta name="viewport" content="width=device-width,initial-scale=1"/>',
        f"<title>{title} - Test</title>",
    ]
    if description:
        h.append(f'<meta name="description" content="{description}"/>')
    if canonical:
        h.append(f'<link rel="canonical" href="{cd.SITE_HOST}{url}"/>')
    for colour, scheme in themes:
        h.append(f'<meta name="theme-color" content="{colour}" media="(prefers-color-scheme: {scheme})"/>')
    if og:
        h += [
            f'<meta property="og:title" content="{title}"/>',
            '<meta property="og:description" content="A test page."/>',
            f'<meta property="og:image" content="{cd.SITE_HOST}/assets/og.png"/>',
            f'<meta property="og:url" content="{cd.SITE_HOST}{url}"/>',
        ]
    if twitter:
        h.append('<meta name="twitter:card" content="summary_large_image"/>')
    h += [f'<link rel="stylesheet" href="/assets/{s}.css"/>' for s in sheets]
    h.append(extra)
    return "\n".join(h)


def page(
    url: str,
    title: str,
    *,
    body: str | None = None,
    nav: str | None = None,
    footer: str = FOOTER,
    style: str = "",
    scripts: tuple = ("site-nav",),
    inline_script: str = "",
    **head_kw,
) -> str:
    body = body if body is not None else f"<h1>{title}</h1><p>Hello.</p>"
    nav = nav if nav is not None else f'<nav class="site-nav" data-active="{url}" aria-label="Primary"></nav>'
    style_block = f"<style>{style}</style>" if style else ""
    script_tags = "".join(f'<script defer src="/assets/{s}.js"></script>' for s in scripts) + inline_script
    return (
        f'<!doctype html>\n<html lang="en"><head>\n{head(url, title, **head_kw)}\n{style_block}\n</head><body>\n'
        f"{nav}\n<main>{body}</main>\n{footer}\n{script_tags}\n</body></html>\n"
    )


def clean_site() -> dict[str, str]:
    return {
        "assets/atlas.css": ATLAS,
        "assets/shell.css": SHELL,
        "assets/fonts.css": FONTS,
        "assets/site-nav.js": SITE_NAV,
        "vercel.json": json.dumps(VERCEL),
        "index.html": page("/", "Atlas"),
        "play.html": page("/play", "Play"),
        "methods.html": page("/methods", "Methods"),
    }


def write_site(root: Path, files: dict[str, str]) -> Path:
    for rel, content in files.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
    return root


def hits(root: Path, did: str, ledger: list[list[str]] = LEDGER_OK) -> list[str]:
    return cd.run(root, only={did}, ledger_checks=ledger)[did].hits


def _play(files: dict[str, str], **kw) -> None:
    files["play.html"] = page("/play", "Play", **kw)


def _with_app_js(files: dict[str, str], js: str) -> None:
    files["assets/app.js"] = js
    _play(files, scripts=("site-nav", "app"))


Mutator = Callable[[dict[str, str]], None]

# (detector, what breaks, a substring the hit must carry)
FAIL_CASES: list[tuple[str, Mutator, str]] = [
    ("D1", lambda f: _play(f, body="<h1>A</h1><h1>B</h1>"), "play.html:1: 2 <h1>"),
    ("D2", lambda f: _play(f, description=""), "play.html:1: <head> lacks description"),
    (
        "D2",
        lambda f: _play(f, themes=((cd.THEME_LIGHT, "light"), ("#000000", "dark"))),
        "theme-color #0F1114 (dark) missing",
    ),
    ("D2", lambda f: _play(f, canonical=False), "<head> lacks canonical"),
    ("D3", lambda f: _play(f, sheets=("fonts", "atlas", "shell", "unified")), "legacy sheet unified.css"),
    ("D3", lambda f: _play(f, sheets=("atlas", "fonts", "shell")), "shared sheets out of order"),
    (
        "D3",
        lambda f: _play(f, extra='<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"/>'),
        "external <link",
    ),
    ("D4", lambda f: _play(f, style=":root{--gap:4px}"), ":root block outside atlas.css"),
    ("D4", lambda f: _play(f, style=".x{--gap:4px}"), "scoped token block '.x'"),
    ("D5", lambda f: _play(f, style=".card{padding:0}"), "redeclares kit class .card"),
    ("D5", lambda f: _play(f, style=".a, .btn {padding:0}"), "redeclares kit class .btn"),
    ("D6", lambda f: _play(f, style=".x{color:#123456}"), "color: #123456"),
    ("D6", lambda f: _play(f, body='<h1>P</h1><p style="background:#fff">x</p>'), "background: #fff"),
    ("D6", lambda f: _with_app_js(f, "el.style.cssText = 'color:#abcdef;padding:2px';\n"), "app.js:1: #abcdef"),
    ("D7", lambda f: _play(f, style=".x{display:none !important}"), "display !important"),
    ("D8", lambda f: _play(f, style=".x{font-size:9px}"), "9px < 11px"),
    ("D8", lambda f: _play(f, style=".x{font:700 10px var(--font-code)}"), "10px < 11px"),
    ("D8", lambda f: _play(f, style=".x{font-size:clamp(9px,2vw,14px)}"), "9px < 11px"),
    ("D8", lambda f: _with_app_js(f, "ctx.font = '600 10px ' + fam;\n"), "app.js:1: 10px in JS font string"),
    ("D9", lambda f: _play(f, style=".x{font-family:system-ui,sans-serif}"), "literal family 'system-ui'"),
    ("D9", lambda f: _with_app_js(f, "ctx.font = '600 12px system-ui, sans-serif';\n"), "app.js:1: literal family"),
    (
        "D10",
        lambda f: f.__setitem__(
            "assets/atlas.css", ATLAS.replace("--accent:#E0483B;", "--accent:#E0483B; --extra:#123456;", 1)
        ),
        "--extra: #123456 has no night-board value",
    ),
    ("D12", lambda f: _play(f, footer=FOOTER.replace("Atlas", "Home")), "play.html:"),
    (
        "D12",
        lambda f: [
            f.__setitem__(k, v.replace('<a href="/play">Play</a>', '<a href="/play">Play</a><a href="/nowhere">No</a>'))
            for k, v in list(f.items())
            if k.endswith(".html")
        ],
        "footer link /nowhere is not in EXPLORE+GAMES",
    ),
    (
        "D12",
        lambda f: [
            f.__setitem__(
                k, v.replace('<a href="/play">Play</a>', '<a href="/play">Play</a><a href="/teams">Teams</a>')
            )
            for k, v in list(f.items())
            if k.endswith(".html")
        ],
        "footer link /teams: redirects, not a 200",
    ),
    (
        "D13",
        lambda f: _play(f, nav='<nav class="site-nav" data-active="/" aria-label="Primary"></nav>'),
        "data-active='/' on page /play",
    ),
    ("D13", lambda f: _play(f, nav='<nav class="site-nav" aria-label="Primary"></nav>'), "site-nav has no data-active"),
    (
        "D13",
        lambda f: _play(f, nav='<nav class="site-nav" data-active="/play" aria-label="Site"></nav>'),
        "nav aria-label 'Site'; the site says 'Primary'",
    ),
    ("D14", lambda f: _play(f, inline_script="<script>alert(1)</script>"), "inline <script>"),
    (
        "D15",
        lambda f: _play(
            f, body='<h1>P</h1><p style="margin:0">a</p><p style="margin:0">b</p><p style="margin:0">c</p>'
        ),
        "(3 on the page, limit 2)",
    ),
    ("D15", lambda f: _play(f, body='<h1>P</h1><p style="color:red">a</p>'), "sets color"),
    (
        "D17",
        lambda f: _play(f, body='<h1>P</h1><a href="/methods.html#x">M</a>'),
        'href="/methods.html#x" names the file',
    ),
    ("D17", lambda f: f.__setitem__("status.html", page("/status", "Status")), "no vercel.json rewrite for /status"),
    ("D20", lambda f: _play(f, body='<h1>P</h1><a href="/x" role="tab">X</a>'), "role=tab on a link"),
    (
        "D20",
        lambda f: _play(f, body="<h1>P</h1><details><summary>More</summary></details>"),
        "has no rule declaring a height >= 44px",
    ),
    (
        "D20",
        lambda f: _play(
            f,
            body='<h1>P</h1><details class="d"><summary>More</summary></details>',
            style=".d summary{min-height:24px}",
        ),
        "declares 24px",
    ),
    ("D21", lambda f: _play(f, body="<h1>P</h1><p>Nearest by cosine in the MTNN space.</p>"), "'MTNN' in"),
]

# (detector, a shape that must NOT fire)
PASS_CASES: list[tuple[str, Mutator]] = [
    ("D2", lambda f: _play(f, extra='<link rel="manifest" href="/manifest.json"/>')),
    ("D3", lambda f: _play(f, sheets=("fonts", "atlas", "shell", "game"))),
    ("D4", lambda f: _play(f, style=".x{color:var(--fg)}")),
    ("D5", lambda f: _play(f, style=".card:hover{color:var(--fg)} .btn-primary{padding:0} .card .card{padding:0}")),
    ("D6", lambda f: _play(f, body='<h1>P</h1><svg viewBox="0 0 1 1"><path fill="#fff" style="stroke:#000"/></svg>')),
    ("D6", lambda f: _with_app_js(f, "// old chrome: '#abcdef'\nvar id = document.querySelector('#atlas-main');\n")),
    ("D7", lambda f: _play(f, style=".x[hidden]{display:none !important}")),
    (
        "D8",
        lambda f: _play(f, style=".x{font-size:11px} .y{font:700 11px/1.2 var(--font-code)} .z{font-size:var(--t-xs)}"),
    ),
    (
        "D9",
        lambda f: _play(
            f,
            style=".x{font-family:var(--font-code)} .y{font:700 11px var(--font-display, sans-serif)} .z{font:inherit}",
        ),
    ),
    ("D12", lambda f: None),
    (
        "D13",
        lambda f: f.__setitem__(
            "status.html",
            page("/status", "Status", nav='<nav class="site-nav" data-active="/methods" aria-label="Primary"></nav>'),
        ),
    ),
    ("D14", lambda f: _play(f, inline_script='<script type="application/ld+json">{"a":1}</script>')),
    ("D15", lambda f: _play(f, body='<h1>P</h1><p style="margin:0">a</p><p style="margin:0">b</p>')),
    ("D17", lambda f: _play(f, body='<h1>P</h1><a href="/methods#x">M</a><a href="https://example.org/a.html">E</a>')),
    ("D20", lambda f: _play(f, body='<h1>P</h1><details class="disclosure"><summary>More</summary></details>')),
    (
        "D21",
        lambda f: f.__setitem__("methods.html", page("/methods", "Methods", body="<h1>M</h1><p>MTNN cosine PCA</p>")),
    ),
    (
        "D21",
        lambda f: _play(
            f, body='<h1>P</h1><details class="provenance"><summary>Why</summary><p>64-d MTNN cosine</p></details>'
        ),
    ),
]


def test_clean_site_passes_every_detector(tmp_path: Path) -> None:
    root = write_site(tmp_path, clean_site())
    results = cd.run(root, ledger_checks=LEDGER_OK)
    assert set(results) == set(cd.DETECTOR_IDS)
    red = {did: r.hits for did, r in results.items() if r.hits}
    assert not red, red


@pytest.mark.parametrize(("did", "mutate", "expect"), FAIL_CASES, ids=[c[0] for c in FAIL_CASES])
def test_detector_catches_its_case(tmp_path: Path, did: str, mutate: Mutator, expect: str) -> None:
    files = clean_site()
    mutate(files)
    found = hits(write_site(tmp_path, files), did)
    assert found, f"{did} saw nothing"
    assert any(expect in h for h in found), found


@pytest.mark.parametrize(("did", "mutate"), PASS_CASES, ids=[c[0] for c in PASS_CASES])
def test_detector_stays_quiet_on_clean_shape(tmp_path: Path, did: str, mutate: Mutator) -> None:
    files = clean_site()
    mutate(files)
    assert hits(write_site(tmp_path, files), did) == []


def test_d19_reports_a_failing_ledger_check(tmp_path: Path) -> None:
    root = write_site(tmp_path, clean_site())
    assert hits(root, "D19", LEDGER_OK) == []
    bad = hits(root, "D19", LEDGER_BAD)
    assert len(bad) == 1 and "exited 1: stale: assets/x.js" in bad[0]


def test_page_set_matches_budget_check() -> None:
    assert cd.PAGE_GLOBS == _load("budget_check").PAGE_GLOBS


def test_cli_report_writes_receipts_and_exits_zero(tmp_path: Path, capsys: pytest.CaptureFixture) -> None:
    files = clean_site()
    _play(files, body="<h1>A</h1><h1>B</h1>")
    root = write_site(tmp_path / "site", files)
    out = tmp_path / "receipts.json"
    assert cd.main(["--root", str(root), "--report", "--json", str(out)]) == 0
    data = json.loads(out.read_text(encoding="utf-8"))
    assert list(data) == cd.DETECTOR_IDS
    assert data["D1"]["pass"] is False and data["D1"]["count"] == 1
    assert data["D1"]["hits"][0].startswith("play.html:1: 2 <h1>")
    assert data["D14"] == {
        "pass": True,
        "description": data["D14"]["description"],
        "criterion": "0",
        "count": 0,
        "hits": [],
    }
    assert "D1   FAIL       1" in capsys.readouterr().out


def test_cli_default_mode_enforces_d1_and_d14_only(tmp_path: Path) -> None:
    files = clean_site()
    _play(files, body="<h1>A</h1><h1>B</h1>", style=".x{color:#123456}")
    root = write_site(tmp_path, files)
    assert cd.main(["--root", str(root)]) == 1
    assert cd.main(["--root", str(root), "--enforce", "D14"]) == 0
    assert cd.main(["--root", str(root), "--enforce", "D6"]) == 1
    assert cd.main(["--root", str(root), "--report"]) == 0


def test_cli_delta_against_a_baseline(tmp_path: Path, capsys: pytest.CaptureFixture) -> None:
    base = tmp_path / "base.json"
    base.write_text(json.dumps({"D1": {"pass": False, "count": 3, "hits": ["a:1: x"] * 3}}), encoding="utf-8")
    root = write_site(tmp_path / "site", clean_site())
    assert cd.main(["--root", str(root), "--report", "--baseline", str(base)]) == 0
    out = capsys.readouterr().out
    assert "D1   3 -> 0  (-3)" in out
    assert "D2   new -> 0" in out


def test_cli_rejects_unknown_detector(tmp_path: Path) -> None:
    with pytest.raises(SystemExit):
        cd.main(["--root", str(write_site(tmp_path, clean_site())), "--enforce", "D99"])


def test_games_list_is_read_from_site_nav_and_is_not_a_nav_destination(tmp_path: Path) -> None:
    files = clean_site()
    files["assets/site-nav.js"] = SITE_NAV + "const GAMES = ['/play', '/era'];\n"
    rewrites = VERCEL["rewrites"] + [{"source": "/era", "destination": "/era.html"}]
    files["vercel.json"] = json.dumps({**VERCEL, "rewrites": rewrites})
    files["era.html"] = page("/era", "Era", nav='<nav class="site-nav" data-active="/play" aria-label="Primary"></nav>')
    for k in list(files):
        if k.endswith(".html"):
            files[k] = files[k].replace('<a href="/play">Play</a>', '<a href="/play">Play</a><a href="/era">Era</a>')
    root = write_site(tmp_path, files)
    assert hits(root, "D12") == []  # /era is allowed in the footer only because GAMES names it
    assert hits(root, "D13") == []  # and era.html may light /play, since /era is not a nav destination
    _explore, known, games, source = cd.nav_lists(files["assets/site-nav.js"])
    assert games == ("/play", "/era") and source.startswith("assets/site-nav.js")
    assert "/era" not in known


def test_games_parser_reads_objects_and_refuses_an_unclosed_array() -> None:
    objects = "let GAMES = [\n  { href: '/play', label: 'Play' },\n  { href: '/map-guess' }\n];\n"
    assert cd.nav_lists(objects)[2] == ("/play", "/map-guess")
    unclosed = "var GAMES = [ '/play', '/map-guess'\nvar EXPLORE = [ { href: '/' } ];\n"
    explore, known, games, source = cd.nav_lists(unclosed)
    assert games == cd.GAMES and "built-in" in source
    assert explore == ["/"] and known == {"/"}


def test_relative_import_literals_count_as_served(tmp_path: Path) -> None:
    files = clean_site()
    files["assets/app.js"] = "import('./deep/lazy.js?v=0a1b');\n"
    files["assets/deep/lazy.js"] = "el.style.cssText = 'color:#abcdef';\n"
    _play(files, scripts=("site-nav", "app"))
    assert hits(write_site(tmp_path, files), "D6") == ["assets/deep/lazy.js:1: #abcdef in JS string 'color:#abcdef'"]


def test_report_mode_survives_a_broken_input(tmp_path: Path, capsys: pytest.CaptureFixture) -> None:
    files = clean_site()
    files["vercel.json"] = "{not json"
    root = write_site(tmp_path, files)
    assert cd.main(["--root", str(root), "--report"]) == 0
    assert "the gate itself failed" in capsys.readouterr().out
    with pytest.raises(json.JSONDecodeError):
        cd.main(["--root", str(root)])


def test_copy_lint_is_spec_only_and_word_bounded(tmp_path: Path) -> None:
    files = clean_site()
    files["research.html"] = page("/research", "Research", body="<h1>R</h1><p>Nearest by cosine.</p>")
    _play(files, body="<h1>P</h1><p>The x64-d build and the 64-dimensional one.</p>")
    found = hits(write_site(tmp_path, files), "D21")
    assert [h.split(": ", 1)[1][:15] for h in found] == ["'64-d' in 'The ", "'cosine' in 'Ne"]
