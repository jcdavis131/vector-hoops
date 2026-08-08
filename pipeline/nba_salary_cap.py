"""
NBA cap environment by season — cap, tax, aprons, CBA, TV deal, growth rules.

Season key is NBA end-year label: "2024-25" = season ending 2025.
Sources: Spotrac CBA/tax history, Basketball-Reference cap history, BleacherReport
for apron figures 2023-24/2024-25/2026-27 official, ESPN/Boardroom for CBA rules,
TalkSport/ClutchPoints/CBS for TV deal impact on 10% max growth.

This is coarse but sufficient for recomputable front-office grades that are
era-aware (spike year 2016, soft-hard cap era 2023+).
"""

from __future__ import annotations

CAP_BY_SEASON: dict[str, float] = {
    "1996-97": 24_363_000,
    "1997-98": 26_900_000,
    "1998-99": 30_000_000,
    "1999-00": 34_000_000,
    "2000-01": 35_500_000,
    "2001-02": 42_500_000,
    "2002-03": 43_840_000,
    "2003-04": 43_840_000,
    "2004-05": 43_870_000,
    "2005-06": 49_500_000,
    "2006-07": 53_135_000,
    "2007-08": 55_827_000,
    "2008-09": 58_680_000,
    "2009-10": 57_700_000,
    "2010-11": 58_044_000,
    "2011-12": 58_044_000,
    "2012-13": 58_680_000,
    "2013-14": 58_680_000,
    "2014-15": 63_065_000,
    "2015-16": 70_000_000,
    "2016-17": 94_143_000,  # +34% spike from 2014 $24B TV deal — one-time warps evaluation
    "2017-18": 99_093_000,
    "2018-19": 101_869_000,
    "2019-20": 109_140_000,
    "2020-21": 109_140_000,
    "2021-22": 112_414_000,
    "2022-23": 123_655_000,
    "2023-24": 136_021_000,  # start of 2023 CBA, aprons introduced
    "2024-25": 140_588_000,
    "2025-26": 154_647_000,  # ~+10% max growth, new $76B TV deal starts 2025-26
    "2026-27": 164_961_000,  # official per Spotrac News
}

# Luxury tax thresholds — Spotrac CBA tax history
TAX_THRESHOLD_BY_SEASON: dict[str, float] = {
    "2002-03": 52_880_000,
    "2003-04": 54_556_722,
    "2004-05": 0,  # lockout year no tax
    "2005-06": 61_700_000,
    "2006-07": 65_420_000,
    "2007-08": 67_865_000,
    "2008-09": 71_150_000,
    "2009-10": 69_920_000,
    "2010-11": 70_307_000,
    "2011-12": 70_307_000,
    "2012-13": 70_307_000,
    "2013-14": 71_748_000,
    "2014-15": 76_829_000,
    "2015-16": 84_740_000,
    "2016-17": 113_287_000,
    "2017-18": 119_266_000,
    "2018-19": 123_733_000,
    "2019-20": 132_627_000,
    "2020-21": 132_627_000,
    "2021-22": 136_606_000,
    "2022-23": 150_267_000,
    "2023-24": 165_294_000,
    "2024-25": 170_814_000,
    "2025-26": 187_895_000,  # +10% — CBA max increase rule
    "2026-27": 200_428_000,  # official + official min floor 148.465M
}

# Aprons only exist from 2023 CBA onward — first = tax + ~$7-8.6M, second = tax + ~$17.5-21.3M
APRON1_BY_SEASON: dict[str, float] = {
    "2023-24": 172_346_000,  # tax $165.294M + $7.052M
    "2024-25": 178_132_000,  # tax $170.814M + $7.318M
    "2025-26": 195_945_000,  # est tax $187.895M + $8.05M (10% growth linked)
    "2026-27": 209_015_000,  # official
}

APRON2_BY_SEASON: dict[str, float] = {
    "2023-24": 182_794_000,  # tax + $17.5M
    "2024-25": 188_931_000,  # tax + $18.117M
    "2025-26": 207_824_000,  # est tax + $19.929M
    "2026-27": 221_686_000,  # official
}

# CBA version per season — determines ruleset
CBA_BY_SEASON: dict[str, str] = {
    "1996-97": "1995 CBA — original max, no repeater",
    "1997-98": "1995 CBA",
    "1998-99": "1999 CBA — post-lockout, max contracts introduced",
    "1999-00": "1999 CBA",
    "2000-01": "1999 CBA",
    "2001-02": "1999 CBA",
    "2002-03": "1999 CBA — luxury tax introduced 2002",
    "2003-04": "1999 CBA",
    "2004-05": "2005 CBA — incremental tax, 57% BRI",
    "2005-06": "2005 CBA",
    "2006-07": "2005 CBA",
    "2007-08": "2005 CBA",
    "2008-09": "2005 CBA",
    "2009-10": "2005 CBA",
    "2010-11": "2005 CBA",
    "2011-12": "2011 CBA — post-lockout, 51/49 BRI split to players, harsher tax",
    "2012-13": "2011 CBA",
    "2013-14": "2011 CBA — repeater tax starts 3 of 4 years rule from 2013",
    "2014-15": "2011 CBA",
    "2015-16": "2011 CBA",
    "2016-17": "2011 CBA — 2016 spike year, 32% cap jump from TV",
    "2017-18": "2017 CBA — Designated Veteran extensions",
    "2018-19": "2017 CBA",
    "2019-20": "2017 CBA",
    "2020-21": "2017 CBA — COVID smoothing",
    "2021-22": "2017 CBA",
    "2022-23": "2017 CBA",
    "2023-24": "2023 CBA — aprons introduced, 51/49 stays, 10% max cap growth, 2nd apron restrictions",
    "2024-25": "2023 CBA",
    "2025-26": "2023 CBA — $76B TV deal starts, 10% max growth prevents 2016-style spike",
    "2026-27": "2023 CBA",
}

# TV / media rights era — drives cap smoothing behavior
TV_DEAL_BY_SEASON: dict[str, str] = {
    "1996-97": "1993-97 NBC/Turner $750M 4yr ~$188M/yr",
    "1997-98": "1998-02 NBC/Turner $2.6B 4yr ~$650M/yr",
    "1998-99": "1998-02",
    "1999-00": "1998-02",
    "2000-01": "1998-02",
    "2001-02": "1998-02",
    "2002-03": "2002-08 ESPN/ABC/TNT $4.6B 6yr ~$767M/yr",
    "2003-04": "2002-08",
    "2004-05": "2002-08",
    "2005-06": "2002-08",
    "2006-07": "2002-08",
    "2007-08": "2008-16 ESPN/ABC/TNT $7.4B 8yr ~$925M/yr",
    "2008-09": "2008-16",
    "2009-10": "2008-16",
    "2010-11": "2008-16",
    "2011-12": "2008-16",
    "2012-13": "2008-16",
    "2013-14": "2008-16",
    "2014-15": "2008-16",
    "2015-16": "2008-16 — last year before $24B deal",
    "2016-17": "2016-25 ESPN/ABC/Turner $24B 9yr ~$2.67B/yr — TRIPLED revenue, cap spike controlled only via one-year smoothing decision declined",
    "2017-18": "2016-25",
    "2018-19": "2016-25",
    "2019-20": "2016-25",
    "2020-21": "2016-25 — COVID revenue dip, cap frozen",
    "2021-22": "2016-25",
    "2022-23": "2016-25",
    "2023-24": "2016-25 — last full year before new deal",
    "2024-25": "2016-25 — bridge, 10% max growth anticipated",
    "2025-26": "2025-36 Disney/NBC/Amazon $76B 11yr ~$6.9B/yr — starts 2025-26, 10% annual cap growth max, no more 30%+ spikes",
    "2026-27": "2025-36 — year 2 of $76B, smoothing mandatory",
}

# Revenue sharing simplified — small markets get ~50% redistributed tax pool
REVENUE_SHARING_NOTE: dict[str, str] = {
    "default": "Tax pool 50% distributed to non-tax teams; revenue sharing pool ~$400-500M/yr post-2011 CBA helps small markets stay above floor but does not exempt aprons.",
    "2011-plus": "2011 CBA enhanced revenue sharing — all 30 share ~post-tax pool + low-revenue teams receive ~$15-20M/yr extra. Does not change cap grading but explains why small payroll can still be competitive.",
}

def cap_for_season(season: str) -> float | None:
    return CAP_BY_SEASON.get(season)

def tax_for_season(season: str) -> float | None:
    return TAX_THRESHOLD_BY_SEASON.get(season)

def apron1_for_season(season: str) -> float | None:
    return APRON1_BY_SEASON.get(season)

def apron2_for_season(season: str) -> float | None:
    return APRON2_BY_SEASON.get(season)

def rules_for_season(season: str) -> dict:
    """Full environment snapshot for a season — used by build_front_office for era-aware grades."""
    cap = CAP_BY_SEASON.get(season)
    tax = TAX_THRESHOLD_BY_SEASON.get(season)
    a1 = APRON1_BY_SEASON.get(season)
    a2 = APRON2_BY_SEASON.get(season)
    cba = CBA_BY_SEASON.get(season, "unknown")
    tv = TV_DEAL_BY_SEASON.get(season, "unknown")
    # growth calc vs prior year if available
    growth = None
    prior = None
    try:
        # naive prior = season start year -1 -> label e.g. 2024-25 prior 2023-24
        sy = int(season.split("-")[0])
        prior_label = f"{sy-1}-{str(sy)[-2:]}"
        prior = CAP_BY_SEASON.get(prior_label)
        if prior and cap:
            growth = (cap - prior) / prior
    except:
        pass
    return {
        "season": season,
        "cap": cap,
        "tax": tax,
        "apron1": a1,
        "apron2": a2,
        "cba": cba,
        "tv_deal": tv,
        "cap_growth_vs_prior": growth,
        "cap_growth_prior": prior,
        "max_growth_rule": "10% max annual increase from 2023 CBA onward, 0% floor (cap cannot fall)",
        "notes": [
            f"CBA era: {cba}",
            f"TV era: {tv}",
            f"Tax pool sharing: {REVENUE_SHARING_NOTE['2011-plus'] if sy>=2011 else REVENUE_SHARING_NOTE['default']}" if 'sy' in locals() else REVENUE_SHARING_NOTE['default'],
        ],
        "spike_flag": "2016-17 SPIKE YEAR 32% jump — distorts raw cap%" if season=="2016-17" else None,
    }
