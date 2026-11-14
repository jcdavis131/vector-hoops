"""scripts/check_dead_links.py: routes come from vercel.json, and a dead link fails.

Fixture sites are built in tmp_path (a vercel.json, a few pages, one module under
assets/). The checker is called as a function with its known list set to empty,
so each case is about exactly one link. One test crawls the real tree and holds
the dead set to the four known entries, and three more drive the known list in
both directions.
"""

from __future__ import annotations

import importlib.util
import json
import shutil
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def _load():
    spec = importlib.util.spec_from_file_location("check_dead_links", ROOT / "scripts" / "check_dead_links.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["check_dead_links"] = mod
    spec.loader.exec_module(mod)
    return mod


cdl = _load()

REWRITES = [
    {"source": "/guide", "destination": "/guide.html"},
    {"source": "/methods", "destination": "/methods.html"},
    {"source": "/insights", "destination": "/insights.html"},
    {"source": "/insights/:slug", "destination": "/insights/:slug.html"},
    {"source": "/api/feed", "destination": "https://feed.example/api"},
]
REDIRECTS = [{"source": "/model", "destination": "/methods", "permanent": True}]


def make_site(tmp_path, rewrites=REWRITES, redirects=REDIRECTS, index_links="", js="", methods_ids=("frontier",)):
    (tmp_path / "assets").mkdir()
    (tmp_path / "insights").mkdir()
    (tmp_path / "vercel.json").write_text(json.dumps({"rewrites": rewrites, "redirects": redirects}, indent=2))
    (tmp_path / "assets" / "insights.json").write_text(json.dumps({"insights": [{"slug": "cap-story"}]}))
    (tmp_path / "index.html").write_text(f"<html><body><a href='/guide'>g</a>{index_links}</body></html>")
    (tmp_path / "guide.html").write_text("<html><body id=top><a href='/'>home</a></body></html>")
    ids = "".join(f'<h2 id="{i}"></h2>' for i in methods_ids)
    (tmp_path / "methods.html").write_text(f"<html><body>{ids}</body></html>")
    (tmp_path / "insights.html").write_text("<html><body></body></html>")
    (tmp_path / "insights" / "cap-story.html").write_text("<html><body></body></html>")
    (tmp_path / "assets" / "mod.js").write_text(js)
    return tmp_path


def dead(root):
    return cdl.find_dead(root)[2]


def keys(root):
    return sorted(dead(root))


def test_clean_fixture_has_no_dead_links(tmp_path):
    make_site(tmp_path, index_links="<a href='/model'>m</a><a href='/insights/cap-story'>i</a>")
    assert dead(tmp_path) == {}


def test_link_to_a_rewritten_route_passes_and_fails_without_the_rewrite(tmp_path):
    make_site(tmp_path)
    assert dead(tmp_path) == {}
    cfg = json.loads((tmp_path / "vercel.json").read_text())
    cfg["rewrites"] = [r for r in cfg["rewrites"] if r["source"] != "/guide"]
    (tmp_path / "vercel.json").write_text(json.dumps(cfg))
    assert keys(tmp_path) == [("index.html", "/guide")]


def test_a_plain_missing_page_fails_with_file_and_line(tmp_path):
    make_site(tmp_path, index_links="<a href='/nope'>x</a>")
    d = dead(tmp_path)
    assert list(d) == [("index.html", "/nope")]
    assert d[("index.html", "/nope")][0] == 1


def test_dead_anchor_fails_with_a_message(tmp_path):
    make_site(tmp_path, index_links="<a href='/methods#nope'>x</a><a href='/methods#frontier'>ok</a>")
    d = dead(tmp_path)
    assert list(d) == [("index.html", "/methods#nope")]
    assert "dead anchor #nope" in d[("index.html", "/methods#nope")][1]


def test_redirect_keeps_the_link_fragment_when_the_destination_has_none(tmp_path):
    make_site(tmp_path, index_links="<a href='/model#frontier'>ok</a><a href='/model#gone'>bad</a>")
    assert keys(tmp_path) == [("index.html", "/model#gone")]


def test_redirect_destination_fragment_must_exist(tmp_path):
    redirects = [{"source": "/research", "destination": "/methods#absent", "permanent": True}]
    make_site(tmp_path, redirects=redirects)
    d = dead(tmp_path)
    assert list(d) == [("vercel.json", "/research -> /methods#absent")]
    line, why = d[("vercel.json", "/research -> /methods#absent")]
    assert line > 0 and "dead anchor #absent" in why


def test_redirect_to_a_missing_page_fails(tmp_path):
    redirects = [{"source": "/old", "destination": "/gone", "permanent": True}]
    make_site(tmp_path, redirects=redirects)
    assert keys(tmp_path) == [("vercel.json", "/old -> /gone")]


def test_href_in_a_js_string_to_a_missing_anchor_fails(tmp_path):
    js = "el.innerHTML = '<a href=\"/methods#nope\">x</a>';\nother = \"<a href='/methods#frontier'>ok</a>\";\n"
    make_site(tmp_path, js=js)
    d = dead(tmp_path)
    assert list(d) == [("assets/mod.js", "/methods#nope")]
    assert d[("assets/mod.js", "/methods#nope")][0] == 1


def test_js_escaped_quotes_and_assignment_forms_are_read(tmp_path):
    js = "a = \"<a href=\\\"/nope1\\\">\";\nb.href = '/nope2';\nc.href = '/guide';\n"
    make_site(tmp_path, js=js)
    assert keys(tmp_path) == [("assets/mod.js", "/nope1"), ("assets/mod.js", "/nope2")]


def test_js_template_values_are_skipped_and_a_live_prefix_passes(tmp_path):
    js = "x = '<a href=\"/guide?q=' + q + '\">';\ny = `<a href=\"/${slug}\">`;\n"
    make_site(tmp_path, js=js)
    assert dead(tmp_path) == {}


def test_js_prefix_path_is_resolved_and_a_dead_prefix_is_reported(tmp_path):
    js = "x = '<a href=\"/nope-guide?q=' + q + '\">';\ny = '<a href=\"/guide?q=' + q + '\">';\n"
    make_site(tmp_path, js=js)
    d = dead(tmp_path)
    assert list(d) == [("assets/mod.js", "/nope-guide?q=")]
    assert d[("assets/mod.js", "/nope-guide?q=")][0] == 1


def test_js_prefix_cut_at_a_hash_checks_the_path_and_no_query_is_the_named_allowance(tmp_path):
    js = "x = '<a href=\"/nope#a' + q + '\">';\ny = '<a href=\"/nope/' + slug + '\">';\n"
    make_site(tmp_path, js=js)
    assert keys(tmp_path) == [("assets/mod.js", "/nope#a")]
    assert "open_prefix_without_query" in cdl.JS_ALLOWANCES


def test_js_string_closed_and_joined_with_plus_continues_at_run_time(tmp_path):
    js = (
        "a.href = '/guide#sec-' + id;\n"
        "b = '<a href=\"/guide#sec-' + id;\n"
        "c.href = '/x/' + v;\n"
        "d = '<a href=\"/x/' + v;\n"
        "e.href = '/guide?q=' + v;\n"
        "f.href = '/nope?q=' + v;\n"
    )
    make_site(tmp_path, js=js)
    d = dead(tmp_path)
    assert list(d) == [("assets/mod.js", "/nope?q=")]
    assert d[("assets/mod.js", "/nope?q=")][0] == 6


def test_a_closed_string_not_joined_is_judged_whole(tmp_path):
    make_site(tmp_path, js="a.href = '/guide#nope'\n  + '';\nb.href = '/guide#nope2';\n")
    assert keys(tmp_path) == [("assets/mod.js", "/guide#nope2")]


def test_redirect_destination_with_a_param_is_judged_through_its_links(tmp_path):
    redirects = [{"source": "/player/:slug", "destination": "/insights/:slug", "permanent": True}]
    make_site(tmp_path, redirects=redirects, index_links="<a href='/player/cap-story'>ok</a>")
    assert dead(tmp_path) == {}
    (tmp_path / "index.html").write_text("<a href='/player/cap-story'>ok</a><a href='/player/missing'>bad</a>")
    assert keys(tmp_path) == [("index.html", "/player/missing")]


def test_js_in_nested_asset_folders_is_crawled(tmp_path):
    make_site(tmp_path)
    (tmp_path / "assets" / "sub").mkdir()
    (tmp_path / "assets" / "sub" / "m.js").write_text("a.href = '/nope-sub';\n")
    assert keys(tmp_path) == [("assets/sub/m.js", "/nope-sub")]


def test_models_folder_pages_are_crawled_without_public(tmp_path):
    make_site(tmp_path)
    (tmp_path / "models").mkdir()
    (tmp_path / "models" / "m.html").write_text("<a href='/nope-model'>x</a>")
    assert not (tmp_path / "public").exists()
    assert keys(tmp_path) == [("models/m.html", "/nope-model")]


def test_public_pages_are_crawled_at_any_depth_without_a_root_twin(tmp_path):
    make_site(tmp_path)
    shutil.copytree(tmp_path, tmp_path / "public", ignore=shutil.ignore_patterns("public", "vercel.json"))
    (tmp_path / "public" / "play").mkdir()
    (tmp_path / "public" / "play" / "x.html").write_text("<a href='/nope-pub'>x</a>")
    assert keys(tmp_path) == [("public/play/x.html", "/nope-pub")]


def test_js_object_literal_href_is_checked(tmp_path):
    js = "var LINKS = [\n  { href: '/guide', label: 'Guide' },\n  { href: '/nope-guide', label: 'Bad' },\n];\n"
    make_site(tmp_path, js=js)
    d = dead(tmp_path)
    assert list(d) == [("assets/mod.js", "/nope-guide")]
    assert d[("assets/mod.js", "/nope-guide")][0] == 3


def test_pages_in_subfolders_are_crawled(tmp_path):
    make_site(tmp_path)
    (tmp_path / "play").mkdir()
    (tmp_path / "play" / "x.html").write_text("<a href='/missing'>m</a><img src='/assets/none.png'>")
    assert keys(tmp_path) == [("play/x.html", "/assets/none.png"), ("play/x.html", "/missing")]


def test_external_proxy_rewrite_counts_as_served(tmp_path):
    make_site(tmp_path, index_links="<a href='/api/feed'>f</a>")
    assert dead(tmp_path) == {}


def test_parameterised_rewrite_resolves_to_its_file(tmp_path):
    make_site(tmp_path, index_links="<a href='/insights/cap-story'>a</a><a href='/insights/missing'>b</a>")
    assert keys(tmp_path) == [("index.html", "/insights/missing")]


def test_insights_slug_fragment_counts_only_on_insights_html(tmp_path):
    make_site(
        tmp_path,
        index_links="<a href='/insights#cap-story'>ok</a><a href='/insights#cut'>bad</a><a href='/methods#cap-story'>bad2</a>",
    )
    assert keys(tmp_path) == [("index.html", "/insights#cut"), ("index.html", "/methods#cap-story")]


def test_public_twin_is_crawled_against_public_files(tmp_path):
    make_site(tmp_path)
    pub = tmp_path / "public"
    shutil.copytree(tmp_path, pub, ignore=shutil.ignore_patterns("public", "vercel.json"))
    assert dead(tmp_path) == {}
    (pub / "guide.html").unlink()
    assert keys(tmp_path) == [("public/index.html", "/guide")]


def test_root_finding_and_its_public_twin_are_one_defect(tmp_path):
    make_site(tmp_path, index_links="<a href='/nope'>x</a>")
    shutil.copytree(tmp_path, tmp_path / "public", ignore=shutil.ignore_patterns("public", "vercel.json"))
    assert keys(tmp_path) == [("index.html", "/nope")]


def test_only_served_folders_are_crawled(tmp_path):
    make_site(tmp_path, index_links="<a href='/nope'>x</a>")
    for d in (".claude/worktrees/w1", ".vercel/output/static", "dist", "research"):
        (tmp_path / d).mkdir(parents=True)
        shutil.copy(tmp_path / "index.html", tmp_path / d / "index.html")
        (tmp_path / d / "other.html").write_text("<a href='/also-nope'>y</a>")
    assert keys(tmp_path) == [("index.html", "/nope")]
    (tmp_path / "teams").mkdir()
    (tmp_path / "teams" / "x.html").write_text("<a href='/teams-nope'>t</a>")
    assert keys(tmp_path) == [("index.html", "/nope"), ("teams/x.html", "/teams-nope")]


def test_redirect_to_another_host_is_served_and_fetches_nothing(tmp_path):
    redirects = [{"source": "/gh", "destination": "https://example.org/x", "permanent": True}]
    make_site(tmp_path, redirects=redirects, index_links="<a href='/gh'>g</a><a href='/gh#frag'>h</a>")
    assert dead(tmp_path) == {}


def test_dot_slash_and_trailing_slash_links_resolve(tmp_path):
    make_site(tmp_path, index_links="<a href='./'>a</a><a href='/play/'>b</a><a href='/guide/'>c</a>")
    (tmp_path / "play").mkdir()
    (tmp_path / "play" / "x.html").write_text("<a href='./'>up</a><a href='../'>root</a><a href='../guide/'>g</a>")
    cfg = json.loads((tmp_path / "vercel.json").read_text())
    cfg["rewrites"].append({"source": "/play", "destination": "/play.html"})
    (tmp_path / "vercel.json").write_text(json.dumps(cfg))
    (tmp_path / "play.html").write_text("<html></html>")
    # ./ in play/x.html is /play/ -> /play (a rewrite); ../ is the root page
    assert dead(tmp_path) == {}
    (tmp_path / "play" / "x.html").write_text("<a href='../nope/'>n</a>")
    assert keys(tmp_path) == [("play/x.html", "../nope/")]


def test_relative_links_are_judged(tmp_path):
    make_site(tmp_path)
    (tmp_path / "insights" / "cap-story.html").write_text(
        "<a href='../guide.html'>ok</a><a href='../nope.html'>bad</a><a href='sibling.html'>bad2</a>"
        "<a href='../methods.html#nope'>bad3</a><a href='?x=1'>q</a>"
    )
    assert keys(tmp_path) == [
        ("insights/cap-story.html", "../methods.html#nope"),
        ("insights/cap-story.html", "../nope.html"),
        ("insights/cap-story.html", "sibling.html"),
    ]


def test_link_fragment_beats_nothing_the_redirect_destination_fragment_wins(tmp_path):
    redirects = [{"source": "/research", "destination": "/methods#frontier", "permanent": True}]
    make_site(tmp_path, redirects=redirects, methods_ids=("frontier",), index_links="<a href='/research#absent'>r</a>")
    assert dead(tmp_path) == {}
    # without a destination fragment the link's own fragment is checked
    redirects = [{"source": "/research", "destination": "/methods", "permanent": True}]
    (tmp_path / "vercel.json").write_text(json.dumps({"rewrites": REWRITES, "redirects": redirects}))
    assert keys(tmp_path) == [("index.html", "/research#absent")]


def test_redirect_beats_a_file_on_disk(tmp_path):
    redirects = [{"source": "/moved.html", "destination": "/methods", "permanent": True}]
    make_site(tmp_path, redirects=redirects, index_links="<a href='/moved.html#frontier'>m</a>")
    (tmp_path / "moved.html").write_text("<html><body></body></html>")
    assert dead(tmp_path) == {}


def test_star_param_spans_segments_and_plain_param_does_not(tmp_path):
    rewrites = [*REWRITES, {"source": "/files/:rest*", "destination": "/guide.html"}]
    make_site(
        tmp_path,
        rewrites=rewrites,
        index_links="<a href='/files/a/b/c'>deep</a><a href='/insights/cap-story/extra'>two</a>",
    )
    assert keys(tmp_path) == [("index.html", "/insights/cap-story/extra")]


# the known list: strict in both directions


def run(root, known):
    lines: list[str] = []
    return cdl.run(root, known=known, out=lines.append), "\n".join(lines)


def test_unknown_dead_link_exits_1_and_names_it(tmp_path):
    make_site(tmp_path, index_links="<a href='/nope'>x</a>")
    rc, out = run(tmp_path, ())
    assert rc == 1 and "index.html:1: DEAD -> /nope" in out


def test_known_dead_link_passes_and_is_printed_with_file_and_line(tmp_path):
    make_site(tmp_path, index_links="<a href='/nope'>x</a>")
    rc, out = run(tmp_path, (("index.html", "/nope", "fixture"),))
    assert rc == 0 and "KNOWN" in out and "index.html:1  /nope" in out


def test_known_entry_that_stopped_being_dead_exits_1(tmp_path):
    make_site(tmp_path)
    rc, out = run(tmp_path, (("index.html", "/guide", "fixture"),))
    assert rc == 1 and "no longer dead" in out and "/guide" in out


def test_removing_a_known_entry_while_the_link_is_dead_exits_1(tmp_path):
    make_site(tmp_path, index_links="<a href='/nope'>x</a><a href='/nope2'>y</a>")
    rc, out = run(tmp_path, (("index.html", "/nope", "fixture"),))
    assert rc == 1 and "/nope2" in out


# the real tree


def test_real_tree_dead_set_is_exactly_the_known_four():
    n_root, n_pub, d = cdl.find_dead(ROOT)
    assert n_root > 0 and n_pub > 0
    assert sorted(d) == sorted((f, link) for f, link, _ in cdl.KNOWN)
    assert len(cdl.KNOWN) == 4


def test_real_tree_run_exits_0_and_prints_the_known_heading():
    lines: list[str] = []
    assert cdl.run(ROOT, out=lines.append) == 0
    text = "\n".join(lines)
    assert "KNOWN" in text and "players.html:148" in text
    # The vercel.json line moves whenever a redirect is added above it, so match the link, not the line.
    assert any(row.strip().startswith("vercel.json:") and "/research -> /methods#frontier" in row for row in lines)


def test_main_takes_a_root_argument(tmp_path, capsys):
    make_site(tmp_path, index_links="<a href='/nope'>x</a>")
    assert cdl.main(["--root", str(tmp_path)]) == 1
    assert "/nope" in capsys.readouterr().out


@pytest.mark.parametrize("name", sorted(cdl.JS_ALLOWANCES))
def test_each_js_allowance_has_a_reason(name):
    assert cdl.JS_ALLOWANCES[name]
