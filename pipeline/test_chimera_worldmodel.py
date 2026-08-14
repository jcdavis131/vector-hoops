"""
Test stub for vector-hoops-chimera-worldmodel
Graph nodes: concept:vector-hoops, concept:mtnn, concept:scout, concept:ava, concept:jspace, concept:graphify
Papers: 2403.16933v1, 2607.14076v1, tech_ai_52c707a406

Verifies scaffold exists and CQS baseline
"""


def test_chimera_fusion_stub():
    from chimera_fusion import GRAPH_NODES, PAPER_IDS, chimera_fusion

    result = chimera_fusion()
    assert "2403.16933v1" in result["paper_ids"]
    assert "concept:vector-hoops" in result["graph_nodes"]
    assert result["status"] == "stub-implemented"
    # Real data checks
    assert len(GRAPH_NODES) == 6
    assert len(PAPER_IDS) == 3


def test_worldmodel_loop_stub():
    from chimera_fusion import worldmodel_state_loop

    result = worldmodel_state_loop()
    assert result["paper"] == "2607.14076v1"
    assert result["context_source"] == "tech_ai_52c707a406"
    assert "1M" in result["context_window"]


def test_cqs_baseline():
    from chimera_fusion import cqs_verified_chimera_eval

    result = cqs_verified_chimera_eval()
    assert result["cqs_baseline"] == 85.87
    assert "concept:mtnn" in result["nodes"]
    assert "concept:scout" in result["nodes"]


# The two tests below read the evidence files the docstring cites. Those live
# under ~/workspace on the machine the research was done on, not in this repo,
# so they are absent on the CI runner and on any other checkout. Asserting
# existence made `pytest pipeline` fail everywhere except one laptop, which is
# why this file could not be merged as written.
#
# Skipping instead of asserting keeps the check honest in both directions: where
# the evidence is present it is still read and still validated, and where it is
# not, the suite says "skipped" rather than either failing or silently passing.


def test_graph_file_exists():
    import json
    import pathlib

    import pytest

    gpath = pathlib.Path.home() / "workspace/personal-graphify/graph.json"
    if not gpath.exists():
        pytest.skip(f"evidence file not on this machine: {gpath}")
    data = json.loads(gpath.read_text())
    assert "nodes" in data


def test_headline_exists():
    import pathlib

    import pytest

    hpath = pathlib.Path.home() / "workspace/your_files/news-briefs/headlines/_by_headline/tech_ai_52c707a406.md"
    if not hpath.exists():
        pytest.skip(f"evidence file not on this machine: {hpath}")
    text = hpath.read_text()
    assert "1M" in text or "1 million" in text.lower()


if __name__ == "__main__":
    # Not a hand-rolled runner any more: the two evidence tests call pytest.skip,
    # which raises outside a pytest session. Delegate so `python
    # test_chimera_worldmodel.py` and `pytest` report the same thing.
    import sys

    import pytest

    sys.exit(pytest.main([__file__, "-q"]))
