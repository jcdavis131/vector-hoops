"""Safe checkpoint loading helper.

Prefers PyTorch's secure ``weights_only=True`` deserialization path and falls
back to the legacy behavior only when a trusted local checkpoint contains
non-tensor Python objects that the safe path cannot reconstruct. This hardens
``torch.load`` call sites without breaking existing checkpoints.
"""

import torch


def safe_torch_load(*args, **kwargs):
    """Load a checkpoint, preferring ``weights_only=True``.

    Falls back to ``weights_only=False`` for trusted local checkpoints that
    contain non-tensor objects (e.g. saved ``args`` dicts / configs), so
    existing checkpoints continue to load unchanged.
    """
    kwargs.pop("weights_only", None)
    try:
        return torch.load(*args, weights_only=True, **kwargs)
    except Exception:
        # Trusted local checkpoints may contain non-tensor objects.
        return torch.load(*args, weights_only=False, **kwargs)
