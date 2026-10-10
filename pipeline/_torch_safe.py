"""Checkpoint loading that refuses arbitrary pickles unless the caller opts in.

``torch.load(..., weights_only=True)`` rebuilds tensors, containers and
primitives and refuses any other pickled global. Every checkpoint this repo
writes fits inside that: train_mtnn saves ``{"model": state_dict, "args":
vars(args), ...}`` and its args are str/int/float/bool/None. A pickle opcode
walk of mtnn_best.pt and nine sibling checkpoints on the training box found
only collections.OrderedDict, torch.FloatStorage and
torch._utils._rebuild_tensor_v2, all of which weights_only allows [health#9].

This helper used to retry with ``weights_only=False`` on ANY exception. So a
file the safe loader refused for carrying an arbitrary object -- the case the
safe loader exists for -- was then unpickled with full code execution, and a
truncated file was read twice and reported with the second error.

``unsafe_pickle=True`` is the explicit opt-in: only for a checkpoint this repo
wrote whose pickle needs more than weights_only allows. No caller passes it
today. Never pass it for a file that came from another machine, agent or
download. A caller's own ``weights_only`` is ignored, so that flag is the one
way in.
"""

import torch


def safe_torch_load(*args, unsafe_pickle: bool = False, **kwargs):
    """torch.load with weights_only=True; weights_only=False only when unsafe_pickle=True."""
    kwargs.pop("weights_only", None)
    return torch.load(*args, weights_only=not unsafe_pickle, **kwargs)
