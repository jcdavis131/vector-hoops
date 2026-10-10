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


def repair_latin1_mojibake(s: str) -> str | None:
    """UTF-8 text that was decoded as latin-1 (and possibly lowercased) back to UTF-8, or None.

    The BBRef contract scrapers read r.text without setting r.encoding, so
    requests decoded UTF-8 pages as latin-1 ('Jokić' -> 'JokiÄ\\x87'), and
    fetch_salaries then lowercased the key ('jokiä\\x87') [ingest#3]. A plain
    s.encode('latin-1').decode('utf-8') undoes the first step only:
    lowercasing moved each 2-byte UTF-8 lead byte C2-DE (latin-1 'Â'..'Þ')
    to E2-FE, and E4 87 is not valid UTF-8, so the plain re-decode recovers
    none of the lowercased keys. The inverse is unambiguous because of
    UTF-8's shape: a 2-byte lead is followed by exactly one continuation byte
    (80-BF) and a 3-byte lead by two, while lowercasing never touches 80-BF
    or the 3-byte leads E0-EF ('à'..'ï' are already lower case). So a
    character in E2-FE (not F7, '÷', which no capital lowers to) followed by
    exactly one continuation byte goes back to its capital, and the result
    must then decode. None when it does not: the text is not this mojibake,
    or a byte was lost (a lead followed by a space where whitespace
    collapsing ate a \\xa0 continuation).
    """
    try:
        return s.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass
    out = []
    for i, c in enumerate(s):
        o = ord(c)
        j = i + 1
        while j < len(s) and 0x80 <= ord(s[j]) <= 0xBF:
            j += 1
        out.append(chr(o - 0x20) if 0xE2 <= o <= 0xFE and o != 0xF7 and j - i - 1 == 1 else c)
    try:
        return "".join(out).encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return None
