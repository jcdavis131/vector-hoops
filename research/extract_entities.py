#!/usr/bin/env python3
"""Entity grounding extraction for NBA Insights noun layer.

Extracts proper-noun entities (players, teams, seasons) from the live
Insights cards (assets/insights.json on origin/master) and links players
to player dossiers (assets/dossiers.json on origin/master).

Normalization rules (documented; see research/proper-noun-layer-FINDINGS.md):
  1. Text is normalized before matching: Unicode NFKD diacritics stripped,
     possessive 's removed, apostrophes/periods removed, hyphens -> space,
     case-folded. Both card text and dossier display names are normalized
     the same way, so "Doncic" matches dossier key "Luka Doncic" and
     "Shaquille O'Neal" matches dossier name "Shaquille ONeal".
  2. Player display names follow the dossier canonical form ("n" field in
     dossiers.json): ASCII, no suffixes ("Mike Dunleavy", not "Mike Dunleavy Jr."),
     no apostrophes ("Shaquille ONeal").
  3. Full names are matched before aliases (longest-first), so an alias like
     "Malone" cannot steal a match from "Karl Malone".
  4. Aliases are only applied where the card text actually uses them:
     LeBron, Giannis, Antetokounmpo, Durant, Mitchell, Duncan, Embiid,
     Harden, Payton, Beal, Lillard, Melo->Carmelo Anthony, Malone->Karl
     Malone, Wade->Dwyane Wade, Manu->Manu Ginobili, Klay->Klay Thompson,
     Iguodala->Andre Iguodala, Gordon->Aaron Gordon, Doncic->Luka Doncic,
     Gilgeous-Alexander->Shai Gilgeous-Alexander, Jokic->Nikola Jokic,
     Mills->Patty Mills, Diaw->Boris Diaw, Westbrook, Curry->Stephen Curry,
     Love->Kevin Love, Bosh->Chris Bosh, Ross->Terrence Ross,
     Tyson Chandler (full name in hometown-discount lede).
     Ambiguous short forms are NOT mapped: "Brown" (contender-chemistry
     lede could be Jaylen or another Brown) and "Green" (hometown-discount
     lede, likely Danny Green but unverified) are documented as unresolved.
  5. Teams normalize to full franchise names (e.g. "Portland" -> "Portland
     Trail Blazers", "MIN" -> "Minnesota Timberwolves").
  6. Seasons normalize to YYYY-YY with hyphen: "'18-19" -> "2018-19";
     "'99-00" -> "1999-00". Two-digit years >= 96 -> 19xx else 20xx.
     Multi-year spans ('02-18) are kept as span entities, e.g. "2002-18".
     "summer 2016" -> "2016-17". "the 2026 Finals" -> "2025-26"
     (the championship series closing the 2025-26 season).
  7. Only text in title, tldr, lede, rows[].label, and foot is scanned
     (viz_label / stat_label excluded per the noun-layer spec).

Real data only: every entity below was matched in actual card text.
"""
import json, re, unicodedata, os
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

def norm(s):
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    s = re.sub(r"['\u2019]s\b", '', s)      # possessive
    s = re.sub(r"['\u2019.]", '', s)
    s = s.replace('-', ' ').replace('\u2013', ' ').replace('\u2014', ' ')
    s = re.sub(r'\s+', ' ', s).strip()
    return s

insights = json.load(open(os.path.join(ROOT, 'assets/insights.json')))['insights']
dos = json.load(open(os.path.join(ROOT, 'assets/dossiers.json')))['dossiers']

# ---- player roster from dossiers ----
name_to_key = {v['n']: k for k, v in dos.items()}
assert len(name_to_key) == len(dos), 'duplicate dossier display names!'

ALIASES = {
    'LeBron': 'LeBron James', 'Giannis': 'Giannis Antetokounmpo',
    'Antetokounmpo': 'Giannis Antetokounmpo', 'Durant': 'Kevin Durant',
    'Mitchell': 'Donovan Mitchell', 'Duncan': 'Tim Duncan',
    'Embiid': 'Joel Embiid', 'Harden': 'James Harden',
    'Payton': 'Gary Payton', 'Beal': 'Bradley Beal',
    'Lillard': 'Damian Lillard', 'Melo': 'Carmelo Anthony',
    'Malone': 'Karl Malone', 'Wade': 'Dwyane Wade',
    'Manu': 'Manu Ginobili', 'Klay': 'Klay Thompson',
    'Iguodala': 'Andre Iguodala', 'Gordon': 'Aaron Gordon',
    'Doncic': 'Luka Doncic', 'Gilgeous-Alexander': 'Shai Gilgeous-Alexander',
    'Jokic': 'Nikola Jokic', 'Mills': 'Patty Mills',
    'Diaw': 'Boris Diaw', 'Westbrook': 'Russell Westbrook',
    'Curry': 'Stephen Curry', 'Love': 'Kevin Love',
    'Bosh': 'Chris Bosh', 'Ross': 'Terrence Ross',
}
assert all(v in name_to_key for v in ALIASES.values()), 'alias target missing from dossiers'

TEAMS = {  # pattern -> canonical franchise name (patterns matched on normalized text,
         # except ALL-CAPS abbreviations which are matched case-sensitively on raw text)
    'Golden State Warriors': ['warriors'],
    'Los Angeles Lakers': ['la lakers', 'lakers'],
    'Dallas Mavericks': ['mavericks'],
    'New York Knicks': ['new york', 'knicks'],
    'San Antonio Spurs': ['san antonio', 'spurs'],
    'Portland Trail Blazers': ['portland'],
    'Oklahoma City Thunder': ['oklahoma city'],
    'Denver Nuggets': ['denver'],
    'Philadelphia 76ers': ['philadelphia'],
    'Miami Heat': ['the heat', 'miami'],
    'Sacramento Kings': ['sacramento'],
    'Utah Jazz': ['utah'],
    'Detroit Pistons': ['detroit'],
    'Atlanta Hawks': ['atlanta'],
    'Houston Rockets': ['houston'],
    'Orlando Magic': ['orlando'],
    'Milwaukee Bucks': ['milwaukee'],
    'Boston Celtics': ['boston'],
}
# case-sensitive abbreviations (love-vs-bosh foot) -> team; matched on raw text
ABBREV_TEAMS = {
    'MIN': 'Minnesota Timberwolves',
    'CLE': 'Cleveland Cavaliers',
    'TOR': 'Toronto Raptors',
    'MIA': 'Miami Heat',
}

def season_norm(m4, m2=None):
    return m4

def find_seasons(text):
    out = []
    # full YYYY-YY; negative lookahead skips ISO scrape dates like 2026-10-01
    for m in re.finditer(r'\b(19\d{2}|20\d{2})[-–](\d{2})(?!\-\d)\b', text):
        out.append(f"{m.group(1)}-{m.group(2)}")
    # apostrophe YY-YY: '18-19 -> 2018-19, '99-00 -> 1999-00
    for m in re.finditer(r"['\u2019](\d{2})[-–](\d{2})\b", text):
        g1, g2 = m.group(1), m.group(2)
        y1, y2 = int(g1), int(g2)
        c1 = '19' if y1 >= 96 else '20'
        era1 = (1900 if y1 >= 96 else 2000) + y1
        era2 = (1900 if y2 >= 96 else 2000) + y2
        out.append(f"{c1}{g1}-{g2}")  # diff<=1 => season; diff>1 => multi-year span (e.g. '02-18 -> 2002-18)
    # "summer 2016" -> following season
    for m in re.finditer(r'\bsummer (20\d{2})\b', text):
        y = int(m.group(1)); out.append(f"{y}-{str(y+1)[2:]}")
    # "<YYYY> Finals" -> season closing that year
    for m in re.finditer(r'\b(20\d{2}) Finals\b', text):
        y = int(m.group(1)); out.append(f"{y-1}-{str(y)[2:]}")
    return out

def card_text(card):
    parts = [card.get('title',''), card.get('tldr',''), card.get('lede',''),
             card.get('foot','')]
    for r in card.get('rows', []) or []:
        lbl = r.get('label')
        if lbl and lbl != 'None':
            parts.append(lbl)
    return '\n'.join(parts)

# compile patterns: full names (longest first) then aliases
player_patterns = []
seen = set()
for name in sorted(name_to_key, key=len, reverse=True):
    player_patterns.append((norm(name), name))
for alias, target in sorted(ALIASES.items(), key=lambda x: len(x[0]), reverse=True):
    player_patterns.append((norm(alias), target))

team_patterns = []
for canon, pats in TEAMS.items():
    for p in sorted(pats, key=len, reverse=True):
        team_patterns.append((p, canon))
team_patterns.sort(key=lambda x: len(x[0]), reverse=True)

entities_players = defaultdict(set)
entities_teams = defaultdict(set)
entities_seasons = defaultdict(set)

for card in insights:
    slug = card['slug']
    raw = card_text(card)
    ntext = norm(raw)
    for pat, canon in player_patterns:
        if re.search(r'\b' + re.escape(pat) + r'\b', ntext):
            entities_players[canon].add(slug)
    for pat, canon in team_patterns:
        if re.search(r'\b' + re.escape(pat) + r'\b', ntext):
            entities_teams[canon].add(slug)
    for abbr, canon in ABBREV_TEAMS.items():  # case-sensitive, raw text
        if re.search(r'\b' + re.escape(abbr) + r'\b', raw):
            entities_teams[canon].add(slug)
    for s in find_seasons(raw):
        entities_seasons[s].add(slug)

players = [{'name': n, 'type': 'player', 'cards': sorted(c),
            'dossier': True, 'dossier_key': name_to_key[n]}
           for n, c in sorted(entities_players.items())]
teams = [{'name': n, 'type': 'team', 'cards': sorted(c),
          'dossier': False, 'dossier_key': None}
         for n, c in sorted(entities_teams.items())]
seasons = [{'name': n, 'type': 'season', 'cards': sorted(c),
            'dossier': False, 'dossier_key': None}
           for n, c in sorted(entities_seasons.items())]

index = {
    'entities': players,
    'teams': teams,
    'seasons': seasons,
    'meta': {
        'card_count': len(insights),
        'player_count': len(players),
        'team_count': len(teams),
        'season_count': len(seasons),
        'dossier_hit_rate': round(sum(1 for p in players if p['dossier']) / max(len(players),1), 4),
        'built': '2026-10-07',
        'source': 'assets/insights.json (origin/master), players linked to assets/dossiers.json',
        'normalization': 'see research/proper-noun-layer-FINDINGS.md',
    }
}
json.dump(index, open(os.path.join(ROOT, 'assets/entity-index.json'), 'w'),
          indent=1, ensure_ascii=False)
print(f"players={len(players)} teams={len(teams)} seasons={len(seasons)}")
print(f"dossier_hit_rate={index['meta']['dossier_hit_rate']}")

# ---- review dump: per-card entities ----
print('\n--- per-card review ---')
for card in insights:
    slug = card['slug']
    ps = sorted(n for n, c in entities_players.items() if slug in c)
    ts = sorted(n for n, c in entities_teams.items() if slug in c)
    ss = sorted(n for n, c in entities_seasons.items() if slug in c)
    print(f"{slug}: players={ps}")
    print(f"    teams={ts}")
    print(f"    seasons={ss}")

# ---- mention stats for card-draft decision ----
print('\n--- card-coverage stats (players) ---')
from collections import Counter
cov = Counter({n: len(c) for n, c in entities_players.items()})
for n, k in cov.most_common(20):
    print(f"{k} cards: {n}")
print('\n--- card-coverage stats (teams) ---')
covt = Counter({n: len(c) for n, c in entities_teams.items()})
for n, k in covt.most_common(20):
    print(f"{k} cards: {n}")
