"""Player-name keys: the one place a name is turned into a join key.

Join on PLAYER_ID wherever both sides carry one (vectors.json 'pid', the
game logs, the bio and dashbase caches, draft history's person_id). A name
key is for the sources that carry no id: Basketball-Reference pages
(positions, per-game, advanced, salaries, awards) and the stats.nba.com
caches that were saved keyed by name (wide_skills, playoffs, honors).

norm_name is the key. It folds to ASCII, lowercases, drops every character
that is not a letter, digit or space (periods, apostrophes, hyphens,
backticks), collapses spaces and, unless keep_suffix, drops a trailing
Jr/Sr/II/III/IV/V. Every key a cache was written under is a pre-image of
it: norm_name(stored_key) == norm_name(raw_name) for the suffix-stripping
copies the fetchers used ('jaren jackson', 'karlanthony towns'), for the
suffix-keeping name_utils of d2a16d37 ('jaren jackson jr') and for raw API
names ('Karl-Anthony Towns', 'Jaren Jackson Jr.'). Measured 2026-10-09 on
every cache that stores both the key and the printed name: honors_award
1,211, salaries_merged 16,678, playoff_games 50,356, and the 5,968
dashbase names against the game logs' names by PLAYER_ID: 0 disagree. So
a reader keys both sides with it, the stored key included, and a cache
never needs re-keying. bbref_key is the same key without spaces, for the
Basketball-Reference caches written that way ('jarenjackson').

Before 2026-10-09 there were 24 copies of this function in 10 behaviours
[ingest#4, health#3, features#7]; name_utils.norm_name itself kept suffixes
and hyphens since d2a16d37 while every cache was keyed without them.

keep_suffix=True is for joins where both sides print the suffix and span
seasons, so a father and son would otherwise share a key (wiki pages and
the committed vectors.json display names). Within one season a suffix has
not separated two players: in the game logs (2015-26, the only source that
prints suffixes) no season has two PLAYER_IDs whose names differ only by
one, while 'Marcus Williams' 2007-08 is two people with the same name,
which no name key separates.

canonical_name is the display name, not a key.
"""

from __future__ import annotations

import re
import unicodedata

_SUFFIX_RE = re.compile(r"\s+(jr|sr|ii|iii|iv|v)$", re.I)
_PUNCT_RE = re.compile(r"[.'’\-]")
_NOT_KEY_RE = re.compile(r"[^a-z0-9\s]")


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


def norm_name(name: str, *, keep_suffix: bool = False) -> str:
    """The join key for a player name that has no PLAYER_ID beside it (see module doc)."""
    if not name:
        return ""
    s = _NOT_KEY_RE.sub("", ascii_fold(str(name)).lower())
    s = re.sub(r"\s+", " ", s).strip()
    return s if keep_suffix else _SUFFIX_RE.sub("", s)


def bbref_key(name: str, *, keep_suffix: bool = False) -> str:
    """norm_name without spaces: the key of the Basketball-Reference caches ('jarenjackson')."""
    return norm_name(name, keep_suffix=keep_suffix).replace(" ", "")


def rekey(mapping: dict, *, key=None) -> dict:
    """A name-keyed cache dict re-keyed with norm_name (or `key`) applied to each stored key.

    Two stored keys that meet under the new key keep the first; the caller
    that cares (none of the per-season caches has such a pair) checks.
    """
    fn = key or norm_name
    out: dict = {}
    for k, v in mapping.items():
        out.setdefault(fn(k), v)
    return out


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
