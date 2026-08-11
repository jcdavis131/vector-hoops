"""Break something each gate claims to catch, and check the gate catches it.

Nine checks this session reported success while measuring something other than
what they named, and one of them — a regex that reached the browser as two
backspace characters — could not have failed on any page, ever. "The suite is
green" only means something if each check has been shown to go red.

The interaction smokes have their own mutation matrices, and `derived`, `worker`,
`links`, `clean`, `fragments` and `headings` were each shown failing when they
were written. This covers the rest: the gates that had only ever been green.

Every case backs the file up, mutates it, runs one gate, and restores from the
backup in a finally — then the run ends by comparing every touched file to its
backup byte for byte, because a mutation harness that leaves the site modified is
worse than no harness.

    python scripts/audit_gates.py
    python scripts/audit_gates.py --only a11y,contrast
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PY = sys.executable

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def gate(*args: str) -> list[str]:
    return [PY, str(ROOT / "scripts" / args[0]), *args[1:]]


# name, file to break, (old, new), the gate that must notice, and whether the
# public/ mirror should be re-synced first (a gate reading public/ sees nothing
# otherwise — except `mirror`, which exists to notice exactly that)
CASES = [
    ("syntax", "dictionary.html",
     ("var q=$('dq'), qc=$('dqCount');", "var q=$('dq'), qc=;"),
     gate("check_frontend.py", "--only", "syntax"), True),

    ("targets", "dictionary.html",
     ('id="dqCount"', 'id="dqCountRenamed"'),
     gate("check_frontend.py", "--only", "targets"), True),

    ("assets", "dictionary.html",
     ("assets/error-boundary.js?v=", "assets/error-boundary-MISSING.js?v="),
     gate("check_frontend.py", "--only", "assets"), True),

    ("ids", "dictionary.html",
     ('<div class="find">', '<div class="find" id="jump">'),
     gate("check_frontend.py", "--only", "ids"), True),

    ("sourced", "teams.html",
     ("All 30 teams</h2>", "All 30 teams — lift 6.32</h2>"),
     gate("check_frontend.py", "--only", "sourced"), True),

    ("cited", "model.html",
     ("0.6847", "0.6841"),
     gate("check_frontend.py", "--only", "cited"), True),

    ("free", "leaderboard.html",
     (">Your Week Warrior progress<", ">Your Week Warrior progress — $9.99/mo<"),
     gate("check_frontend.py", "--only", "free"), True),

    # the one case that must NOT sync: the mirror check exists to notice a root
    # edit that never reached public/
    ("mirror", "dictionary.html",
     ("<h1>Every word this site uses</h1>", "<h1>Every word this site used</h1>"),
     gate("check_frontend.py", "--only", "mirror"), False),

    ("tokens", "dictionary.html",
     ("assets/error-boundary.js?v=b5444017", "assets/error-boundary.js?v=00000000"),
     gate("check_frontend.py", "--only", "tokens"), True),

    ("a11y", "play.html",
     ("<html lang=en>", "<html>"),
     gate("check_a11y.py"), True),

    ("contrast", "leaderboard.html",
     ("background:#0072b2;color:#fff", "background:#0072b2;color:#1166c0"),
     gate("check_contrast.py"), True),

    ("focus", "dictionary.html",
     ('<a class="vh-skip" href="#main">Skip to the dictionary</a>', ""),
     gate("check_focus.py"), True),

    ("viewport", "leaderboard.html",
     ('<main id="main" tabindex="-1">',
      '<main id="main" tabindex="-1"><div style="width:2400px;height:4px"></div>'),
     gate("check_viewport.py"), True),

    # Put the CDN back. Measured with unpkg blocked, the eight players on that
    # page are inert and customElements.get('posecode-player') is false.
    ("external", "player-animations.html",
     # anchored before the ?v= token, which stamp_assets rewrites from the
     # file's own hash — the first attempt anchored past it and the harness
     # said ANCHOR NOT FOUND rather than passing, which is the point of it
     ('src="/assets/posecode-embed-0.1.0.js',
      'src="https://unpkg.com/posecode-embed@0.1.0/dist/posecode-embed.js" data-was="'),
     gate("check_frontend.py", "--only", "external"), True),

    # Put back the read this gate was written for: vectors_map_lite.json's key
    # is `players`, /player asked for `V.vectors`, and every one of the four
    # reads had a fallback that made the miss look like working code.
    ("datakeys", "player.html",
     ("var PTS = (V && V.points) || [];", "var PTS = (V && V.vectors) || [];"),
     gate("check_data_keys.py", "--only", "player"), True),
]


# A run that is killed - a timeout, a Ctrl-C - never reaches its finally, and the
# first version of this left a 2,400px <div> in leaderboard.html when a 10-minute
# limit cut it off mid-case. Backups go to a fixed place with a manifest beside
# them, and the next run puts them back before it does anything else. A mutation
# harness that can leave the site broken is the thing its own docstring warns
# about.
SAFE = ROOT / ".audit-backups"
MANIFEST = SAFE / "manifest.json"


def recover() -> None:
    if not MANIFEST.exists():
        return
    try:
        pairs = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except ValueError:
        pairs = {}
    put_back = []
    for rel, bak in pairs.items():
        src, b = ROOT / rel, Path(bak)
        if b.exists() and src.exists() and src.read_bytes() != b.read_bytes():
            shutil.copy(b, src)
            put_back.append(rel)
    MANIFEST.unlink(missing_ok=True)
    if put_back:
        print(f"a previous run did not finish; restored {put_back} from its backups\n")
        sync()


def sync() -> None:
    subprocess.run([PY, str(ROOT / "scripts" / "sync_public.py")],
                   capture_output=True, cwd=str(ROOT))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma-separated subset of gate names")
    args = ap.parse_args()
    wanted = {s.strip() for s in args.only.split(",")} if args.only else None

    SAFE.mkdir(exist_ok=True)
    recover()
    tmp = SAFE
    uncaught: list[str] = []
    touched: dict[Path, Path] = {}

    print(f"{'gate':<12}{'file':<20}{'result':<9}verdict")
    print("-" * 78)
    try:
        for name, rel, (old, new), cmd, do_sync in CASES:
            if wanted and name not in wanted:
                continue
            src = ROOT / rel
            bak = tmp / (name + "-" + src.name)
            shutil.copy(src, bak)
            touched[src] = bak
            # written BEFORE the mutation, so a kill leaves a trail to follow
            MANIFEST.write_text(json.dumps(
                {str(k.relative_to(ROOT)).replace("\\", "/"): str(v)
                 for k, v in touched.items()}, indent=1), encoding="utf-8")

            with open(src, encoding="utf-8", newline="") as fh:
                raw = fh.read()
            if old not in raw:
                print(f"{name:<12}{rel:<20}{'-':<9}ANCHOR NOT FOUND: {old[:44]!r}")
                uncaught.append(f"{name}: anchor missing, so nothing was tested")
                continue
            with open(src, "w", encoding="utf-8", newline="") as fh:
                fh.write(raw.replace(old, new, 1))
            if do_sync:
                sync()

            r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                               errors="replace", cwd=str(ROOT))

            with open(src, "w", encoding="utf-8", newline="") as fh:
                fh.write(raw)
            sync()

            ok = r.returncode == 1
            print(f"{name:<12}{rel:<20}RC={r.returncode:<6} "
                  f"{'caught' if ok else '*** NOT CAUGHT ***'}")
            if not ok:
                uncaught.append(f"{name}: {rel} was broken and the gate exited "
                                f"{r.returncode} — it has never been shown to fail, and "
                                f"now it has been shown not to")
            else:
                line = next((ln.strip() for ln in r.stdout.splitlines()
                             if ln.strip().startswith("- ")), "")
                if line:
                    print(f"{'':<12}  {line[:88]}")
    finally:
        # the site must be exactly as it was found
        drift = []
        for src, bak in touched.items():
            if src.read_bytes() != bak.read_bytes():
                shutil.copy(bak, src)
                drift.append(str(src.relative_to(ROOT)))
        sync()
        MANIFEST.unlink(missing_ok=True)
        shutil.rmtree(tmp, ignore_errors=True)
        if drift:
            print(f"\nrestored from backup after the run: {drift}")

    print()
    if uncaught:
        print(f"FAIL — {len(uncaught)} gate(s) did not notice their own mutation:")
        for u in uncaught:
            print(f"  - {u}")
        return 1
    print(f"OK — every gate audited went red when the thing it checks was broken")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
