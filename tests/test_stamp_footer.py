"""scripts/stamp_footer.py: one footer from site-nav.js, stamped into every served page.

A synthetic site in tmp_path (assets/site-nav.js with EXPLORE and GAMES, pages in
the four PAGE_GLOBS shapes) exercises the three stamping cases - insert where a
page has no footer, replace a legacy `<footer class="site-footer">`, replace a
stale stamped block - the byte-compare `--check` that fails on drift, and the
two refusals: a list the parser cannot read in full, a page that would keep two
footers. The last test pins the repo's own site-nav.js so a broken literal fails
here, not in CI's stamp step.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


sf = _load("stamp_footer")

SITE_NAV = """\
(function (global) {
  var MAP = { href: '/#atlas', label: 'Map' };
  // the drawer; a ] in this comment must not end the list
  var EXPLORE = [
    { href: '/', label: 'Atlas', desc: 'The map' },
    { href: '/map-guess', label: 'Map Hunt', desc: 'Find the star' }, // trailing comment with ] too
    { href: '/live', label: 'Live', desc: 'Live companion [beta]', live: true },
    { href: '/twin-network', label: 'Twin Networks', desc: 'Every player\\u2019s neighbors' },
    { href: '/methods', label: 'Methods', desc: 'Trust' }, /* block ] comment */
    { href: '/models/mtnn-v5', label: 'Models', desc: 'Model registry' }
  ];
  var GAMES = [
    { href: '/play', label: 'Daily Court' },
    { href: '/map-guess', label: 'Map Hunt' },
    { href: '/replay', label: "Pixel Replay" }
  ];
  global.VHSiteNav = { explore: EXPLORE, games: GAMES };
})(window);
"""

LEGACY = (
    '<footer class="site-footer">\n  <p>Every number recomputable · cosine similarity in the 64-dimensional '
    "MTNN v5 embedding.</p>\n</footer>"
)


def page(body: str) -> str:
    return f"<!doctype html>\n<html><head><title>t</title></head>\n<body>\n<main>hi</main>\n{body}</body></html>\n"


@pytest.fixture
def site(tmp_path: Path) -> Path:
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "site-nav.js").write_text(SITE_NAV, encoding="utf-8", newline="\n")
    (tmp_path / "play").mkdir()
    (tmp_path / "insights").mkdir()
    # a legacy footer to replace; a page with no footer at all (one-line </body></html>);
    # a stamped block gone stale; the deferred pages; a generated stub
    (tmp_path / "legacy.html").write_text(page(LEGACY + '\n<script src="x.js"></script>\n'), encoding="utf-8")
    (tmp_path / "bare.html").write_text(page(""), encoding="utf-8")
    stale = f'{sf.BEGIN}\n<footer class="site-footer">old</footer>\n{sf.END}\n'
    (tmp_path / "play" / "game.html").write_text(page(stale), encoding="utf-8")
    for deferred in sf.DEFER:
        (tmp_path / deferred).write_text(page(LEGACY + "\n"), encoding="utf-8")
    (tmp_path / "insights" / "stub.html").write_text(page(""), encoding="utf-8")
    return tmp_path


def snapshot(root: Path) -> dict[Path, bytes]:
    return {p: p.read_bytes() for p in sf.pages(root)}


def stamped_block(root: Path) -> str:
    explore, games = sf.load_lists(root)
    return sf.render(explore, games)


def test_lists_parse_tolerantly(site: Path) -> None:
    explore, games = sf.load_lists(site)
    assert [e["href"] for e in explore] == ["/", "/map-guess", "/live", "/twin-network", "/methods", "/models/mtnn-v5"]
    assert explore[2]["desc"] == "Live companion [beta]"  # a ] inside a string does not end the array
    assert explore[3]["label"] == "Twin Networks"
    assert [g["label"] for g in games] == ["Daily Court", "Map Hunt", "Pixel Replay"]
    assert sf.nav_list("var X = [ { href: '/a', label: 'A' }", "X") == []  # never closes
    assert sf.nav_list("nothing here", "GAMES") == []


def test_unreadable_entry_is_refused_not_dropped() -> None:
    nested = "var X = [\n  { href: '/a', label: 'A' },\n  { href: '/b', label: 'B', meta: { k: 1 } }\n];"
    with pytest.raises(ValueError, match="parsed 1 of 2"):
        sf.nav_list(nested, "X")
    brace = "var X = [\n  { href: '/a', label: 'A' },\n  { href: '/b', label: 'B }' }\n];"
    with pytest.raises(ValueError, match="parsed 1 of 2"):
        sf.nav_list(brace, "X")
    unquoted = "var X = [\n  { href: '/a', label: 'A' },\n  { href: PATH, label: 'B' }\n];"
    with pytest.raises(ValueError, match="parsed 1 of 2"):
        sf.nav_list(unquoted, "X")


def test_columns_derive_from_the_lists(site: Path) -> None:
    explore, games = sf.load_lists(site)
    cols = dict(sf.columns(explore, games))
    assert [label for _, label in cols["Play"]] == ["Daily Court", "Map Hunt", "Pixel Replay"]
    # Explore drops the brand slot, the games and the How-it-works doors, keeps EXPLORE's order
    assert cols["Explore"] == [("/live", "Live"), ("/twin-network", "Twin Networks")]
    assert cols["How it works"] == [
        ("/methods", "Methods"),
        ("/models/mtnn-v5", "Models"),
        (sf.SOURCE_URL, "Source on GitHub"),
    ]


def test_render_uses_shell_classes_and_no_model_jargon(site: Path) -> None:
    block = stamped_block(site)
    assert block.startswith(sf.BEGIN) and block.endswith(sf.END)
    for cls in ("site-footer__sitemap", "site-footer__col", "site-footer__col-title", "site-footer__attribution"):
        assert cls in block
    assert 'aria-label="Sitemap"' in block
    assert f'<a href="{sf.SOURCE_URL}" rel="noopener">Source on GitHub</a>' in block
    assert "stats.nba.com and ESPN" in block and "dumbmodel" in block
    for word in ("MTNN", "64-d", "cosine", "embedding"):
        assert word not in block
    assert "\r" not in block and ".html" not in block


def test_insert_replace_and_lf(site: Path) -> None:
    assert sf.main(["--root", str(site)]) == 0
    block = stamped_block(site)
    for rel in ("legacy.html", "bare.html", "play/game.html", "insights/stub.html"):
        raw = (site / rel).read_bytes()
        text = raw.decode("utf-8")
        assert text.count("<footer") == 1, rel
        assert block in text, rel
        assert b"\r" not in raw, rel
    legacy = (site / "legacy.html").read_text(encoding="utf-8")
    assert "MTNN" not in legacy and '<script src="x.js"></script>' in legacy
    bare = (site / "bare.html").read_text(encoding="utf-8")
    assert bare.endswith(f"{sf.END}\n</body></html>\n")  # inserted before the one-line </body></html>
    game = (site / "play" / "game.html").read_text(encoding="utf-8")
    assert ">old</footer>" not in game and game.count(sf.BEGIN) == 1


def test_deferred_pages_are_left_alone(site: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert "offline.html" not in sf.DEFER and "index.html" not in sf.DEFER  # offline shelled in 2.7, index after #165
    before = {name: (site / name).read_bytes() for name in sf.DEFER}
    assert sf.main(["--root", str(site)]) == 0
    assert {name: (site / name).read_bytes() for name in sf.DEFER} == before
    assert sf.main(["--root", str(site), "--check"]) == 0
    out = capsys.readouterr().out
    for name, reason in sf.DEFER.items():
        assert f"defer {name}: {reason}" in out


def test_check_fails_on_drift_and_stamp_repairs(site: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert sf.main(["--root", str(site), "--check"]) == 1  # nothing stamped yet
    assert sf.main(["--root", str(site)]) == 0
    assert sf.main(["--root", str(site), "--check"]) == 0
    first = (site / "legacy.html").read_bytes()
    assert sf.main(["--root", str(site)]) == 0
    assert (site / "legacy.html").read_bytes() == first  # idempotent

    drifted = (site / "bare.html").read_text(encoding="utf-8").replace("Daily Court", "Daily Courts")
    (site / "bare.html").write_text(drifted, encoding="utf-8")
    capsys.readouterr()
    assert sf.main(["--root", str(site), "--check"]) == 1
    out = capsys.readouterr().out
    assert "bare.html" in out and "legacy.html" not in out and "stamp_footer.py" in out
    assert "Daily Courts" in (site / "bare.html").read_text(encoding="utf-8")  # --check wrote nothing

    assert sf.main(["--root", str(site)]) == 0
    assert sf.main(["--root", str(site), "--check"]) == 0


def test_crlf_checkout_compares_clean(site: Path) -> None:
    assert sf.main(["--root", str(site)]) == 0
    lf = (site / "bare.html").read_bytes()
    (site / "bare.html").write_bytes(lf.replace(b"\n", b"\r\n"))
    assert sf.main(["--root", str(site), "--check"]) == 0
    assert sf.main(["--root", str(site)]) == 0
    assert b"\r\n" in (site / "bare.html").read_bytes()  # an up-to-date page is not rewritten


def test_unreadable_list_aborts_before_writing(site: Path, capsys: pytest.CaptureFixture[str]) -> None:
    nav = site / "assets" / "site-nav.js"
    before = snapshot(site)
    nav.write_text(SITE_NAV.replace("var GAMES", "var NOT_GAMES"), encoding="utf-8")
    assert sf.main(["--root", str(site)]) == 2
    nav.write_text(SITE_NAV.replace("desc: 'Trust'", "desc: 'Trust', meta: { k: 1 }"), encoding="utf-8")
    assert sf.main(["--root", str(site)]) == 2
    assert "parsed 5 of 6" in capsys.readouterr().out
    assert snapshot(site) == before


def test_page_without_body_fails(site: Path) -> None:
    (site / "broken.html").write_text("<html><p>no body tag</p></html>", encoding="utf-8")
    assert sf.main(["--root", str(site)]) == 1
    assert sf.main(["--root", str(site), "--check"]) == 1


def test_second_footer_fails_both_modes(site: Path, capsys: pytest.CaptureFixture[str]) -> None:
    twice = page(LEGACY + "\n<noscript><footer>plain</footer></noscript>\n")
    (site / "twice.html").write_text(twice, encoding="utf-8")
    assert sf.main(["--root", str(site)]) == 1
    assert "twice.html: 2 <footer>" in capsys.readouterr().out
    assert (site / "twice.html").read_text(encoding="utf-8") == twice  # refused, not half-stamped
    assert sf.main(["--root", str(site), "--check"]) == 1
    assert (site / "legacy.html").read_text(encoding="utf-8").count(sf.BEGIN) == 1  # the others still stamped


def test_repo_site_nav_parses() -> None:
    explore, games = sf.load_lists(ROOT)
    assert [g["href"] for g in games] == ["/play", "/map-guess", "/twenty-questions", "/play/era-crossed", "/replay"]
    assert [e["href"] for e in explore] == [
        "/",
        "/map-guess",
        "/live",
        "/schedule",
        "/players",
        "/insights",
        "/twin-network",
        "/playoff-runs",
        "/twenty-questions",
        "/taxonomy",
        "/methods",
        "/models/mtnn-v5",
    ]
    cols = dict(sf.columns(explore, games))
    assert "/" not in {h for h, _ in cols["Explore"]}
    assert not {h for h, _ in cols["Play"]} & {h for h, _ in cols["Explore"]}
