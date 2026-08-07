"""Shared player-name canonicalization for cross-source joins.

stats.nba.com returns diacritics (Jokić, Nurkić); draft history and
several caches fold to ASCII. All pipeline joins use norm_name(); display
names in vectors.json use canonical_name() so UI and pedigree keys align.
"""

from __future__ import annotations

import re
import unicodedata

_SUFFIX_RE = re.compile(r"\s+(jr|sr|ii|iii|iv|v)$", re.I)
_PUNCT_RE = re.compile(r"[.'’\-]")


def ascii_fold(name: str) -> str:
    """Strip combining marks and exotic punctuation; keep readable ASCII."""
    if not name:
        return name
    s = unicodedata.normalize("NFD", str(name))
    s = "".join(c for c in s if not unicodedata.combining(c))
    # Common Latin ligatures / letters NFD may not fully decompose on all platforms.
    replacements = {
        "ø": "o",
        "Ø": "O",
        "đ": "d",
        "Đ": "D",
        "ł": "l",
        "Ł": "L",
        "ß": "ss",
        "æ": "ae",
        "Æ": "AE",
        "œ": "oe",
        "Œ": "OE",
        # Turkish dotless/dotted i carry no combining mark, so NFD can't
        # decompose them (Omer Asık, Alperen Şengün's teammates).
        "ı": "i",
        "İ": "I",
    }
    for src, dst in replacements.items():
        s = s.replace(src, dst)
    return s


def canonical_name(name: str) -> str:
    """Display-safe ASCII name for vectors.json and client surfaces.

    Preserves Jr/Sr/II/III/IV/V suffixes because they disambiguate distinct
    persons (e.g., Gary Payton vs Gary Payton II). Joins use PLAYER_ID,
    not stripped names, for uniqueness; name+dob (birth year) is the
    human-readable unique key.
    """
    if not name:
        return ""
    s = ascii_fold(name).strip()
    # keep suffix, just strip punctuation like apostrophes (O'Bryant -> OBryant is okay but keep readable)
    # we drop periods and apostrophes but keep suffix token
    s = re.sub(r"[.'’]", "", s)
    return re.sub(r"\s+", " ", s)


def norm_name(name: str) -> str:
    """Join key: canonical + lower + collapsed whitespace (suffix-preserving)."""
    return canonical_name(name).lower()
