"""name_utils.norm_name is the one name key [ingest#4, health#3, features#7].

24 copies of norm_name in 10 behaviours keyed the caches; name_utils'
own kept suffixes and hyphens since d2a16d37 while every cache was keyed
without them. A key written by any of those copies is a pre-image of
norm_name, so readers key both sides with it.
"""

from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from name_utils import bbref_key, canonical_name, norm_name, rekey  # noqa: E402

NAMES = [
    "Karl-Anthony Towns",
    "Jaren Jackson Jr.",
    "Gary Payton II",
    "Marcus Morris Sr.",
    "Nikola Jokić",
    "Ömer Aşık",
    "D'Angelo Russell",
    "Shaquille O\\'Neal",  # salaries_merged prints the CSV's escaped apostrophe
    "Kristaps Porziņģis",
    "J.J. Barea",
    "Lonnie Walker IV",
    "Nenê",
]


def _stripping_copy(name: str) -> str:
    """The suffix- and hyphen-stripping norm_name most fetchers had (fetch_draft_history, fetch_wide_skills)."""
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[.'’-]", "", s.lower())
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    return re.sub(r"\s+", " ", s)


def _unfolded_copy(name: str) -> str:
    """merge_salaries / build_salary_market: the same without accent folding."""
    s = re.sub(r"[.'’-]", "", name.lower())
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    return re.sub(r"\s+", " ", s)


def _suffix_keeping(name: str) -> str:
    """name_utils.norm_name between d2a16d37 and 2026-10-09."""
    return canonical_name(name).lower()


def _alnum_copy(name: str) -> str:
    """fetch_positions / fetch_bbref_advanced / enrich_vectors."""
    s = unicodedata.normalize("NFKD", name)
    s = "".join(ch for ch in s if not unicodedata.combining(ch)).lower()
    for suffix in (" jr", " sr", " ii", " iii", " iv", " v"):
        if s.replace(".", "").rstrip().endswith(suffix):
            s = s.replace(".", "").rstrip()[: -len(suffix)]
            break
    return re.sub(r"[^a-z0-9]", "", s)


@pytest.mark.parametrize("name", NAMES)
@pytest.mark.parametrize("old", [_stripping_copy, _unfolded_copy, _suffix_keeping, str])
def test_every_old_key_is_a_pre_image(name, old):
    assert norm_name(old(name)) == norm_name(name)


@pytest.mark.parametrize("name", [n for n in NAMES if n != "Ömer Aşık"])
def test_bbref_key_meets_the_alnum_caches(name):
    assert bbref_key(_alnum_copy(name)) == bbref_key(name)


def test_a_letter_nfkd_cannot_decompose():
    # The alnum copies dropped 'ı' (no decomposition): 'omerask'. bbref_key
    # folds it ('omerasik'), as canonical_name folds the charted name, so the
    # charted 'Omer Asik' never met 'omerask' under either key.
    assert _alnum_copy("Ömer Aşık") == "omerask"
    assert bbref_key("Ömer Aşık") == bbref_key("Omer Asik") == _alnum_copy("Omer Asik") == "omerasik"


def test_the_key_itself():
    assert norm_name("Karl-Anthony Towns") == "karlanthony towns"
    assert norm_name("Jaren Jackson Jr.") == norm_name("Jaren Jackson") == "jaren jackson"
    assert norm_name("Gary Payton II", keep_suffix=True) == "gary payton ii"
    assert norm_name("Nikola Jokić") == "nikola jokic"
    assert norm_name("Ömer Aşık") == "omer asik"
    assert bbref_key("Jaren Jackson Jr.") == "jarenjackson"
    assert bbref_key("Gary Payton II", keep_suffix=True) == "garypaytonii"
    assert norm_name("") == "" and norm_name(None) == ""


def test_rekey_keeps_the_first_of_two_stored_keys_that_meet():
    assert rekey({"jaren jackson jr": 1, "jaren jackson": 2, "kat": 3}) == {"jaren jackson": 1, "kat": 3}
    assert rekey({"JarenJackson": 1}, key=bbref_key) == {"jarenjackson": 1}
