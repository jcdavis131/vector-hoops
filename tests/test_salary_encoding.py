"""BBRef contract names decode as UTF-8, and the salary caches carry no latin-1 mojibake keys [ingest#3]."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from name_utils import repair_latin1_mojibake  # noqa: E402

CACHE = ROOT / "pipeline" / "cache"

# Keys left non-ASCII on purpose, each for a reason the repair cannot fix:
#   'dario å ariä\x87': fetch_salaries collapsed whitespace after the bad decode,
#     turning the \xa0 continuation byte of 'Š' into a space, so the bytes are gone.
#   'egor dеmin': BBRef spells Dёmin with a Cyrillic ё (bytes D1 91); the repair
#     is faithful and ascii_fold leaves Cyrillic е, so it still misses 'Egor Demin'
#     (an identity issue, not an encoding one).
KNOWN_NON_ASCII = {"dario å ariä\x87|2025-26"} | {
    f"egor dеmin|{s}" for s in ("2025-26", "2026-27", "2027-28", "2028-29")
}


@pytest.mark.parametrize(
    ("bad", "good"),
    [
        ("JokiÄ\x87", "Jokić"),  # decoded as latin-1, not lowercased
        ("nikola jokiä\x87", "nikola jokić"),  # ... then lowercased: the lead byte moved C4 -> E4
        ("luka donä\x8diä\x87", "luka dončić"),
        ("alperen å\x9eengã¼n", "alperen Şengün"),  # the continuation byte kept the capital Ş
        ("stephen curry", "stephen curry"),
    ],
)
def test_repair_latin1_mojibake(bad, good):
    assert repair_latin1_mojibake(bad) == good


def test_repair_refuses_when_a_byte_was_lost():
    assert repair_latin1_mojibake("dario å ariä\x87") is None  # \xa0 became a space
    assert repair_latin1_mojibake("Jokić") is None  # already correct text is not this mojibake


@pytest.mark.parametrize("name", ["salary_bbref_current.json", "salaries_merged.json"])
def test_salary_cache_keys_are_ascii(name):
    doc = json.loads((CACHE / name).read_text(encoding="utf-8"))
    keys = doc.get("salaries", doc) if name == "salaries_merged.json" else doc
    bad = {k for k in keys if not k.startswith("_") and any(ord(c) > 127 for c in k)}
    # Before: 71 mojibake keys in each, e.g. 'nikola jokiä\x87|2025-26'.
    assert bad <= KNOWN_NON_ASCII, sorted(bad - KNOWN_NON_ASCII)


def test_recovered_2025_26_salaries_join_on_folded_names():
    merged = json.loads((CACHE / "salaries_merged.json").read_text(encoding="utf-8"))["salaries"]
    for nn in ("nikola jokic", "luka doncic", "alperen sengun", "kristaps porzingis", "dennis schroder"):
        assert f"{nn}|2025-26" in merged, nn


class _Resp:
    """requests.Response stand-in: .text decodes with .encoding, latin-1 when unset, as requests does without a charset."""

    def __init__(self, body: bytes):
        self.content = body
        self.encoding = None
        self.status_code = 200

    def raise_for_status(self):
        pass

    @property
    def text(self) -> str:
        return self.content.decode(self.encoding or "latin-1")


HTML = (
    "<table><thead><tr><th>2025-26</th></tr></thead><tbody>"
    '<tr><td data-stat="player"><a href="/p">Nikola Jokić</a></td><td data-stat="y1">$55,224,526</td></tr>'
    "</tbody></table>"
).encode("utf-8")


def test_fetch_salaries_decodes_bbref_as_utf8(monkeypatch):
    requests = pytest.importorskip("requests")
    import fetch_salaries

    monkeypatch.setattr(requests, "get", lambda *a, **k: _Resp(HTML))
    assert fetch_salaries.fetch_bbref_contracts() == {"nikola jokic|2025-26": 55224526.0}


def test_build_vectors_decodes_bbref_as_utf8(tmp_path, monkeypatch):
    requests = pytest.importorskip("requests")
    import build_vectors

    monkeypatch.setattr(build_vectors, "CACHE", tmp_path)
    monkeypatch.setattr(requests, "get", lambda *a, **k: _Resp(HTML))
    assert build_vectors.fetch_bbref_contracts(offline=False) == {("nikola jokic", "2025-26"): 55224526.0}
