# Mayhem Manager

Mayhem Manager is a multiplayer sports-management game. Up to 16 teams (people and bots) run fighters through seasons; the fights themselves are simulated. This is V2, ported from `damiens-arcade` and redesigned per the "Mayhem Manager Redesign" canvas.

## A season

1. **Offseason.** Fighters age a year and develop (stats drift up for the young and down for the old, with some randomness), including free agents left over from last season. Contracts and equipment wear down by a year. Teams decide whom to re-sign (3 more seasons, at 20% over the fighter's price) and which worn-out equipment to repair (2 more seasons; a repair costs 25% of the item's price, plus another 25% for each time it's been repaired before). Teams keep half their money and get $100 (plus $25 in a team's second season). New people can join with an unused team. Each team starts with $150 ($100, plus $50 for a new franchise).
2. **Free agency (3 days).** Each season brings one rookie per team, plus one, all aged 19. The rookies, the fighters nobody re-signed and anyone left unsigned last season are ranked by worth, which counts age, so promising rookies rank well and declining veterans fall away. The best are offered, as many as teams can afford: their last-day prices add up to about all the money teams have, and there are at least 2 per team. The rest leave the league. Fighters left unsigned after day 3 stay around (aging and developing) and are ranked again next season. People sign whenever they like, first come first served; bots sign at the end of each day. Free-agent contracts last 2 seasons. There's no limit on roster size.
3. **Training camp.** Each team gets a private shop of 6 items. Each fighter either trains one stat (+1) or attunes to one piece of the team's equipment that can be attuned. Purchases and plans can be undone until ready. Fighters without a plan get the bots' suggestion. A team with no fighters gets the Concerned Owner (all zeros, this season only).
4. **Regular season.** Round-robin, `min(4, teams − 1)` weeks. Each week, every team hands out equipment and readies. A fight is simulated as soon as both teams are ready. The winner is the team with more fighters standing, then more HP left. Standings sort by wins, then (fighters standing for − against), then fighters standing for.
5. **Playoffs.** 2, 4, 6 or 8 teams make it: the smallest of those that lets in at least half the league. Seeded bracket (1v4, 2v3 / 1v8, 4v5, 2v7, 3v6); with 6, seeds 1 and 2 get first-round byes.
6. **Season over.** Once everyone readies, the next offseason starts.

A new league starts with 8 earlier rookie classes as well as this season's. Each class has gone through the training camps and development it would have had, so the first free agency has a spread of ages.

**Fighter prices.** A fighter's price is $20, plus $0.50 per half-star (stat point), plus their ability's price from the catalog, kept between $30 and $60. Stat points are averaged over the contract, counting a year of expected development for each season after the first (`projectedStatPoints` in `rules.ts`), so young fighters cost a little more than their stats show and old ones a little less. That's the price on the last day of free agency (a 2-season contract). Day 1 is 20% more, and day 2 is 10% more. Re-signing costs 20% more, priced for 3 seasons instead of 2. With a typical roster of 3.5 fighters and 6 pieces of equipment, upkeep comes to about $95 a year, against $100 of income.

Leagues always have an even number of teams; a bot is added when needed. The host can force-ready, which has bots make picks for anyone who isn't ready. If no people are left in a league, nothing advances except through force-ready, so all-bot leagues don't run forever.

Results stay hidden until a viewer clicks "see result" or watches the replay, and so does everything computed from them (standings, leaders, fighter stats, titles). Your own team's results this season stay hidden even after the week moves on; other teams' results from earlier rounds show automatically.

## Code layout

- `src/lib/games/mayhem-manager/` holds code shared by client and server:
  - types and the display catalog (`catalog.ts`)
  - the 16 teams (`teams.ts`)
  - rules and helpers (`rules.ts`)
  - action schemas (`actions.ts`)
  - the replay player (`replay.ts`)
  - client state (`state.svelte.ts`) and Svelte views
- `src/server/games/mayhem-manager/` holds server-only code:
  - `index.ts`: the league (phases, actions, viewpoints, import/export)
  - `state.ts`: the league as plain data, plus the import schema
  - `sim/`: the battle simulation. `behaviors.ts` holds each item's and ability's attack data, stat mods and hooks, keyed like the catalog.
  - `valuation.ts`: fighter and loadout worth, computed from the same formulas as the sim
  - `bot.ts`: bot decisions
  - `generate.ts`: rookies and shops

The server sends each viewer a full viewpoint after every change, not incremental events. Lineups, shops and training plans are only included for their own team.

Leagues can run for dozens of seasons, so the data that grows is kept out of those updates:

- **Live viewpoint: the current season only.** It holds this season's matches, bracket and box scores, one line per fighter per match. Per-match detail is needed only to hide results a viewer hasn't seen. With 16 teams it's about 40 KB, mostly rosters, however old the league is.
- **Rolled up at season end.** When the next offseason starts, the finished season's box scores collapse to one line per fighter, team and regular season/playoffs (`seasonStats`). Its matches and replays are dropped. Standings and the bracket live on in the season's record.
- **Equipment records.** The sim credits each piece of equipment with the damage it dealt to enemies, HP it healed, damage it prevented and money it earned (`Fight.credit`). This season's are kept one line per item per match (`itemLines`) so unseen results stay hidden, and roll up into the item's own `totals` at season end, for as long as the team keeps it. Items that never do any of those have no record.
- **History on request.** `getHistory` returns the finished seasons' records plus one career row per fighter. `getSeasonStats` returns one finished season's per-fighter totals. The client fetches these only when a view needs them, and caches them until `historyVersion` changes (once per season, or on import). Both are sent as rows of numbers (`wire.ts`). At 50 seasons with 16 teams, the history is about 80 KB and one season's totals about 4 KB.
- **League files.** These store the season totals packed too: about 255 KB at 50 seasons.
- **Replays.** Around 60 KB each, sent only on request (`getFight`), and kept for the current season.

## Equipment and abilities

`docs/mm-catalog-plain.txt` is the source of truth for equipment and fighter abilities: names, slots, prices, descriptions and flavor text. `##` headings in it are just for grouping. After editing it, run `npm run check:mm-catalog`. It lists everything in the code that no longer matches the txt, plus anything missing battle behavior or images. Equipment and abilities are matched by name, so renaming one shows up as one removed and one added.

Only equipment whose description has an `[attuned: …]` part can be attuned to. Picky fighters can't use weapons they aren't attuned to. Charging equipment, and any other action without a cooldown in its description, has a 1s cooldown. Equipment without art yet borrows another item's images (`PLACEHOLDER_ART` in `catalog.ts`).

Status effects: frozen (slower, cooldowns at half speed), burning (5 damage a second; setting someone on fire again only refreshes it), stunned (doesn't move or act), taunted (can only attack the taunter), scared (runs from whoever scared them and doesn't attack), hyped (+3 stars to all stats) and invisible (enemies can't pick them as a target, though area effects still hit). Hyped and invisible are positive; the rest are negative.

Summons (the cardboard cutout's decoy) are fighters on the team that don't count as standing, earn no box score and can't be healed or hyped. A decoy looks as dangerous to enemies as whoever it copies, so it draws attacks.

Overtime: from 30s into a fight, everyone standing loses half a star of toughness every 5s, so fights can't stall (with healing, say). Fights stop at 2 minutes regardless.

To add equipment, add the display entry in `catalog.ts`, its behavior in `sim/behaviors.ts`, and images named after the key in kebab case under `static/mm/equipment/` (worn) and `static/mm/icons/` (shown in cards). If the effect is an attack or stat change, declare it as `attack` or `statMods` and the valuation handles it. For anything else, add `value` hints saying what it amounts to: extra damage per second, extra HP, a share of hits blocked, stats gained on average, hype for teammates, or a support action (see `ValueHints` in `sim/behaviors.ts`).

Stats run from 0 to 10. Descriptions count stars, and one star is 2 stat points. The server tracks stats in fractions; clients only get them rounded to whole points (half-stars), so a 4-star fighter might be a 4.2.

Aging lives in `development.ts`: each year every stat changes by a shared random amount plus its own, centered on `averageIncrease(age)`, which rises until the mid-20s, declines in the 30s and faster after 32. Rookies are 19 with stats of random()³ × 7.

## Bots

Bots judge everything by team value (`valuation.ts`). Each fighter counts their output (damage or healing per second, from their best attack and the sim's formulas) times how long they last: their own effective HP plus the HP of the teammates the enemy goes after first. Enemies go after whoever they can do the most about, as the sim's fighters do (more output and less HP draw attention; a frilly skirt deflects it), so protection on a team's best fighter is worth a lot and a soaker's HP shields everyone behind them. Each fighter's (output × time) counts to the power 0.85, and the team's value is the sum. Items that buff teammates do it through teammates' stats; support actions (healing, hyping) replace attacking when that's worth more. A few global constants (`TUNING`, plus how long a fighter typically fights) are fitted against simulated fights.

A purchase is worth how much it raises log(team value), times the seasons it lasts. Each offseason a bot lists what it could buy (re-signs, repairs, the free agents it can see, and the shop to come, each catalog item scaled by its chance of being offered, and counted 1.5 times over so bots save up enough to afford an expensive item when one comes up; more saving means fewer fighters) and buys the best value per dollar until nothing affordable helps. It does the same each day of free agency (bots sign at the end of the day) and in the shop. Lineups are chosen for the whole team: items go out one at a time to whoever they help most, then get moved around until nothing improves. Training goes to whichever stat or attunement raises team value most.

`npx tsx scripts/mm-h2h.ts <a.ts> <b.ts>` plays all-bot leagues with half the teams on each of two bot versions (files exporting `BOT`, or `default`) and reports how often A beats B. `--b-first` lets B sign free agents during the day, before the bots, as people can.

## Balance

`npx tsx scripts/mm-simulate.ts [teams] [seasons]` plays an all-bot league and prints standings, money and roster sizes.

`npx tsx scripts/mm-values.ts` estimates what each stat (per star), ability, piece of equipment and extra fighter is worth in a fight, in dollars scaled so the equipment catalog as a whole is fairly priced. It takes snapshots of teams from all-bot leagues and makes each one fight an exact copy of itself with one thing changed. Equipment goes to whichever fighter it helps most. A run with 600 snapshots takes about 15 minutes on 8 cores.
