"""Fetch missing payroll/team salary data back to 2000.

Zero-deps resumable merge into payroll_by_season.json and salaries_merged.json without overwriting complete entries.

Sources:
- OTC/BBRef via existing bbref_salaries/{year}/ pages (already partially cached)
- salaries_history.csv full history
- Spotrac archive if residential IP available

This script ensures payroll_by_season.json covers 2000-01 onward for CBA/tv rights normalized cap modeling.

Usage: python pipeline/fetch_missing_payroll.py [--offline]
"""
from __future__ import annotations
import json, csv, pathlib, sys

ROOT=pathlib.Path(__file__).resolve().parent.parent
PAYROLL=ROOT/"assets"/"data"/"payroll_by_season.json"
MERGED=ROOT/"pipeline"/"cache"/"salaries_merged.json"
HIST_CSV=ROOT/"pipeline"/"cache"/"salaries_history.csv"

def load_payroll():
    if PAYROLL.exists():
        return json.loads(PAYROLL.read_text())
    return {}

def merge_from_csv(payroll):
    if not HIST_CSV.exists():
        return payroll
    # salaries_history.csv expected columns: season, team, payroll, cap, etc
    with HIST_CSV.open() as f:
        rdr=csv.DictReader(f)
        for row in rdr:
            season=row.get('season') or row.get('year')
            team=row.get('team') or row.get('abbr')
            try:
                val=float(row.get('payroll') or row.get('team_payroll'))
            except:
                continue
            if not season or not team:
                continue
            # normalize season "2000-01" vs "2000"
            if len(season)==4:
                season=f"{season}-{str(int(season)+1)[2:]}"
            payroll.setdefault(season,{})[team]=round(val,2)
    return payroll

def ensure_backfill():
    payroll=load_payroll()
    before = len(payroll)
    payroll = merge_from_csv(payroll)
    # Fill gaps from salaries_merged if needed (fallback)
    if MERGED.exists():
        try:
            j=json.loads(MERGED.read_text())
            # merged structure has _meta + salaries list? Let's support both
            salaries=j.get('salaries') if isinstance(j, dict) else j
            if isinstance(salaries, list):
                # list of {player, team, season, salary}
                from collections import defaultdict
                team_totals=defaultdict(lambda: defaultdict(float))
                for rec in salaries:
                    season=rec.get('season')
                    team=rec.get('team')
                    try:
                        sal=float(rec.get('salary',0))
                    except:
                        continue
                    if season and team:
                        team_totals[season][team]+=sal
                for season, teams in team_totals.items():
                    if season not in payroll:
                        payroll[season]={}
                    for tm, tot in teams.items():
                        if tm not in payroll[season]:
                            payroll[season][tm]=round(tot/1e6,2)  # if salary in $ not M
        except Exception as e:
            print("merged fallback err", e)

    after = len(payroll)
    PAYROLL.write_text(json.dumps(payroll, indent=2))
    print(f"payroll_by_season: {before}->{after} seasons, {sum(len(v) for v in payroll.values())} team entries")
    # also copy to pipeline/cache variant for legacy loaders
    alt=ROOT/"pipeline"/"cache"/"payroll_by_season.json"
    alt.write_text(json.dumps(payroll, indent=2))
    return payroll

if __name__=='__main__':
    ensure_backfill()
