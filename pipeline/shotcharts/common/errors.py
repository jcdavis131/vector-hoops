"""Shared exception: source is gated (honest 503)."""


class GateError(Exception):
    """Raised by stub sources: the data is gated, not missing by accident."""
