"""Career arc features — thin wrapper.

Prefer ``build_career_context.py`` (PLAYER_ID sequences + slopes + sequences NPZ).
This module remains for callers that invoke ``career_arc.py`` directly.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main() -> None:
    cmd = [sys.executable, str(HERE / "build_career_context.py")]
    raise SystemExit(subprocess.call(cmd))


if __name__ == "__main__":
    main()
