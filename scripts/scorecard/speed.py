"""Speed: bytes per page against budgets.json, the bytes the byte gate does not count, and server time per page.

Bytes: the gate's own walk (page + the CSS/JS/JSON it references + JSON its JS references), using the ref parser,
literal regex, page globs and counted extensions imported from the checkout's scripts/budget_check.py (read only).
Sizes are git blob sizes at HEAD when the root is a git checkout (a Windows autocrlf checkout inflates text files;
wave 1's B-SPEED baseline is from git objects), else file sizes on disk (size_source says which).

Referenced but uncounted: every assets/... literal in the page and its counted CSS/JS that the gate's walk misses,
resolved as a browser would (JS literals against the page, CSS url() against the CSS file, '/x' root-absolute).

Server time: live mode only, time to response headers over ctx.ttfb_runs plain GETs per page (fresh connection
each), >= 1 s apart; the median of page medians. Offline it is null.
"""

from __future__ import annotations

import importlib.util
import posixpath
import re
import statistics
from pathlib import Path

from . import common as c

ANY_ASSET = re.compile(r"""['"`(]((?:\.{1,2}/)*/?assets/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+)([?#][^'"`)\s]*)?""")
ONE_MB = 1_000_000  # B-SPEED's "over 1 MB" line (bytes_per_page.csv over_1MB)


def _load_budget_check(path: Path):
    spec = importlib.util.spec_from_file_location("scorecard_budget_check", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class _Tree:
    def __init__(self, root: Path):
        self.root = root
        self.git = c.git_blob_sizes(root)
        self.source = "git ls-tree -r -l HEAD" if self.git is not None else "os.stat (not a git top level)"

    def size(self, rel: str) -> int | None:
        if self.git is not None:
            return self.git.get(rel)
        p = self.root / rel
        return p.stat().st_size if p.is_file() else None

    def text(self, rel: str) -> str:
        return (self.root / rel).read_text(encoding="utf-8", errors="replace")


def _resolve(b, tree: _Tree, ref: str, base: str) -> str | None:
    ref = ref.split("?")[0].split("#")[0]
    if not ref or ref.startswith(("http", "data:", "mailto:", "//")):
        return None
    if posixpath.splitext(ref)[1].lower() not in b.COUNTED_EXTENSIONS:
        return None
    p = ref[1:] if ref.startswith("/") else posixpath.normpath(posixpath.join(posixpath.dirname(base), ref))
    if p.startswith("../"):
        return None
    return p if tree.size(p) is not None else None


def _counted(b, tree: _Tree, page: str) -> set[str]:
    parser = b._Refs()
    parser.feed(tree.text(page))
    files: set[str] = set()
    for ref in parser.refs:
        hit = _resolve(b, tree, ref, page)
        if hit:
            files.add(hit)
    for block in parser.inline:
        for lit in b._ASSET_LITERAL.findall(block):
            hit = _resolve(b, tree, lit, page)
            if hit:
                files.add(hit)
    for js in [f for f in list(files) if f.endswith(".js")]:
        for lit in b._ASSET_LITERAL.findall(tree.text(js)):
            if lit.endswith(".json"):
                hit = _resolve(b, tree, lit, js)
                if hit:
                    files.add(hit)
    return files


def _uncounted(b, tree: _Tree, page: str, counted: set[str]) -> dict[str, int]:
    """{rel: bytes} of existing assets referenced by the page or its counted CSS/JS that the gate did not count."""
    found: dict[str, int] = {}
    for src in [page, *sorted(f for f in counted if f.endswith((".js", ".css")))]:
        for lit, _query in ANY_ASSET.findall(tree.text(src)):
            if lit.startswith("/"):
                rel = lit[1:]
            elif src.endswith(".css"):
                rel = posixpath.normpath(posixpath.join(posixpath.dirname(src), lit))
            else:
                rel = posixpath.normpath(posixpath.join(posixpath.dirname(page), lit))
            if rel.startswith("../") or rel in counted or rel == page:
                continue
            size = tree.size(rel)
            if size is not None:
                found[rel] = size
    return found


def _page_url(site: str, rel: str) -> str:
    return site.rstrip("/") + ("/" if rel == "index.html" else "/" + rel)


def measure(ctx: c.Ctx) -> dict:
    cmd = ctx.cmd
    out: dict = {}
    bc_path = ctx.budget_check or (ctx.root / "scripts" / "budget_check.py")
    budgets_rel = "budgets.json"
    names = (
        "page_bytes",
        "index_gate_bytes",
        "index_budget_bytes",
        "index_referenced_uncounted_bytes",
        "pages_over_1mb_incl_referenced",
    )
    if not Path(bc_path).is_file() or not (ctx.root / budgets_rel).is_file():
        why = f"needs {bc_path} and {ctx.root / budgets_rel}"
        for n in names:
            out[n] = c.null("bytes", why, command=cmd(f"speed.{n}"))
    else:
        b = _load_budget_check(Path(bc_path))
        tree = _Tree(ctx.root)
        budgets = c.load_json(ctx.root / budgets_rel).get("pages", {})
        pages = sorted(
            {
                p.relative_to(ctx.root).as_posix()
                for pat in b.PAGE_GLOBS
                for p in ctx.root.glob(pat)
                if tree.size(p.relative_to(ctx.root).as_posix()) is not None
            }
        )
        per: dict[str, dict] = {}
        for rel in pages:
            counted = _counted(b, tree, rel)
            gate = tree.size(rel) + sum(tree.size(f) for f in counted)
            unc = _uncounted(b, tree, rel, counted)
            unc_cjj = sum(v for k, v in unc.items() if posixpath.splitext(k)[1].lower() in b.COUNTED_EXTENSIONS)
            budget = (budgets.get(rel) or {}).get("budget_bytes")
            per[rel] = {
                "gate_bytes": gate,
                "budget_bytes": budget,
                "pct_of_budget": round(100.0 * gate / budget, 2) if budget else None,
                "referenced_uncounted_css_js_json_bytes": unc_cjj,
                "referenced_uncounted_other_bytes": sum(unc.values()) - unc_cjj,
                "total_incl_referenced_css_js_json": gate + unc_cjj,
                "uncounted_largest": sorted(unc.items(), key=lambda kv: -kv[1])[:5],
            }
        inputs = [c.file_input(ctx.root, budgets_rel), {"path": Path(bc_path).as_posix(), "sha256": c.sha256_file(Path(bc_path))}]
        tree_in = {"path": "git tree HEAD" if tree.git is not None else ctx.root.as_posix(), "size_source": tree.source}
        inputs.append(tree_in)
        over = [p for p, r in per.items() if r["budget_bytes"] and r["gate_bytes"] > r["budget_bytes"]]
        out["page_bytes"] = c.metric(
            len(over), "pages over budget (gate bytes)", command=cmd("speed.page_bytes"), inputs=inputs, fetched_at=None,
            detail={"pages_measured": len(per), "over_budget": over, "size_source": tree.source, "pages": per},
        )  # fmt: skip
        idx = per.get("index.html")
        for n, key, unit in (
            ("index_gate_bytes", "gate_bytes", "bytes"),
            ("index_budget_bytes", "budget_bytes", "bytes"),
            ("index_referenced_uncounted_bytes", "referenced_uncounted_css_js_json_bytes", "bytes"),
        ):
            if idx is None or idx[key] is None:
                out[n] = c.null(unit, "index.html or its budget is not in this checkout", command=cmd(f"speed.{n}"))
            else:
                out[n] = c.metric(idx[key], unit, command=cmd(f"speed.{n}"), inputs=inputs, fetched_at=None)
        big = sorted(p for p, r in per.items() if r["total_incl_referenced_css_js_json"] > ONE_MB)
        out["pages_over_1mb_incl_referenced"] = c.metric(
            len(big), "pages", command=cmd("speed.pages_over_1mb_incl_referenced"), inputs=inputs, fetched_at=None,
            detail={"pages": big, "threshold_bytes": ONE_MB},
        )  # fmt: skip
        ctx.notes.append(f"speed pages: {len(per)}")
        ctx.speed_pages = pages  # for the live timing pass

    if ctx.offline or ctx.fetcher is None:
        out["ttfb_median_ms"] = c.null("ms", "offline mode makes no request", command=cmd("speed.ttfb_median_ms"))
        return out
    pages = ctx.speed_pages or ["index.html"]
    medians, per_page, times, inputs = [], {}, [], []
    for rel in pages:
        url = _page_url(ctx.site_url, rel)
        runs, codes = [], []
        for _ in range(ctx.ttfb_runs):
            r = ctx.fetcher.get(url, use_cache=False)
            codes.append(r.status)
            times.append(r.retrieved_at)
            if r.status == 200 and r.seconds_to_headers is not None:
                runs.append(round(r.seconds_to_headers * 1000, 1))
        per_page[rel] = {"url": url, "codes": codes, "ttfb_ms": runs}
        inputs.append({"url": url, "status": codes})
        if runs:
            medians.append(statistics.median(runs))
    if not medians:
        out["ttfb_median_ms"] = c.null("ms", "no page answered 200", command=cmd("speed.ttfb_median_ms"), detail=per_page)
    else:
        out["ttfb_median_ms"] = c.metric(
            round(statistics.median(medians), 1), "ms (median of page medians, time to response headers)",
            command=cmd("speed.ttfb_median_ms"), inputs=inputs, fetched_at=c.latest_time(times),
            detail={"runs_per_page": ctx.ttfb_runs, "range_of_page_medians": [min(medians), max(medians)], "pages": per_page},
        )  # fmt: skip
    return out
