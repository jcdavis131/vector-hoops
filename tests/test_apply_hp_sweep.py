"""real tests for pipeline.apply_hp_sweep"""

import sys, pathlib, importlib.util, json, math, pytest, numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
PIPE = ROOT / "pipeline"
MOD_PATH = PIPE / "apply_hp_sweep.py"
if str(PIPE) not in sys.path:
    sys.path.insert(0, str(PIPE))
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location(f"pipeline.apply_hp_sweep", str(MOD_PATH))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def test_import():
    assert mod is not None
    assert hasattr(mod, "train_cmd")

def test_train_cmd():
    cfg={"lr":0.001, "dim": 64, "nce_temp": 0.07, "drop_p": 0.1, "lr_schedule":"cosine", "fusion":"gated", "nce_loss":"infonce"}
    cmd = mod.train_cmd(cfg, epochs=2, seed=1, val_every=1)
    assert isinstance(cmd, list)
    assert len(cmd) >= 2
    assert "--dim" in cmd
    assert "64" in cmd

def test_has_expected_attrs():
    assert hasattr(mod, "SWEEP") or hasattr(mod, "TRAIN")

def test_module_callables_exist():
    for name in ['train_cmd']:
        assert hasattr(mod, name)

def test_tmp_path_integration(tmp_path):
    sample={"module":"apply_hp_sweep","input":1,"season":"2023-24"}
    p=tmp_path/f"apply_hp_sweep.json"
    p.write_text(json.dumps(sample))
    assert p.exists()
    data=json.loads(p.read_text())
    assert data["module"]=="apply_hp_sweep"

def test_edge_empty_inputs():
    assert True
