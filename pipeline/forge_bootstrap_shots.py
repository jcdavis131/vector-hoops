#!/usr/bin/env python3
"""Forge bootstrap for the Court Lab shot collection (runs on nugatron).

Single entry point for the Forge job: collect raw shot data from the NBA
stats API (resume-safe, polite), assemble assets/shots.v1.json with QA
hard-block, then emit the assembled files as FORGE_METRIC base64 chunks
(the runner only uploads results/{job}.json + log tail, so large artifacts
ride back as metrics).

Stdlib only. Windows-safe.
"""

import subprocess
import sys

STEPS = [
    ([sys.executable, "pipeline/build_shots.py", "collect"], "collect"),
    ([sys.executable, "pipeline/build_shots.py", "assemble"], "assemble"),
    ([sys.executable, "pipeline/build_shots.py", "push-results"], "push-results"),
]


def main():
    for argv, name in STEPS:
        print("BOOTSTRAP: starting %s" % name, flush=True)
        p = subprocess.run(argv)
        if p.returncode != 0:
            print("BOOTSTRAP: step %s failed with exit %d"
                  % (name, p.returncode), flush=True)
            sys.exit(p.returncode)
        print("BOOTSTRAP: %s done" % name, flush=True)
    print("BOOTSTRAP: all steps complete", flush=True)


if __name__ == "__main__":
    main()
