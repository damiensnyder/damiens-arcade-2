import type { MMAction } from './actions.js';
import { computeStandings, playoffRoundCount, playoffSize, regularSeasonWeeks } from './rules.js';
import type {
	Fighter,
	FightLog,
	FreeAgent,
	LeagueHistory,
	Match,
	MMPrivateEvent,
	MMViewpoint,
	MMViewpointWire,
	SeasonRecord,
	StandingRow,
	StatLine,
	StatTotal,
	TeamId,
	TeamView
} from './types.js';
import { unpackHistory, unpackStatLines, unpackTotals } from './wire.js';

export type Tab = 'phase' | 'league' | 'team' | 'history';

/** Client-side state for one Mayhem Manager room: the server's viewpoint plus local UI state. */
export class MMState {
	vp = $state<MMViewpoint | null>(null);

	tab = $state<Tab>('phase');
	/** Team shown on the team tab. */
	viewingTeam = $state<TeamId | null>(null);
	/** Spectator browsing the team list to join one. */
	choosingTeam = $state(false);
	scouting = $state(false);
	watching = $state<{ matchId: number; log: FightLog | null } | null>(null);
	notice = $state<string | null>(null);
	leagueExport = $state<string | null>(null);
	/** Match IDs whose results this viewer has chosen to see. */
	revealed = $state<Set<number>>(new Set());
	/** Finished seasons, fetched only when a view needs them (it grows every season). */
	history = $state<LeagueHistory | null>(null);
	/** Per-fighter totals for finished seasons, fetched one season at a time. */
	seasonTotals = $state<Map<number, StatTotal[]>>(new Map());
	private historyRequested: number | null = null;
	private seasonTotalsRequested = new Set<number>();

	private send: (action: MMAction) => void;
	private storageKey: string;

	constructor(roomCode: string, send: (action: unknown) => void) {
		this.send = send;
		this.storageKey = `mm-revealed-${roomCode}`;
		try {
			const saved = JSON.parse(localStorage.getItem(this.storageKey) ?? '[]');
			if (Array.isArray(saved)) this.revealed = new Set(saved.filter((x) => typeof x === 'number'));
		} catch {
			// private browsing or bad data; start fresh
		}
	}

	act(action: MMAction): void {
		this.send(action);
	}

	applyGamestate(wire: MMViewpointWire): void {
		const { stats, ...rest } = wire;
		const vp: MMViewpoint = { ...rest, statLines: unpackStatLines(stats) };
		const prev = this.vp;
		this.vp = vp;
		if (prev && prev.historyVersion !== vp.historyVersion) {
			// a season just finished (or a league was imported); cached history is out of date
			this.seasonTotals = new Map();
			this.seasonTotalsRequested.clear();
			if (this.history) this.ensureHistory();
		}
		if (prev && prev.phase.kind !== vp.phase.kind) {
			this.scouting = false;
			this.tab = 'phase';
		}
		if (vp.myTeam !== null) this.choosingTeam = false;
	}

	handleEvent(event: MMPrivateEvent | { type: string }): void {
		const e = event as MMPrivateEvent;
		if (e.type === 'fightLog') {
			if (this.watching?.matchId === e.log.matchId) this.watching = { matchId: e.log.matchId, log: e.log };
		} else if (e.type === 'leagueExport') {
			this.leagueExport = JSON.stringify(e.league);
		} else if (e.type === 'history') {
			this.history = unpackHistory(e.history);
		} else if (e.type === 'seasonStats') {
			if (e.version === this.vp?.historyVersion) {
				this.seasonTotals = new Map([...this.seasonTotals, [e.season, unpackTotals(e.totals)]]);
			}
		} else if (e.type === 'notice') {
			this.notice = e.message;
			if (this.watching && !this.watching.log) this.watching = null;
		}
	}

	/** Asks for the league history if we don't have the current version. Safe to call often. */
	ensureHistory(): void {
		const version = this.vp?.historyVersion;
		if (version === undefined || this.history?.version === version || this.historyRequested === version) return;
		this.historyRequested = version;
		this.act({ type: 'getHistory' });
	}

	/** Asks for one finished season's per-fighter totals if we don't have them. Safe to call often. */
	ensureSeasonTotals(season: number): void {
		const vp = this.vp;
		if (!vp || season < 1 || season >= vp.season) return;
		if (this.seasonTotals.has(season) || this.seasonTotalsRequested.has(season)) return;
		this.seasonTotalsRequested.add(season);
		this.act({ type: 'getSeasonStats', season });
	}

	watch(matchId: number): void {
		this.watching = { matchId, log: null };
		this.act({ type: 'getFight', match: matchId });
	}

	reveal(matchId: number): void {
		if (this.revealed.has(matchId)) return;
		this.revealed = new Set([...this.revealed, matchId]);
		try {
			localStorage.setItem(this.storageKey, JSON.stringify([...this.revealed]));
		} catch {
			// not worth bothering anyone about
		}
	}

	/**
	 * Whether to show a match's result. The viewer's own team's results this season only show
	 * once they've watched or asked; other results from earlier rounds show automatically.
	 */
	isRevealed(match: Match): boolean {
		if (!match.result) return false;
		if (this.revealed.has(match.id)) return true;
		const vp = this.vp;
		if (!vp) return false;
		if (match.season < vp.season) return true;
		if (vp.myTeam !== null && (match.a === vp.myTeam || match.b === vp.myTeam)) return false;
		const phase = vp.phase;
		if (phase.kind === 'regularSeason') return match.week !== null && match.week < phase.week;
		if (phase.kind === 'playoffs') return match.week !== null || (match.round !== null && match.round < phase.round);
		// once the season's over, only spoil the final if someone asks
		if (phase.kind === 'seasonOver') return match.week !== null || match.round !== this.playoffRounds - 1;
		return true;
	}

	viewTeam(id: TeamId): void {
		this.viewingTeam = id;
		this.tab = 'team';
	}

	// ---- derived data ----

	get myTeam(): TeamView | null {
		return this.vp?.teams.find((t) => t.isMine) ?? null;
	}

	team(id: TeamId): TeamView | undefined {
		return this.vp?.teams.find((t) => t.id === id);
	}

	get teamCount(): number {
		return this.vp?.teams.length ?? 0;
	}

	get weeks(): number {
		return regularSeasonWeeks(this.teamCount);
	}

	get playoffRounds(): number {
		const bracket = this.vp?.bracket;
		if (bracket) return bracket.rounds.length;
		return playoffRoundCount(playoffSize(this.teamCount));
	}

	/** All matches, with results the viewer hasn't chosen to see blanked out. */
	visibleMatches(): Match[] {
		return (this.vp?.matches ?? []).map((m) => (m.result && !this.isRevealed(m) ? { ...m, result: null } : m));
	}

	/** Box-score lines from matches the viewer has seen. */
	get visibleStatLines(): StatLine[] {
		const vp = this.vp;
		if (!vp) return [];
		const byId = new Map(vp.matches.map((m) => [m.id, m]));
		return vp.statLines.filter((l) => {
			const m = byId.get(l.matchId);
			return !m || this.isRevealed(m);
		});
	}

	/** Whether the viewer has seen how the current season's final turned out. */
	get finalRevealed(): boolean {
		const vp = this.vp;
		if (!vp || vp.phase.kind !== 'seasonOver') return true;
		const final = vp.matches.find((m) => m.round === this.playoffRounds - 1);
		return !final || this.isRevealed(final);
	}

	/** This season's champion, once there is one (whether or not the viewer has seen it). */
	private get currentChampion(): TeamId | null {
		const vp = this.vp;
		if (!vp || vp.phase.kind !== 'seasonOver' || !vp.bracket) return null;
		return vp.bracket.rounds.at(-1)?.[0]?.winner ?? null;
	}

	/**
	 * Finished seasons: the history (once fetched; see ensureHistory) plus the season that just
	 * ended, once the viewer has seen its final.
	 */
	get finishedSeasons(): SeasonRecord[] {
		const vp = this.vp;
		if (!vp) return [];
		const seasons = this.history?.seasons ?? [];
		if (vp.phase.kind === 'seasonOver' && vp.bracket && this.finalRevealed) {
			return [...seasons, { season: vp.season, standings: this.standings(), bracket: vp.bracket, champion: this.currentChampion }];
		}
		return seasons;
	}

	titlesOf(team: TeamId): number {
		const t = this.team(team);
		if (!t) return 0;
		return t.titles - (this.currentChampion === team && !this.finalRevealed ? 1 : 0);
	}

	/** Standings for this season (from what the viewer has seen) or a finished one (from the history). */
	standings(season = this.vp?.season ?? 1): StandingRow[] {
		const vp = this.vp;
		if (!vp) return [];
		if (season !== vp.season) return this.history?.seasons.find((s) => s.season === season)?.standings ?? [];
		return computeStandings(
			this.visibleMatches(),
			season,
			vp.teams.map((t) => t.id)
		);
	}

	rankOf(team: TeamId): number {
		return this.standings().findIndex((r) => r.team === team) + 1;
	}

	recordOf(team: TeamId): string {
		const row = this.standings().find((r) => r.team === team);
		return row ? `${row.wins}–${row.losses}` : '0–0';
	}

	currentMatches(): Match[] {
		const vp = this.vp;
		if (!vp) return [];
		const phase = vp.phase;
		if (phase.kind === 'regularSeason') return vp.matches.filter((m) => m.season === vp.season && m.week === phase.week);
		if (phase.kind === 'playoffs') return vp.matches.filter((m) => m.season === vp.season && m.round === phase.round);
		return [];
	}

	myCurrentMatch(): Match | undefined {
		const mine = this.vp?.myTeam;
		if (mine == null) return undefined;
		return this.currentMatches().find((m) => m.a === mine || m.b === mine);
	}

	/** My most recent finished match from an earlier round, for the "last week" card. */
	myLastMatch(): Match | undefined {
		const vp = this.vp;
		const mine = vp?.myTeam;
		if (!vp || mine == null) return undefined;
		const current = new Set(this.currentMatches().map((m) => m.id));
		return vp.matches
			.filter((m) => m.season === vp.season && m.result && !current.has(m.id) && (m.a === mine || m.b === mine))
			.at(-1);
	}

	/** Finds a fighter anywhere in the league (rosters, contracts up, free agents). */
	findFighter(id: number): { fighter: Fighter; team: TeamId | null } | null {
		const vp = this.vp;
		if (!vp) return null;
		for (const t of vp.teams) {
			const f = t.fighters.find((x) => x.id === id) ?? t.expiring.find((c) => c.fighter.id === id)?.fighter;
			if (f) return { fighter: f, team: t.id };
		}
		const agent: FreeAgent | undefined = vp.freeAgents.find((a) => a.fighter.id === id);
		if (agent) return { fighter: agent.fighter, team: agent.signedBy };
		return null;
	}

	/**
	 * "2 fights · 3 KOs" style summary for this season, or for a finished one once its totals
	 * have been fetched (see ensureSeasonTotals).
	 */
	seasonLine(fighterId: number, season = this.vp?.season ?? 1, withDamage = false): string {
		const source: StatTotal[] = season === this.vp?.season ? this.visibleStatLines : (this.seasonTotals.get(season) ?? []);
		const lines = source.filter((l) => l.fighterId === fighterId);
		const fights = lines.reduce((s, l) => s + l.fights, 0);
		if (fights === 0) return '';
		const kos = lines.reduce((s, l) => s + l.kos, 0);
		const dmg = lines.reduce((s, l) => s + l.dmgDealt, 0);
		let text = `${fights} fight${fights === 1 ? '' : 's'} · ${kos} KO${kos === 1 ? '' : 's'}`;
		if (withDamage) text += ` · ${Math.round(dmg)} damage dealt`;
		return text;
	}

	/** "3 seasons · 12 fights · 9 KOs", combining the history with what the viewer has seen this season. */
	careerLine(fighterId: number): string {
		const past = this.history?.careers.find((c) => c.fighterId === fighterId);
		const current = this.visibleStatLines.filter((l) => l.fighterId === fighterId);
		const seasons = (past?.seasons ?? 0) + (current.length > 0 ? 1 : 0);
		if (seasons === 0) return 'rookie';
		const fights = (past ? past.regularSeason.fights + past.playoffs.fights : 0) + current.length;
		const kos = (past ? past.regularSeason.kos + past.playoffs.kos : 0) + current.reduce((s, l) => s + l.kos, 0);
		return `${seasons} season${seasons === 1 ? '' : 's'} · ${fights} fights · ${kos} KOs`;
	}
}
