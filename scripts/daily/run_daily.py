"""Daily box pipeline for hoops.dumbmodel.com (feeds plan P4). One run, no person needed.

Runs on the operator box (residential IP: cdn.nba.com answers it), CPU only, under a
run lock so two runs never overlap. Steps, each idempotent and logged:

  a. fetch   finished games' play-by-play and box scores from cdn.nba.com into the box
             cache (pipeline/fetch_cdn_games.py under wt/locks/nba-fetch.sh, D8)
  b. replays copy new cache files into the tree's pipeline/cache, then
             scripts/refresh_replays.py (build_replays + sync_public)
  c. maphunt scripts/build_map_hunt.py extends the window to today + 21, then --check
  d. status  write assets/realtime/daily_pipeline.json from this run's probes, then
             scripts/build_status.py and its --check
  e. stamp   stamp_assets, stamp_footer, sync_public, then every check: stamp_assets,
             stamp_footer, sync_public and build_replays --check, build_map_hunt --check,
             build_twenty_questions --check, check_site_facts, budget_check
  f. pr      (--open-pr only) branch data/daily-YYYY-MM-DD in the tree, commit the data
             files the run changed, push, open a PR. Without --open-pr nothing is pushed.

A failed fetch does not stop the run: Map Hunt and status still roll, and the exit code
says what failed. The tree must be clean before a --open-pr run; the scheduled wrapper
(run_daily.ps1) resets a dedicated worktree to origin/master first.

    python scripts/daily/run_daily.py                    # dry run in this checkout: a-e
    python scripts/daily/run_daily.py --open-pr          # a-f (the scheduled task)
    python scripts/daily/run_daily.py --skip-fetch       # b-e from what is cached

Receipts: docs/platform/daily-pipeline.md. Exit 0 all green; 1 a step or check failed;
2 the fetch failed or was blocked (the other steps still ran); 4 another run holds the lock.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from collections.abc import Iterable
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
LOCKS = Path(os.environ.get("HOOPS_LOCKS_DIR", r"C:\Users\jcdav\wt\locks"))
STATE_DIR = Path(os.environ.get("HOOPS_DAILY_HOME", Path.home() / ".hoops-daily"))
RECEIPT = Path("assets") / "realtime" / "daily_pipeline.json"
STALE_AFTER_MIN = 36 * 60  # a daily feed: one missed night is not stale, two are
LOCK_STALE_S = 6 * 3600
PR_HEAD = "DO NOT MERGE without Cam's word (daily data PR; CI-gated)"
PR_FOOT = "🤖 Generated with [Claude Code](https://claude.com/claude-code)"

# What a run may change. Anything else showing up in `git status` stops step f.
DATA_PREFIXES = (
    "pipeline/cache/cdn_pbp/",
    "pipeline/cache/cdn_box/",
    "assets/",
    "public/",
)
FORBIDDEN_PREFIXES = ("api/", ".github/", "scripts/", "tests/", "pipeline/")
FORBIDDEN_FILES = ("vercel.json", "sw.js", "public/sw.js", "public/vercel.json")


# ---------------------------------------------------------------------------
# pure parts (tests/test_daily_pipeline.py)
# ---------------------------------------------------------------------------


def classify_changes(porcelain: Iterable[str]) -> tuple[list[str], list[str]]:
    """Split `git status --porcelain` lines into (data paths, paths a data run must not touch)."""
    data, bad = [], []
    for line in porcelain:
        if not line.strip():
            continue
        path = line[3:].strip().strip('"')
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        path = path.replace("\\", "/")
        top_html = "/" not in path and path.endswith(".html")
        if path in FORBIDDEN_FILES:
            bad.append(path)
        elif path.startswith(DATA_PREFIXES) or top_html:
            data.append(path)
        else:  # code (FORBIDDEN_PREFIXES) or anything unexpected
            bad.append(path)
    return sorted(data), sorted(bad)


def _row(prev: dict | None, *, ok: bool, now: str, latency: int | None, detail: str, down: bool = False) -> dict:
    prev = prev or {}
    fails = 0 if ok else int(prev.get("consecutive_failures") or 0) + 1
    return {
        "checked_at": now,
        "status": "ok" if ok else ("down" if down else "degraded"),
        "last_good_tick": now if ok else prev.get("last_good_tick"),
        "latency_ms": latency,
        "consecutive_failures": fails,
        "detail": detail,
        "stale_after_minutes": STALE_AFTER_MIN,
    }


def build_receipt(prev: dict | None, report: dict | None, steps: dict[str, bool], now: str) -> dict:
    """The status rows for this run. A feed is good when nothing it owes failed this run.

    report is fetch_cdn_games.py's --report (None when the fetch was skipped or died
    before writing one). Rows the run did not exercise keep their previous values.
    """
    prev_src = (prev or {}).get("sources") or {}
    src: dict[str, Any] = {k: dict(v) for k, v in prev_src.items()}
    if report is not None:
        lat = report.get("latency_ms") or {}
        blocked = bool(report.get("blocked"))
        sched_err = report.get("schedule_error")
        sched = report.get("schedule") or {}
        src["cdn_schedule"] = _row(
            prev_src.get("cdn_schedule"),
            ok=not sched_err,
            now=now,
            latency=lat.get("schedule"),
            detail=(
                f"scheduleLeagueV2_1.json: {sched.get('games')} games ({sched.get('origin')})"
                if not sched_err
                else f"schedule unreadable: {sched_err}"[:200]
            ),
            down=blocked,
        )
        if not sched_err:
            failed = report.get("failed") or []
            deferred = report.get("deferred") or []
            for kind, name, file in (("pbp", "cdn_playbyplay", "playbyplay"), ("box", "cdn_boxscore", "boxscore")):
                f_k = [f for f in failed if f["file"].startswith(kind + ":")]
                d_k = [d for d in deferred if d.startswith(kind + ":")]
                got = (report.get("fetched") or {}).get(kind) or []
                src[name] = _row(
                    prev_src.get(name),
                    ok=not f_k and not blocked,
                    now=now,
                    latency=lat.get(kind + ":" + got[-1]) if got else None,
                    detail=f"{file}_<id>.json: fetched {len(got)}, failed {len(f_k)}, deferred {len(d_k)} "
                    f"(cursor {report.get('cursor')})",
                    down=blocked,
                )
    bad = sorted(k for k, v in steps.items() if not v)
    src["daily_pipeline"] = _row(
        prev_src.get("daily_pipeline"),
        ok=not bad,
        now=now,
        latency=None,
        detail=("steps " + ", ".join(steps) + " ok") if not bad else ("failed: " + ", ".join(bad)),
    )
    return {"updated_at": now, "source": "scripts/daily/run_daily.py", "sources": dict(sorted(src.items()))}


def pr_body(
    date: str,
    added: list[dict],
    maphunt_end: str | None,
    checks: list[tuple[str, int]],
    fetch: dict | None,
    notes: list[str],
) -> str:
    lines = [
        PR_HEAD,
        "",
        f"Daily data refresh for {date}, opened by scripts/daily/run_daily.py on the operator box.",
        "",
    ]
    lines.append("## Games added")
    if added:
        lines += [f"- {g['gameId']} {g.get('date', '')} {g.get('matchup', '')}".rstrip() for g in added]
    else:
        lines.append("- none")
    lines += ["", "## Other data"]
    if maphunt_end:
        lines.append(f"- Map Hunt window ends {maphunt_end}")
    if fetch is not None:
        lines.append(
            f"- cdn.nba.com requests: {fetch.get('requests')}; deferred to the next run: "
            f"{len(fetch.get('deferred') or [])}; failed: {len(fetch.get('failed') or [])}"
        )
    lines += [f"- {n}" for n in notes]
    lines += ["", "## Checks run"]
    lines += [f"- [{'x' if rc == 0 else ' '}] `{name}` (exit {rc})" for name, rc in checks]
    lines += ["", PR_FOOT]
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# plumbing
# ---------------------------------------------------------------------------


def pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name == "nt":
        import ctypes

        k32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
        h = k32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not h:
            return False
        code = ctypes.c_ulong()
        k32.GetExitCodeProcess(h, ctypes.byref(code))
        k32.CloseHandle(h)
        return code.value == 259  # STILL_ACTIVE
    try:
        os.kill(pid, 0)  # POSIX only: on Windows os.kill terminates the process
    except OSError:
        return False
    return True


class RunLock:
    """mkdir lock with a holder file "<pid> <epoch>"; a dead or 6 h old holder is reaped."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.held = False

    def acquire(self) -> bool:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        for _ in range(2):
            try:
                self.path.mkdir()
            except FileExistsError:
                try:
                    pid, ts = (self.path / "holder").read_text(encoding="utf-8").split()[:2]
                    stale = not pid_alive(int(pid)) or time.time() - float(ts) > LOCK_STALE_S
                except (OSError, ValueError):
                    stale = time.time() - self.path.stat().st_mtime > 60
                if not stale:
                    return False
                shutil.rmtree(self.path, ignore_errors=True)
                continue
            (self.path / "holder").write_text(f"{os.getpid()} {time.time():.0f}\n", encoding="utf-8")
            self.held = True
            return True
        return False

    def release(self) -> None:
        if self.held:
            shutil.rmtree(self.path, ignore_errors=True)
            self.held = False


class Log:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self.f = path.open("a", encoding="utf-8", newline="\n")

    def __call__(self, msg: str) -> None:
        line = f"{dt.datetime.now(dt.UTC).strftime('%H:%M:%SZ')} {msg}"
        print(line, flush=True)
        self.f.write(line + "\n")
        self.f.flush()


def find_bash() -> str:
    """Git Bash, never WSL's System32\\bash.exe (it cannot see /c/Users/...)."""
    env = os.environ.get("HOOPS_BASH")
    if env:
        return env
    for c in (r"C:\Program Files\Git\bin\bash.exe", r"C:\Program Files\Git\usr\bin\bash.exe"):
        if Path(c).exists():
            return c
    return shutil.which("bash") or "bash"


def posix(p: Path | str) -> str:
    return str(p).replace("\\", "/")


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def copy_new(src: Path, dst: Path, pattern: str) -> list[str]:
    """Copy files matching pattern from src to dst when new or different. Returns the names copied."""
    out = []
    if not src.is_dir():
        return out
    for f in sorted(src.glob(pattern)):
        d = dst / f.name
        if not d.exists() or sha(d) != sha(f):
            dst.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, d)
            out.append(f.name)
    return out


class Runner:
    def __init__(self, a: argparse.Namespace, log: Log) -> None:
        self.a = a
        self.log = log
        self.tree: Path = a.tree
        self.py = a.python or sys.executable
        self.bash = find_bash()
        self.steps: dict[str, bool] = {}
        self.checks: list[tuple[str, int]] = []
        self.notes: list[str] = []

    def run(self, name: str, cmd: list[str], *, admit_mb: int | None = None, timeout: int = 1800) -> int:
        if admit_mb and not self.a.no_admit and (LOCKS / "admit.sh").exists():
            cmd = [self.bash, posix(LOCKS / "admit.sh"), str(admit_mb), "daily", "--", *cmd]
        env = {**os.environ, "ADMIT_FLOOR": os.environ.get("ADMIT_FLOOR", "700"), "PYTHONIOENCODING": "utf-8"}
        t0 = time.monotonic()
        self.log(f"[{name}] $ {' '.join(cmd)}")
        try:
            p = subprocess.run(
                cmd,
                cwd=self.tree,
                env=env,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout,
            )
            rc, out = p.returncode, (p.stdout or "") + (p.stderr or "")
        except subprocess.TimeoutExpired as e:
            rc, out = 124, f"timeout after {timeout}s: {e}"
        for line in out.strip().splitlines()[-25:]:
            self.log(f"[{name}]   {line}")
        self.log(f"[{name}] exit {rc} in {time.monotonic() - t0:.1f}s")
        return rc

    def pyrun(self, name: str, script: str, *args: str, admit_mb: int | None = None) -> int:
        return self.run(name, [posix(self.py), script, *args], admit_mb=admit_mb)

    def check(self, name: str, script: str, *args: str, admit_mb: int | None = None) -> int:
        rc = self.pyrun(name, script, *args, admit_mb=admit_mb)
        self.checks.append((" ".join([script, *args]), rc))
        return rc

    # a ----------------------------------------------------------------------
    def fetch(self) -> tuple[int, dict | None]:
        report = STATE_DIR / "last_fetch_report.json"
        report.unlink(missing_ok=True)
        fetch_cmd = [
            posix(self.py),
            "pipeline/fetch_cdn_games.py",
            "--cache-dir",
            posix(STATE_DIR / "cache"),
            "--also-have",
            "pipeline/cache",
            "--state",
            posix(STATE_DIR / "state.json"),
            "--max-requests",
            str(self.a.max_requests),
            "--log",
            posix(STATE_DIR / "logs" / f"requests-{dt.date.today().isoformat()}.jsonl"),
            "--report",
            posix(report),
        ]
        if self.a.since:
            fetch_cmd += ["--since", self.a.since]
        cmd = [self.bash, posix(LOCKS / "nba-fetch.sh"), "daily-fetch", "--", *fetch_cmd]
        rc = self.run("a.fetch", cmd, timeout=3600)
        doc = json.loads(report.read_text(encoding="utf-8")) if report.exists() else None
        self.steps["fetch"] = rc in (0, 3)
        if rc == 3:
            self.notes.append("fetch partial: some files deferred or failed (the next run picks them up)")
        return rc, doc

    # b ----------------------------------------------------------------------
    def replays(self) -> int:
        cache = STATE_DIR / "cache"
        dst = self.tree / "pipeline" / "cache"
        copied = copy_new(cache / "cdn_pbp" / "_fetch_meta", dst / "cdn_pbp" / "_fetch_meta", "*.json")
        copied += copy_new(cache / "cdn_box", dst / "cdn_box", "boxscore_*.json")
        copied += copy_new(cache / "cdn_box" / "_fetch_meta", dst / "cdn_box" / "_fetch_meta", "*.json")
        self.log(f"[b.replays] {len(copied)} box score / fetch record file(s) copied into pipeline/cache")
        (cache / "cdn_pbp").mkdir(parents=True, exist_ok=True)
        rc = self.pyrun("b.replays", "scripts/refresh_replays.py", "--from", posix(cache / "cdn_pbp"))
        self.steps["replays"] = rc == 0
        return rc

    # c ----------------------------------------------------------------------
    def maphunt(self) -> int:
        rc = self.pyrun("c.maphunt", "scripts/build_map_hunt.py", "--ahead", "21", admit_mb=600)
        rc2 = self.check("c.maphunt-check", "scripts/build_map_hunt.py", "--check")
        self.steps["maphunt"] = rc == 0 and rc2 == 0
        return rc or rc2

    # d ----------------------------------------------------------------------
    def status(self, report: dict | None, fetched: bool) -> int:
        path = self.tree / RECEIPT
        prev = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
        now = dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        doc = build_receipt(prev, report if fetched else None, dict(self.steps), now)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8", newline="\n")
        rows = ", ".join(f"{k}={v['status']}" for k, v in doc["sources"].items())
        self.log(f"[d.status] wrote {RECEIPT.as_posix()} ({rows})")
        rc = self.pyrun("d.status", "scripts/build_status.py", admit_mb=500)
        rc2 = self.check("d.status-check", "scripts/build_status.py", "--check")
        self.steps["status"] = rc == 0 and rc2 == 0
        return rc or rc2

    # e ----------------------------------------------------------------------
    def stamp_and_check(self) -> int:
        rcs = [
            self.pyrun("e.stamp_assets", "scripts/stamp_assets.py"),
            self.pyrun("e.stamp_footer", "scripts/stamp_footer.py"),
            self.pyrun("e.sync_public", "scripts/sync_public.py", "--quiet"),
        ]
        rcs += [
            self.check("e.check", "scripts/stamp_assets.py", "--check"),
            self.check("e.check", "scripts/stamp_footer.py", "--check"),
            self.check("e.check", "scripts/sync_public.py", "--check", "--quiet"),
            self.check("e.check", "pipeline/build_replays.py", "--check"),
            self.check("e.check", "scripts/build_map_hunt.py", "--check"),
            self.check("e.check", "scripts/build_status.py", "--check"),
            self.check("e.check", "scripts/build_twenty_questions.py", "--check", admit_mb=400),
            self.check("e.check", "scripts/check_site_facts.py", admit_mb=400),
            self.check("e.check", "scripts/budget_check.py", admit_mb=400),
        ]
        self.steps["stamp+checks"] = not any(rcs)
        return max(rcs)

    # f ----------------------------------------------------------------------
    def git(self, *args: str, check: bool = True) -> str:
        p = subprocess.run(["git", *args], cwd=self.tree, capture_output=True, text=True, encoding="utf-8")
        if check and p.returncode != 0:
            raise RuntimeError(f"git {' '.join(args)}: {p.stderr.strip()}")
        return p.stdout

    def changes(self) -> tuple[list[str], list[str]]:
        return classify_changes(self.git("status", "--porcelain", "--untracked-files=all").splitlines())

    def open_pr(self, date: str, body: str, data: list[str]) -> int:
        branch = f"data/daily-{date}"
        if self.git("ls-remote", "--heads", "origin", branch).strip():
            branch += "-" + dt.datetime.now().strftime("%H%M")
        self.git("checkout", "-b", branch)
        for i in range(0, len(data), 100):
            self.git("add", "--", *data[i : i + 100])
        self.git("commit", "-q", "-m", f"data: daily refresh {date}\n\nscripts/daily/run_daily.py on the operator box.")
        self.git("push", "-q", "-u", "origin", branch)
        body_file = STATE_DIR / "last_pr_body.md"
        body_file.write_text(body, encoding="utf-8", newline="\n")
        p = subprocess.run(
            [
                "gh",
                "pr",
                "create",
                "--base",
                "master",
                "--head",
                branch,
                "--title",
                f"data: daily refresh {date}",
                "--body-file",
                str(body_file),
            ],
            cwd=self.tree,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        self.log(f"[f.pr] gh pr create exit {p.returncode}: {(p.stdout + p.stderr).strip()}")
        return p.returncode


def added_games(tree: Path, fetched_pbp: list[str]) -> list[dict]:
    out = []
    for gid in fetched_pbp:
        f = tree / "assets" / "replays" / f"{gid}.json"
        if not f.exists():
            out.append({"gameId": gid})
            continue
        g = json.loads(f.read_text(encoding="utf-8"))
        t, s = g.get("teams") or [{}, {}], g.get("score") or ["?", "?"]
        out.append(
            {
                "gameId": gid,
                "date": g.get("date", ""),
                "matchup": f"{t[0].get('tri')} {s[0]} @ {t[1].get('tri')} {s[1]}",
            }
        )
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--tree", type=Path, default=ROOT, help="checkout to refresh (default: this one)")
    ap.add_argument("--open-pr", action="store_true", help="step f: commit, push and open the data PR")
    ap.add_argument("--skip-fetch", action="store_true", help="skip step a (no network)")
    ap.add_argument("--max-requests", type=int, default=80, help="cdn.nba.com request cap for step a")
    ap.add_argument("--since", help="YYYY-MM-DD lower bound when there is no fetch cursor yet")
    ap.add_argument("--python", help="interpreter for the steps (default: this one; needs numpy)")
    ap.add_argument("--no-admit", action="store_true", help="do not wrap heavy steps in wt/locks/admit.sh")
    a = ap.parse_args(argv)
    a.tree = a.tree.resolve()
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    log = Log(STATE_DIR / "logs" / f"run-{stamp}.log")
    lock = RunLock(STATE_DIR / "run.lock")
    if not lock.acquire():
        log("another daily run holds the lock; exiting")
        return 4
    t0 = time.monotonic()
    try:
        r = Runner(a, log)
        log(f"daily run start: tree {a.tree}, python {r.py}, bash {r.bash}, open_pr={a.open_pr}")
        if a.open_pr:
            dirty = r.git("status", "--porcelain").strip()
            if dirty:
                log("the tree is not clean; a --open-pr run needs a fresh origin/master checkout. Stopping.")
                return 1
        fetch_rc, report = (0, None) if a.skip_fetch else r.fetch()
        r.replays()
        r.maphunt()
        r.status(report, fetched=not a.skip_fetch)
        r.stamp_and_check()
        data, bad = r.changes()
        log(f"changed: {len(data)} data file(s); {len(bad)} outside the data paths {bad[:10]}")
        idx = json.loads((a.tree / "assets" / "map-hunt" / "index.json").read_text(encoding="utf-8"))
        mh_end = max(idx.get("days") or {"?": 0})
        added = added_games(a.tree, (report or {}).get("fetched", {}).get("pbp", []))
        body = pr_body(dt.date.today().isoformat(), added, mh_end, r.checks, report, r.notes)
        (STATE_DIR / "last_summary.md").write_text(body, encoding="utf-8", newline="\n")
        failed = sorted(k for k, v in r.steps.items() if not v)
        log(f"steps: {r.steps}; Map Hunt ends {mh_end}; games added {len(added)}")
        if a.open_pr and data and not bad and not failed:
            if r.open_pr(dt.date.today().isoformat(), body, data) != 0:
                failed.append("pr")
        elif a.open_pr and (bad or failed):
            log("not opening a PR: " + ("files outside the data paths changed" if bad else f"failed {failed}"))
        elif a.open_pr:
            log("nothing changed; no PR")
        log(f"daily run done in {time.monotonic() - t0:.0f}s")
        if fetch_rc in (2, 75) or (not a.skip_fetch and report is None):
            return 2
        return 1 if (failed or bad) else 0
    finally:
        lock.release()


if __name__ == "__main__":
    raise SystemExit(main())
