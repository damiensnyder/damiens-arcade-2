# Mayhem Manager

Mayhem Manager is a multiplayer sports-management game. Up to 16 teams (people and bots) run fighters through seasons; the fights themselves are simulated. This is V2, ported from `damiens-arcade` and redesigned per the "Mayhem Manager Redesign" canvas.

## A season

1. **Offseason.** Fighters age a year, and contracts and equipment wear down by a year. Teams decide whom to re-sign (3 more seasons, at an asking price based on worth) and which worn-out equipment to repair (2 more seasons; a repair costs 25% of the item's price, plus another 25% for each time it's been repaired before). Anyone not re-signed becomes a free agent. Teams keep half their money and get $100. New people can join with an unused team. Each team starts with $100.
2. **Free agency (3 days).** Rookies plus last season's unsigned veterans. Each fighter's price drops each day (100% → 70% → 50%). People sign whenever they like, first come first served; bots sign at the end of each day. Free-agent contracts last 2 seasons. There's no limit on roster size. Anyone unsigned after day 3 leaves the league.
3. **Training camp.** Each team gets a private shop of 6 items. Each fighter either trains one stat (+1) or attunes to one piece of the team's equipment. Purchases and plans can be undone until ready. Fighters without a plan get the bots' suggestion. Then random age-based development happens. A team with no fighters gets the Concerned Owner (all zeros, this season only).
4. **Regular season.** Round-robin, `min(4, teams − 1)` weeks. Each week, every team hands out equipment and readies. A fight is simulated as soon as both teams are ready. The winner is the team with more fighters standing, then more HP left. Standings sort by wins, then (fighters standing for − against), then fighters standing for.
5. **Playoffs.** 2, 4, 6 or 8 teams make it: the smallest of those that lets in at least half the league. Seeded bracket (1v4, 2v3 / 1v8, 4v5, 2v7, 3v6); with 6, seeds 1 and 2 get first-round byes.
6. **Season over.** Once everyone readies, the next offseason starts.

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
- **History on request.** `getHistory` returns the finished seasons' records plus one career row per fighter. `getSeasonStats` returns one finished season's per-fighter totals. The client fetches these only when a view needs them, and caches them until `historyVersion` changes (once per season, or on import). Both are sent as rows of numbers (`wire.ts`). At 50 seasons with 16 teams, the history is about 80 KB and one season's totals about 4 KB.
- **League files.** These store the season totals packed too: about 255 KB at 50 seasons.
- **Replays.** Around 60 KB each, sent only on request (`getFight`), and kept for the current season.

## Equipment and abilities

`docs/mm-catalog-plain.txt` is the source of truth for equipment and fighter abilities: names, slots, prices, descriptions and flavor text. After editing it, run `npm run check:mm-catalog`. It lists everything in the code that no longer matches the txt, plus anything missing battle behavior or images. Equipment is matched by name and abilities by description, so renaming an item or rewording an ability shows up as one removed and one added.

Status effects: frozen (slower, cooldowns at half speed), burning (5 damage a second), taunted (can only attack the taunter), scared (runs from the nearest enemy and doesn't attack), and hyped (+2 stars to strength, speed and energy). All but hyped are negative.

To add equipment, add the display entry in `catalog.ts`, its behavior in `sim/behaviors.ts`, and images named after the key in kebab case under `static/mm/equipment/` (worn) and `static/mm/icons/` (shown in cards). If the effect is an attack or stat change, declare it as `attack` or `statMods` and the valuation handles it. For anything else, add `value` hints (extra DPS, or multipliers on DPS or effective HP).

Stats run from 0 to 10. Descriptions count stars, and one star is 2 stat points.

## Balance

`npx tsx scripts/mm-simulate.ts [teams] [seasons]` plays an all-bot league and prints standings, money and roster sizes.
