# NBA ticket & merch money — research findings
Branch: `scout/money-ticket-merch` · Date: 2026-10-07

## The question
Which fanbases pay the most per win? Team revenue vs. payroll efficiency.

Two constructs, named explicitly:
- **Revenue efficiency** = team payroll ÷ regular-season wins (dollars the owner spends per win).
- **Fan cost per win** = family-of-four game-day cost ÷ regular-season wins (dollars the fan spends per win).

## Method + honest coverage
- **Season in focus: 2024-25** (the last completed season at research time). Every per-win number below pairs 2024-25 wins with costs from the same season cycle.
- **Payrolls:** Basketball Insiders' NBA salary snapshot for the 2024-25 season — a single consistent table of all 30 teams ("Total Cap"). Cross-checked against Spotrac's 2024-25 cap tracker (crawl values: PHX $239.4M, MIN $236.7M, LAL $200.8M — same rank order, slightly higher because Spotrac's "Total Cap Allocations" includes dead money and mid-season moves). Payroll figures are snapshot-dependent; I used one source throughout and never mixed snapshots.
- **Wins:** 2024-25 regular-season records (Spotrac tracker rows, cross-checked against landofbasketball.com's 2024-25 standings).
- **Fan cost:** Action Network's 2025 NBA Game-Day Cost Index — family of four (4 tickets from 340,000+ Ticketmaster listings, food & drinks from Statista, 4 hats + 4 jerseys from NBA Store Europe, arena parking). This is *not* the Team Marketing Report Fan Cost Index (see gaps), but it is the closest fully per-team published family-cost dataset, and it uniquely includes **merchandise** — right on this track's theme.
- **Ticket prices:** Sportscasting's secondary-market average get-in price per team for the 2025-26 season (all 30 teams, with 2024-25 comparisons and YoY changes).
- **Jersey sales:** NBAStore.com rankings as reported for the 2024-25 full season (Eurohoops / Bolavip / Serie A English reporting of the NBA + NBPA announcement).
- **What's missing (honest):**
  - The actual Team Marketing Report FCI tables for 2023-24 / 2024-25 are paywalled on teammarketing.com; no free source reproduces all 30 teams. Press coverage of the 2021-22 FCI (Knicks $936.72, Warriors $740.08, Lakers $711.76) is included for context only.
  - Action Network published per-team costs for only the 5 most expensive and 5 most affordable teams; the middle 20 teams' family costs are unknown. Fan cost per win is therefore computed for 10 teams, not 30.
  - A full 30-team 2023-24 payroll table was not freely available (only headline extremes — see patterns). The core per-win analysis is 2024-25 only.
  - Jersey sales are ranks only; NBAStore.com does not publish unit counts, so no jersey-sales card was built.
  - Team merch top-10 list was cut off at #9 (Spurs) in the source; the #10 team is unknown.

## Headline numbers
| # | Finding | Number |
|---|---------|--------|
| 1 | Cheapest win in the NBA: Oklahoma City, $159.2M payroll / 68 wins | **$2.34M per win** |
| 2 | Priciest win in the NBA: Washington, $228.1M payroll / 18 wins | **$12.67M per win** |
| 3 | Worst fan deal: Washington family of 4 pays $1,100 per game for 18 wins | **$61.11 per win** |
| 4 | Best fan deal: Houston family of 4 pays $1,180 per game for 52 wins | **$22.69 per win** |
| 5 | Widest ticket-price gap: Knicks $213.43 vs. Grizzlies $22.00 get-in | **9.7x** |
| 6 | Top-selling jersey 2024-25 (first time since 2012-13 it isn't Curry or LeBron) | **Luka Dončić (Lakers)** |

## Per-team tables

### Revenue efficiency: payroll $M per win, 2024-25 (all 30)
| Team | Payroll | Wins | $M / win |
|------|--------:|-----:|---------:|
| Oklahoma City Thunder | $159,241,956 | 68 | 2.34 |
| Detroit Pistons | $131,178,867 | 44 | 2.98 |
| Cleveland Cavaliers | $191,268,909 | 64 | 2.99 |
| Houston Rockets | $168,102,025 | 52 | 3.23 |
| Boston Celtics | $205,210,294 | 61 | 3.36 |
| LA Clippers | $180,547,126 | 50 | 3.61 |
| Orlando Magic | $150,359,238 | 41 | 3.67 |
| New York Knicks | $191,910,421 | 51 | 3.76 |
| Denver Nuggets | $191,351,268 | 50 | 3.83 |
| Indiana Pacers | $197,197,218 | 50 | 3.94 |
| Memphis Grizzlies | $189,640,888 | 48 | 3.95 |
| Los Angeles Lakers | $205,366,009 | 50 | 4.11 |
| Golden State Warriors | $201,423,315 | 48 | 4.20 |
| San Antonio Spurs | $145,006,408 | 34 | 4.26 |
| Milwaukee Bucks | $208,415,050 | 48 | 4.34 |
| Sacramento Kings | $175,540,252 | 40 | 4.39 |
| Chicago Bulls | $172,117,211 | 39 | 4.41 |
| Atlanta Hawks | $178,120,356 | 40 | 4.45 |
| Dallas Mavericks | $190,967,444 | 39 | 4.90 |
| Minnesota Timberwolves | $241,826,711 | 49 | 4.94 |
| Portland Trail Blazers | $181,023,484 | 36 | 5.03 |
| Miami Heat | $198,220,499 | 37 | 5.36 |
| Toronto Raptors | $163,643,175 | 30 | 5.45 |
| Phoenix Suns | $237,035,029 | 36 | 6.58 |
| Brooklyn Nets | $186,215,813 | 26 | 7.16 |
| Philadelphia 76ers | $178,266,765 | 24 | 7.43 |
| Charlotte Hornets | $158,087,947 | 19 | 8.32 |
| Utah Jazz | $148,349,819 | 17 | 8.73 |
| New Orleans Pelicans | $185,700,367 | 21 | 8.84 |
| Washington Wizards | $228,099,127 | 18 | 12.67 |

### Fan cost per win, 2024-25 (10 teams with published costs)
| Team | Family of 4 (2025) | Wins | $ / win |
|------|-------------------:|-----:|--------:|
| Houston Rockets | $1,180 | 52 | 22.69 |
| Memphis Grizzlies | $1,185 | 48 | 24.69 |
| Boston Celtics | $1,762.70 | 61 | 28.90 |
| Minnesota Timberwolves | $1,785.49 | 49 | 36.44 |
| Los Angeles Lakers | $1,937.37 | 50 | 38.75 |
| Golden State Warriors | $1,906.36 | 48 | 39.72 |
| New York Knicks | $2,130.53 | 51 | 41.78 |
| New Orleans Pelicans | $980 | 21 | 46.67 |
| Utah Jazz | $1,020 | 17 | 60.00 |
| Washington Wizards | $1,100 | 18 | 61.11 |

### Average get-in ticket price, 2025-26 season (all 30, Sportscasting)
| Team | 2025-26 | 2024-25 | YoY |
|------|--------:|--------:|----:|
| New York Knicks | $213.43 | $186.80 | +14.3% |
| Los Angeles Lakers | $146.20 | $144.73 | +1.0% |
| Golden State Warriors | $127.73 | $131.01 | −2.5% |
| Boston Celtics | $114.18 | $99.26 | +15.0% |
| Chicago Bulls | $78.88 | $25.73 | +53.6% |
| Minnesota Timberwolves | $73.13 | $55.85 | +30.9% |
| Toronto Raptors | $65.15 | $66.20 | −1.6% |
| Dallas Mavericks | $64.01 | $44.73 | +43.1% |
| Miami Heat | $63.18 | $57.73 | +9.5% |
| Orlando Magic | $57.73 | $37.01 | +56.0% |
| Brooklyn Nets | $56.08 | $43.70 | +28.3% |
| Oklahoma City Thunder | $52.08 | $27.03 | +92.7% |
| Los Angeles Clippers | $49.58 | $96.93 | −48.9% |
| Sacramento Kings | $48.83 | $77.30 | −36.8% |
| Denver Nuggets | $44.80 | $62.80 | −28.8% |
| San Antonio Spurs | $41.19 | $36.23 | +13.7% |
| Cleveland Cavaliers | $41.14 | $24.48 | +70.2% |
| Detroit Pistons | $41.03 | $23.33 | +79.4% |
| Atlanta Hawks | $39.25 | $36.62 | +7.2% |
| Milwaukee Bucks | $37.95 | $37.38 | +1.5% |
| Houston Rockets | $37.10 | $21.80 | +70.2% |
| Indiana Pacers | $37.05 | $30.50 | +21.5% |
| Washington Wizards | $35.60 | $20.28 | +72.1% |
| Phoenix Suns | $33.30 | $32.83 | +1.4% |
| Philadelphia 76ers | $31.70 | $35.93 | −11.8% |
| Portland Trail Blazers | $30.63 | $16.41 | +88.7% |
| Charlotte Hornets | $25.33 | $20.25 | +25.2% |
| New Orleans Pelicans | $22.58 | $45.55 | −50.4% |
| Utah Jazz | $22.28 | $20.13 | +10.7% |
| Memphis Grizzlies | $22.00 | $34.62 | −36.3% |

### Most popular jerseys, 2024-25 full season (NBAStore.com, via NBA + NBPA announcement)
1. Luka Dončić (Los Angeles Lakers) · 2. Stephen Curry (Golden State Warriors) · 3. LeBron James (Los Angeles Lakers) · 4. Jayson Tatum (Boston Celtics) · 5. Jalen Brunson (New York Knicks) · 6. Victor Wembanyama (San Antonio Spurs) · 7. Anthony Edwards (Minnesota Timberwolves) · 8. Ja Morant (Memphis Grizzlies) · 9. Shai Gilgeous-Alexander (Oklahoma City Thunder) · 10. Nikola Jokić (Denver Nuggets) · 11. Giannis Antetokounmpo (Milwaukee Bucks) · 12. LaMelo Ball (Charlotte Hornets) · 13. Kevin Durant (Phoenix Suns) · 14. Devin Booker (Phoenix Suns) · 15. Jaylen Brown (Boston Celtics)

Team merchandise top 10 (full season): 1. Lakers · 2. Celtics · 3. Warriors · 4. Knicks · 5. Bulls · 6. Mavericks · 7. Cavaliers · 8. Nuggets · 9. Spurs (#10 not shown in source).

## Patterns
1. **The cheapest seat hides the priciest win.** Fan cost per win flips the affordability ranking: New Orleans ($980/game, cheapest in the league) costs $46.67 per win; Utah ($1,020) $60.00; Washington ($1,100) $61.11 — all worse value than the Knicks' $41.78 at the league's priciest gate. Construct: **fan cost per win** exposes that "affordable" teams tax fans through losing.
2. **Revenue efficiency rewards youth, punishes dead money.** The five best payrolls-per-win (OKC, DET, CLE, HOU, BOS) all rode young cores or contender efficiency; the four worst (WAS, NOP, UTA, CHA) are all lottery teams — except Philadelphia, which paid $178M for 24 wins. Washington's $12.67M per win includes heavy dead-money drag (Beal-era contracts).
3. **2023-24 was the cautionary tale.** Per Bobby Marks' end-of-season estimates (via HoopsRumors): the Warriors paid ~$206M in salary + $176.9M in luxury tax for 46 wins and a play-in exit; the Clippers ~$200M + $142.4M tax for 51 wins and a first-round exit; the Suns $191.4M + $68.7M tax for 49 wins and a first-round sweep. Spending bought neither series wins nor fan value — the "highest-spending teams struggling" pattern (Front Office Sports).
4. **Merch money concentrates in five closets.** The Lakers own team-merch #1 and two of the top three jerseys (Dončić #1, LeBron #3) — and the $1,937 family cost, 2nd-highest in the league. The Celtics are merch #2 with two top-15 jerseys (Tatum #4, Brown #15). Jersey royalty follows winning + market size: 9 of the top 15 are from teams that made the playoffs.
5. **The Luka trade moved merch markets.** Dončić was #8 in the mid-season ranking (as a Maverick) and finished #1 after the Lakers trade — first player other than Curry or LeBron to top the list since 2012-13. No Maverick appears in the final top 15 (Bolavip).
6. **Prices chase wins, with a lag.** The Thunder's +92.7% get-in price jump (biggest in the league) came after 68 wins; the Clippers cut prices 48.9% (biggest drop) into the new Intuit Dome era; Portland +88.7% and Detroit +79.4% rose on breakout seasons. Eastern Conference tickets averaged 14.1% above the West (Sportscasting).

## Gaps / caveats
- Payroll is a snapshot (single Basketball Insiders table); mid-season trades shift "true" season payroll. Direction of bias is small but real.
- Wins are regular-season only; playoff success (what fans arguably pay for) is not in the denominator.
- Action Network family costs include 4 hats + 4 jerseys per outing, which inflates the merch-heavy teams' totals (Warriors' $740 merch, Knicks' $614) — the fan-cost-per-win metric inherits that merch assumption.
- Only 10 of 30 teams have published family-of-four costs; the middle-20 ranking is unknown.
- 2023-24 analysis is headline-level only (top taxpayers), not per-team.
- No TMR FCI numbers are used; methodology differs (TMR counts 4 avg tickets + 2 programs + parking + 2 hats + 2 beers + 4 sodas + 4 hot dogs — no jerseys).
- Sportscasting get-in prices are secondary-market (get-in), not face value — they reflect demand, not team pricing policy.

## Sources
- Action Network, "Most Expensive & Affordable NBA Games for Families in 2025" — https://www.actionnetwork.com/nba/the-most-expensive-and-most-affordable-nba-games-for-families-in-2025
- Sportscasting, "Average NBA Ticket Prices 2025" — https://www.sportscasting.com/news/nba-average-ticket-prices-2025-knicks-most-expensive-tickets-okc-biggest-price-hike/
- Basketball Insiders, NBA salaries/team payrolls (2024-25 snapshot) — http://www.basketballinsiders.com/nba-salaries/
- Spotrac 2024-25 NBA Team Salary Cap Tracker (records + cross-checks) — https://www.spotrac.com/nba/cap/_/year/2024
- landofbasketball.com, NBA 2024-25 Regular Season Standings — https://www.landofbasketball.com/yearbyyear/2024_2025_standings.htm
- Eurohoops, "Luka Doncic breaks down barriers on top-selling NBA jerseys" (NBA + NBPA 2024-25 full-season announcement) — https://www.eurohoops.net/en/nba-news/1812430/luka-doncic-first-in-top-selling-jerseys-los-angeles-lakers-nba/amp/
- Bolavip, "Not LeBron James, not Stephen Curry: Another NBA superstar tops jersey sales this season" — https://bolavip.com/en/nba/not-lebron-james-not-stephen-curry-another-nba-superstar-tops-jersey-sales-this-season
- HoopsRumors, "Warriors Top List Of NBA's 2023/24 Taxpayers" (Bobby Marks estimates) — http://hoopsrumors.com/2024/06/warriors-top-list-of-nbas-2023-24-taxpayers.html
- Front Office Sports, "NBA's Highest-Spending Teams Are Struggling This Postseason" — https://frontofficesports.com/article/the-nbas-highest-spending-teams-are-struggling-this-postseason/
- Bleacher Report, "Grading the 12 Highest Team Payrolls in NBA History" — https://BLEACHERREPORT.COM/articles/25180820-grading-12-highest-team-payrolls-nba-history
- Fadeaway World, Warriors/Clippers 2023-24 payroll + tax projections — https://fadeawayworld.net/the-warriors-and-clippers-are-set-to-pay-more-luxury-tax-for-the-2023-24-season-than-the-remaining-28-nba-teams-combined
- Empire Sports Media, Knicks/TMR FCI 2021-22 coverage (context only) — https://empiresportsmedia.com/new-york-knicks/knicks-remain-as-most-expensive-nba-team-to-watch/
- EssentiallySports, "NBA Teams Might Be Worth Billions But Fan Costs Tell the Real Story" (Hard Rock Bet FCI history context) — https://www.essentiallysports.com/flagship-think-tank-news-nba-teams-might-be-worth-billions-but-fan-costs-tell-the-real-story/
