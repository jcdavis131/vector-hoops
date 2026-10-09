#!/usr/bin/env python3
"""Reassemble Court Lab shot artifacts from a Forge job result.

Usage:
    python3 -m forge.cli result shots-0001 > /tmp/shots-0001-result.json
    python3 pipeline/reassemble_results.py /tmp/shots-0001-result.json

Extracts the FORGE_METRIC base64 chunks emitted by
`build_shots.py push-results`, reassembles assets/shots.v1.json and
pipeline/build_shots.manifest.json, and verifies sha256 digests.
Exit non-zero on any mismatch. Stdlib only.
"""

import base64
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)


def reassemble(metrics, prefix, out_path):
    n = int(metrics[prefix + "_b64_chunks"])
    parts = []
    for i in range(n):
        key = "%s_b64_%02d" % (prefix, i)
        if key not in metrics:
            raise SystemExit("missing chunk %s (%d of %d)" % (key, i, n))
        parts.append(metrics[key])
    blob = base64.b64decode("".join(parts).encode("ascii"))
    want = metrics[prefix + "_sha256"]
    got = hashlib.sha256(blob).hexdigest()
    if got != want:
        raise SystemExit("sha256 mismatch for %s: got %s want %s"
                         % (prefix, got, want))
    if len(blob) != int(metrics[prefix + "_bytes"]):
        raise SystemExit("byte-length mismatch for %s" % prefix)
    with open(out_path, "wb") as f:
        f.write(blob)
    print("wrote %s (%d bytes, sha256 ok)" % (out_path, len(blob)))


def main():
    if len(sys.argv) != 2:
        print(__doc__.strip().splitlines()[1], file=sys.stderr)
        sys.exit(2)
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        result = json.load(f)
    if result.get("status") != "ok":
        raise SystemExit("job status is %r (exit %s); refusing to reassemble" %
                         (result.get("status"), result.get("exit_code")))
    metrics = result.get("metrics") or {}
    reassemble(metrics, "shots",
               os.path.join(REPO, "assets", "shots.v1.json"))
    reassemble(metrics, "manifest",
               os.path.join(REPO, "pipeline", "build_shots.manifest.json"))
    print("reassembly complete")


if __name__ == "__main__":
    main()
