"""One logging setup for new pipeline code.

No module under pipeline/ or scripts/ used the logging module on 2026-10-09
(`grep -l 'import logging\\|getLogger' pipeline/*.py scripts/*.py` matched 0
files), and pipeline/*.py held 891 print() calls [health#11]. Run output
went to hand-named *.log files with no timestamp, no level and no record of
which module wrote a line.

This module does not convert those prints. It gives new code one way to log,
so that new messages carry a time, a level and their module name, and so that
HOOPS_LOG_LEVEL=DEBUG raises the detail without a code edit.

    from runlog import get_logger
    log = get_logger(__name__)
    log.info("wrote %s", path)
"""

from __future__ import annotations

import logging
import os

FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"
ENV_LEVEL = "HOOPS_LOG_LEVEL"
DEFAULT_LEVEL = logging.INFO

# Set on the handler this module adds, so a second get_logger() call for the
# same name finds it and adds nothing. Without it every call would stack one
# more handler and each message would print once per call made so far.
_MARK = "_hoops_runlog"


def _level_from_env() -> tuple[int, str | None]:
    """The level HOOPS_LOG_LEVEL names, and the raw value when it named none."""
    raw = os.environ.get(ENV_LEVEL)
    if raw is None or not raw.strip():
        return DEFAULT_LEVEL, None
    text = raw.strip()
    if text.isdigit():
        return int(text), None
    level = logging.getLevelNamesMapping().get(text.upper())
    if level is None:
        return DEFAULT_LEVEL, raw
    return level, None


def get_logger(name: str) -> logging.Logger:
    """A logger with exactly one stderr handler, configured once per name.

    The level comes from HOOPS_LOG_LEVEL (a name such as DEBUG or a number),
    INFO when unset. It is read on the first call for a name only; later calls
    return the logger as it is.

    propagate is off. If anything later calls logging.basicConfig(), a
    propagating logger would print every message twice, once here and once
    from the root handler.
    """
    logger = logging.getLogger(name)
    if any(getattr(h, _MARK, False) for h in logger.handlers):
        return logger

    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(FORMAT))
    setattr(handler, _MARK, True)
    logger.addHandler(handler)

    level, bad = _level_from_env()
    logger.setLevel(level)
    logger.propagate = False
    if bad is not None:
        # A typo in an env var should be visible, but not fatal to a
        # multi-hour training run.
        logger.warning("%s=%r is not a logging level; using INFO", ENV_LEVEL, bad)
    return logger
