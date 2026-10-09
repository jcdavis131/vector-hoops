"""pipeline/runlog.py: one handler per logger, the documented format, level from HOOPS_LOG_LEVEL.

Each test uses its own logger name. Loggers are process-global, so a shared
name would carry one test's handler and level into the next.

Run:  python -m pytest tests/test_runlog.py
"""

from __future__ import annotations

import io
import logging
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import runlog  # noqa: E402


def capture(logger: logging.Logger) -> io.StringIO:
    """Point the runlog handler at a buffer. It holds the stderr object from setup time."""
    (handler,) = logger.handlers
    buf = io.StringIO()
    handler.setStream(buf)
    return buf


def test_second_call_adds_no_handler(monkeypatch):
    monkeypatch.delenv(runlog.ENV_LEVEL, raising=False)
    a = runlog.get_logger("test_runlog.idempotent")
    b = runlog.get_logger("test_runlog.idempotent")
    assert a is b
    assert len(a.handlers) == 1
    assert a.propagate is False
    buf = capture(a)
    a.info("once")
    assert buf.getvalue().count("once") == 1


def test_format_and_default_level(monkeypatch):
    monkeypatch.delenv(runlog.ENV_LEVEL, raising=False)
    log = runlog.get_logger("test_runlog.format")
    assert log.level == logging.INFO
    buf = capture(log)
    log.debug("hidden")
    log.info("wrote %s", "train_matrix.npz")
    out = buf.getvalue()
    assert "hidden" not in out
    assert re.fullmatch(
        r"\d{4}-\d\d-\d\d \d\d:\d\d:\d\d,\d{3} INFO test_runlog\.format: wrote train_matrix\.npz\n", out
    ), out


def test_level_from_env(monkeypatch):
    monkeypatch.setenv(runlog.ENV_LEVEL, "debug")
    assert runlog.get_logger("test_runlog.env_name").level == logging.DEBUG
    monkeypatch.setenv(runlog.ENV_LEVEL, "30")
    assert runlog.get_logger("test_runlog.env_number").level == logging.WARNING


def test_bad_level_falls_back_to_info_and_says_so(monkeypatch, capsys):
    monkeypatch.setenv(runlog.ENV_LEVEL, "LOUD")
    log = runlog.get_logger("test_runlog.bad_env")
    assert log.level == logging.INFO
    assert "HOOPS_LOG_LEVEL='LOUD' is not a logging level; using INFO" in capsys.readouterr().err
