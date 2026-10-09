import { GameLogicHandler } from '../../game-logic-base.js';
import { actionSchema, type MMAction } from '../../../lib/games/mayhem-manager/actions.js';
import { EQUIPMENT } from '../../../lib/games/mayhem-manager/catalog.js';
import {
	FA_CONTRACT_YEARS,
	FA_DAYS,
	MAX_STAT,
	MAX_TEAMS,
	NEW_EQUIPMENT_YEARS,
	REPAIR_YEARS,
	RESIGN_CONTRACT_YEARS,
	SEASON_INCOME,
	STARTING_MONEY,
	canWearTogether,
	computeStandings,
	playoffRoundCount,
	repairPrice,
	playoffSize,
	regularSeasonWeeks,
	sanitizeLineup
} from '../../../lib/games/mayhem-manager/rules.js';
import {
	STAT_NAMES,
	type Bracket,
	type Decision,
	type Fighter,
	type FightLog,
	type Match,
	type MMPrivateEvent,
	type MMViewpointWire,
	type PackedRows,
	type Career,
	type LeagueHistory,
	type StatTotal,
	type Totals,
	type PlayoffPairing,
	type StatLine,
	type TeamId,
	type TrainingPlan
} from '../../../lib/games/mayhem-manager/types.js';
import { packHistory, packStatLines, packTotals } from '../../../lib/games/mayhem-manager/wire.js';
import { chooseLineup, chooseShopping, chooseSignings, chooseTraining, decideOffseason } from './bot.js';
import { concernedOwner, generateFighter, generateShop } from './generate.js';
import { Rng } from './rng.js';
import { simulateFight, type Combatant } from './sim/fight.js';
import { checkLeague, leagueSchema, type LeagueState, type TeamState } from './state.js';
import { contractWorth } from './valuation.js';

export default class MayhemManager extends GameLogicHandler {
	emptyRoomTtlMs = 60 * 60 * 1000; // leagues take a while; give people time to come back

	private s: LeagueState;
	private rng: Rng;
	/** Replays for the current and previous season, by match ID. Not exported. */
	private fightLogs = new Map<number, FightLog>();
	/** Bumped whenever finished seasons change, so clients know to re-fetch the history. */
	private historyVersion = 1;

	constructor() {
		super();
		this.rng = new Rng();
		this.s = {
			version: 2,
			season: 1,
			phase: { kind: 'pregame' },
			teams: [],
			freeAgents: [],
			matches: [],
			bracket: null,
			seasons: [],
			statLines: [],
			seasonStats: [],
			nextId: 1,
			rng: this.rng.state
		};
	}

	// ---- plumbing ----

	handleAction(viewerId: number, raw: unknown, isHost: boolean): void {
		const parsed = actionSchema.safeParse(raw);
		if (!parsed.success) return;
		if (this.apply(viewerId, parsed.data, isHost)) this.sync();
	}

	handleDisconnect(viewerId: number): void {
		const team = this.teamOf(viewerId);
		if (!team) return;
		this.releaseTeam(team);
		this.sync();
	}

	getPreferredNewHost(candidates: number[]): number | null {
		return candidates.find((id) => this.teamOf(id) !== null) ?? null;
	}

	private sync(): void {
		this.sendGamestate();
	}

	private nextId(): number {
		return this.s.nextId++;
	}

	private teamOf(viewerId: number): TeamState | null {
		return this.s.teams.find((t) => t.controller === viewerId) ?? null;
	}

	private team(id: TeamId): TeamState | undefined {
		return this.s.teams.find((t) => t.id === id);
	}

	private humanTeams(): TeamState[] {
		return this.s.teams.filter((t) => t.controller !== 'bot');
	}

	private apply(viewerId: number, action: MMAction, isHost: boolean): boolean {
		const team = this.teamOf(viewerId);
		const phase = this.s.phase.kind;
		switch (action.type) {
			case 'join':
				return this.join(viewerId, action.team);
			case 'replace': {
				const target = this.team(action.team);
				if (team || !target || target.controller !== 'bot') return false;
				target.controller = viewerId;
				// a bot might have readied already; let the new owner look things over
				if (phase !== 'regularSeason' && phase !== 'playoffs') target.ready = false;
				return true;
			}
			case 'leave':
				if (!team) return false;
				this.releaseTeam(team);
				return true;
			case 'addBot':
				return isHost && this.addBot();
			case 'removeBot': {
				const target = this.team(action.team);
				if (!isHost || phase !== 'pregame' || !target || target.controller !== 'bot') return false;
				this.s.teams = this.s.teams.filter((t) => t !== target);
				return true;
			}
			case 'ready':
				return team !== null && this.setReady(team, true);
			case 'unready':
				return team !== null && this.setReady(team, false);
			case 'forceReady':
				if (!isHost) return false;
				this.forceReady();
				return true;
			case 'contract':
				return team !== null && this.decideContract(team, action.fighter, action.decision);
			case 'repair':
				return team !== null && this.decideRepair(team, action.equipment, action.decision);
			case 'sign':
				return team !== null && this.sign(team, action.fighter);
			case 'buy':
				return team !== null && this.buy(team, action.item, action.bought);
			case 'train':
				return team !== null && this.setTraining(team, action.fighter, action.plan);
			case 'equip':
				return team !== null && this.equip(team, action.equipment, action.fighter);
			case 'getFight':
				this.sendFight(viewerId, action.match);
				return false;
			case 'getHistory':
				this.emitPrivate(viewerId, { type: 'history', history: packHistory(this.buildHistory()) });
				return false;
			case 'getSeasonStats': {
				const totals = action.season < this.s.season ? this.s.seasonStats.filter((t) => t.season === action.season) : [];
				this.emitPrivate(viewerId, { type: 'seasonStats', version: this.historyVersion, season: action.season, totals: packTotals(totals) });
				return false;
			}
			case 'exportLeague':
				this.emitPrivate(viewerId, { type: 'leagueExport', league: this.exportLeague() });
				return false;
			case 'importLeague':
				if (!isHost) return false;
				return this.importLeague(viewerId, action.league);
		}
	}

	private emitPrivate(viewerId: number, event: MMPrivateEvent): void {
		this.emitEventTo(viewerId, event);
	}

	// ---- joining and leaving ----

	private canAddTeams(): boolean {
		const phase = this.s.phase.kind;
		return (phase === 'pregame' || phase === 'offseason') && this.s.teams.length < MAX_TEAMS;
	}

	private newTeam(id: TeamId, controller: number | 'bot'): TeamState {
		return {
			id,
			controller,
			money: STARTING_MONEY,
			ready: controller === 'bot',
			fighters: [],
			equipment: [],
			titles: 0,
			expiring: [],
			repairs: [],
			shop: [],
			training: {},
			lineup: {}
		};
	}

	private join(viewerId: number, id: TeamId): boolean {
		if (this.teamOf(viewerId) || !this.canAddTeams() || this.team(id)) return false;
		this.s.teams.push(this.newTeam(id, viewerId));
		this.s.teams.sort((a, b) => a.id - b.id);
		return true;
	}

	private addBot(): boolean {
		if (!this.canAddTeams()) return false;
		const open = [...Array(MAX_TEAMS).keys()].filter((id) => !this.team(id));
		if (open.length === 0) return false;
		this.s.teams.push(this.newTeam(this.rng.pick(open), 'bot'));
		this.s.teams.sort((a, b) => a.id - b.id);
		return true;
	}

	/** Someone left: before the season their team just goes away; after, a bot takes over. */
	private releaseTeam(team: TeamState): void {
		if (this.s.phase.kind === 'pregame') {
			this.s.teams = this.s.teams.filter((t) => t !== team);
			this.maybeAdvance();
			return;
		}
		team.controller = 'bot';
		if (!team.ready) this.botFinishTurn(team);
		this.maybeAdvance();
	}

	// ---- readiness and phase changes ----

	private setReady(team: TeamState, ready: boolean): boolean {
		const phase = this.s.phase;
		if (phase.kind === 'regularSeason' || phase.kind === 'playoffs') {
			const match = this.currentMatchFor(team.id);
			if (!match || match.result) return false;
			if (ready) team.lineup = sanitizeLineup(team.fighters, team.equipment, team.lineup);
			team.ready = ready;
			if (ready) this.playMatchIfReady(match);
			this.checkRoundComplete();
			return true;
		}
		if (team.ready === ready) return false;
		team.ready = ready;
		if (ready) this.maybeAdvance();
		return true;
	}

	/** Bots make whatever picks are left for this team, then it's marked ready. */
	private botFinishTurn(team: TeamState): void {
		const phase = this.s.phase;
		switch (phase.kind) {
			case 'offseason':
				decideOffseason(team);
				break;
			case 'freeAgency':
				for (const agent of chooseSignings(team, this.s.freeAgents, phase.day, FA_DAYS)) {
					this.sign(team, agent.fighter.id, true);
				}
				break;
			case 'training':
				if (team.controller === 'bot') chooseShopping(team);
				chooseTraining(team);
				break;
			case 'regularSeason':
			case 'playoffs': {
				const current = sanitizeLineup(team.fighters, team.equipment, team.lineup);
				const hasPicks = Object.values(current).some((ids) => ids.length > 0);
				team.lineup = hasPicks && team.controller !== 'bot' ? current : chooseLineup(team.fighters, team.equipment);
				break;
			}
		}
		team.ready = true;
		if (phase.kind === 'regularSeason' || phase.kind === 'playoffs') {
			const match = this.currentMatchFor(team.id);
			if (match) this.playMatchIfReady(match);
		}
	}

	private forceReady(): void {
		for (const team of this.s.teams) {
			if (!team.ready) this.botFinishTurn(team);
		}
		this.maybeAdvance(true);
	}

	/**
	 * Moves on once everyone's ready. With no people left in the league, only the host's
	 * force-ready moves things along, so an all-bot league doesn't run forever.
	 */
	private maybeAdvance(forced = false): void {
		const phase = this.s.phase;
		if (phase.kind === 'regularSeason' || phase.kind === 'playoffs') {
			this.checkRoundComplete(forced);
			return;
		}
		const humans = this.humanTeams();
		if (!forced && humans.length === 0) return;
		if (!this.s.teams.every((t) => t.ready)) return;
		switch (phase.kind) {
			case 'pregame':
				if (this.s.teams.length > 0) this.startFirstSeason();
				break;
			case 'offseason':
				this.finishOffseason();
				break;
			case 'freeAgency':
				this.finishFreeAgencyDay();
				break;
			case 'training':
				this.finishTraining();
				break;
			case 'seasonOver':
				this.startOffseason();
				break;
		}
	}

	private resetReady(): void {
		for (const team of this.s.teams) {
			team.ready = false;
		}
	}

	/** Bots go first in every phase except free agency, where they sign at the end of each day. */
	private botsTakeTurns(): void {
		for (const team of this.s.teams) {
			if (team.controller === 'bot') {
				if (this.s.phase.kind === 'freeAgency') team.ready = true;
				else this.botFinishTurn(team);
			}
		}
	}

	/** Leagues need an even number of teams, so a bot fills the gap. */
	private evenOutTeams(): void {
		if (this.s.teams.length === 1 || this.s.teams.length % 2 === 1) this.addBotTeam();
	}

	private addBotTeam(): void {
		const open = [...Array(MAX_TEAMS).keys()].filter((id) => !this.team(id));
		if (open.length === 0) return;
		this.s.teams.push(this.newTeam(this.rng.pick(open), 'bot'));
		this.s.teams.sort((a, b) => a.id - b.id);
	}

	private startFirstSeason(): void {
		this.evenOutTeams();
		this.s.season = 1;
		// the first season's pool has to stock every team from scratch
		const count = this.s.teams.length * 4 + 4;
		for (let i = 0; i < count; i++) {
			this.s.freeAgents.push(this.newFreeAgent(generateFighter(this.rng, this.nextId(), 20, 30), null));
		}
		this.startFreeAgency();
	}

	private newFreeAgent(fighter: Fighter, formerTeam: TeamId | null) {
		return { fighter, prices: [], formerTeam, signedBy: null, signedPrice: null };
	}

	// ---- offseason ----

	private startOffseason(): void {
		this.rollUpSeason();
		this.s.season++;
		this.s.phase = { kind: 'offseason' };
		for (const team of this.s.teams) {
			team.fighters = team.fighters.filter((f) => !f.isOwner);
			for (const f of team.fighters) {
				f.age++;
				f.contractYears--;
			}
			team.expiring = team.fighters
				.filter((f) => f.contractYears <= 0)
				.map((fighter) => ({
					fighter,
					ask: Math.max(3, Math.round(contractWorth(fighter) * 1.15 + this.rng.int(-3, 3))),
					decision: 'pending' as Decision
				}));
			team.fighters = team.fighters.filter((f) => f.contractYears > 0);
			for (const e of team.equipment) {
				e.yearsLeft--;
				e.yearsOwned++;
			}
			team.repairs = team.equipment
				.filter((e) => e.yearsLeft <= 0)
				.map((equipment) => ({
					equipment,
					price: repairPrice(EQUIPMENT[equipment.key]?.price ?? 10, equipment.timesRepaired),
					decision: 'pending' as Decision
				}));
			team.equipment = team.equipment.filter((e) => e.yearsLeft > 0);
			team.money = Math.ceil(team.money / 2) + SEASON_INCOME;
			team.lineup = sanitizeLineup(team.fighters, team.equipment, team.lineup);
		}
		// this year's rookies, so people can see who's coming
		const rookies = Math.ceil(this.s.teams.length * 1.5) + 2;
		this.s.freeAgents = [];
		for (let i = 0; i < rookies; i++) {
			this.s.freeAgents.push(this.newFreeAgent(generateFighter(this.rng, this.nextId(), 20, 24), null));
		}
		this.resetReady();
		this.botsTakeTurns();
	}

	private decideContract(team: TeamState, fighterId: number, decision: Decision): boolean {
		if (this.s.phase.kind !== 'offseason' || team.ready) return false;
		const contract = team.expiring.find((c) => c.fighter.id === fighterId);
		if (!contract || contract.decision === decision) return false;
		if (decision === 'keep' && contract.ask > team.money) return false;
		if (contract.decision === 'keep') team.money += contract.ask;
		if (decision === 'keep') team.money -= contract.ask;
		contract.decision = decision;
		return true;
	}

	private decideRepair(team: TeamState, equipmentId: number, decision: Decision): boolean {
		if (this.s.phase.kind !== 'offseason' || team.ready) return false;
		const repair = team.repairs.find((r) => r.equipment.id === equipmentId);
		if (!repair || repair.decision === decision) return false;
		if (decision === 'keep' && repair.price > team.money) return false;
		if (repair.decision === 'keep') team.money += repair.price;
		if (decision === 'keep') team.money -= repair.price;
		repair.decision = decision;
		return true;
	}

	private finishOffseason(): void {
		for (const team of this.s.teams) {
			for (const c of team.expiring) {
				if (c.decision === 'keep') {
					c.fighter.contractYears = RESIGN_CONTRACT_YEARS;
					team.fighters.push(c.fighter);
				} else {
					this.s.freeAgents.push(this.newFreeAgent(c.fighter, team.id));
				}
			}
			for (const r of team.repairs) {
				if (r.decision === 'keep') {
					r.equipment.yearsLeft = REPAIR_YEARS;
					r.equipment.timesRepaired++;
					team.equipment.push(r.equipment);
				}
			}
			team.expiring = [];
			team.repairs = [];
		}
		// teams can join during the offseason, so the count may be odd again
		this.evenOutTeams();
		this.startFreeAgency();
	}

	// ---- free agency ----

	private startFreeAgency(): void {
		for (const agent of this.s.freeAgents) {
			const first = Math.max(5, Math.round(contractWorth(agent.fighter) * 1.3 + this.rng.int(-4, 4)));
			agent.prices = [first, Math.max(3, Math.round(first * 0.7)), Math.max(2, Math.round(first * 0.5))];
			agent.fighter.contractYears = 0;
		}
		this.s.freeAgents.sort((a, b) => b.prices[0] - a.prices[0]);
		this.s.phase = { kind: 'freeAgency', day: 1 };
		this.resetReady();
		this.botsTakeTurns();
	}

	private sign(team: TeamState, fighterId: number, byBot = false): boolean {
		const phase = this.s.phase;
		if (phase.kind !== 'freeAgency' || (team.ready && !byBot)) return false;
		const agent = this.s.freeAgents.find((a) => a.fighter.id === fighterId);
		if (!agent || agent.signedBy !== null) return false;
		const price = agent.prices[phase.day - 1];
		if (price > team.money) return false;
		agent.signedBy = team.id;
		agent.signedPrice = price;
		agent.fighter.contractYears = FA_CONTRACT_YEARS;
		team.fighters.push(agent.fighter);
		team.money -= price;
		return true;
	}

	private finishFreeAgencyDay(): void {
		const phase = this.s.phase;
		if (phase.kind !== 'freeAgency') return;
		// bots shop at the end of the day, in a random order
		for (const team of this.rng.shuffle(this.s.teams.filter((t) => t.controller === 'bot'))) {
			for (const agent of chooseSignings(team, this.s.freeAgents, phase.day, FA_DAYS)) {
				this.sign(team, agent.fighter.id, true);
			}
		}
		if (phase.day < FA_DAYS) {
			this.s.phase = { kind: 'freeAgency', day: phase.day + 1 };
			this.resetReady();
			this.botsTakeTurns();
			return;
		}
		// anyone unsigned after the last day leaves the league
		this.s.freeAgents = [];
		this.startTraining();
	}

	// ---- training ----

	private startTraining(): void {
		this.s.phase = { kind: 'training' };
		for (const team of this.s.teams) {
			team.shop = generateShop(this.rng, () => this.nextId());
			team.training = {};
		}
		this.resetReady();
		this.botsTakeTurns();
	}

	private buy(team: TeamState, itemId: number, bought: boolean): boolean {
		if (this.s.phase.kind !== 'training' || team.ready) return false;
		const item = team.shop.find((s) => s.id === itemId);
		if (!item || item.bought === bought) return false;
		if (bought && item.price > team.money) return false;
		item.bought = bought;
		team.money += bought ? -item.price : item.price;
		if (!bought) {
			// nobody can attune to something that's no longer coming
			const stillOwned = new Set([...team.equipment.map((e) => e.key), ...team.shop.filter((s) => s.bought).map((s) => s.key)]);
			for (const [id, plan] of Object.entries(team.training)) {
				if (plan?.kind === 'attune' && !stillOwned.has(plan.key)) team.training[Number(id)] = null;
			}
		}
		return true;
	}

	private setTraining(team: TeamState, fighterId: number, plan: TrainingPlan | null): boolean {
		if (this.s.phase.kind !== 'training' || team.ready) return false;
		const fighter = team.fighters.find((f) => f.id === fighterId);
		if (!fighter) return false;
		if (plan?.kind === 'stat' && fighter.stats[plan.stat] >= MAX_STAT) return false;
		if (plan?.kind === 'attune') {
			const owned = [...team.equipment.map((e) => e.key), ...team.shop.filter((s) => s.bought).map((s) => s.key)];
			if (!owned.includes(plan.key) || fighter.attunements.includes(plan.key)) return false;
		}
		team.training[fighterId] = plan;
		return true;
	}

	private finishTraining(): void {
		for (const team of this.s.teams) {
			for (const item of team.shop.filter((s) => s.bought)) {
				team.equipment.push({ id: item.id, key: item.key, yearsLeft: NEW_EQUIPMENT_YEARS, yearsOwned: 0, timesRepaired: 0 });
			}
			// fighters without a plan get the bots' suggestion
			chooseTraining(team);
			for (const f of team.fighters) {
				f.prevStats = { ...f.stats };
				const plan = team.training[f.id];
				if (plan?.kind === 'stat') f.stats[plan.stat] = Math.min(f.stats[plan.stat] + 1, MAX_STAT);
				else if (plan?.kind === 'attune' && !f.attunements.includes(plan.key)) f.attunements.push(plan.key);
				this.develop(f);
			}
			if (team.fighters.length === 0) team.fighters.push(concernedOwner(this.nextId()));
			team.shop = [];
			team.training = {};
			team.lineup = sanitizeLineup(team.fighters, team.equipment, team.lineup);
		}
		this.startRegularSeason();
	}

	/** Random development that favors the young. */
	private develop(f: Fighter): void {
		for (const stat of STAT_NAMES) {
			if (this.rng.real() >= 0.5) continue;
			let change = (2 / 3) * (this.rng.real() + this.rng.real() + this.rng.real() - 1.5);
			if (f.age <= 23 || f.age >= 33) change *= 2;
			change += (25 - f.age) / 12;
			f.stats[stat] = Math.min(Math.max(f.stats[stat] + Math.round(change), 0), MAX_STAT);
		}
	}

	// ---- the regular season and playoffs ----

	private startRegularSeason(): void {
		this.scheduleRegularSeason();
		this.s.bracket = null;
		this.s.phase = { kind: 'regularSeason', week: 0 };
		this.startRound();
	}

	/** Round-robin by the circle method, cut short after a few weeks. */
	private scheduleRegularSeason(): void {
		const teams = this.rng.shuffle(this.s.teams.map((t) => t.id));
		const weeks = regularSeasonWeeks(teams.length);
		const n = teams.length;
		for (let week = 0; week < weeks; week++) {
			for (let i = 0; i < n / 2; i++) {
				const a = teams[i];
				const b = teams[n - 1 - i];
				// alternate sides so nobody is always listed first
				const [x, y] = (week + i) % 2 === 0 ? [a, b] : [b, a];
				this.s.matches.push({ id: this.nextId(), season: this.s.season, week, round: null, a: x, b: y, result: null });
			}
			// rotate everyone but the first team
			teams.splice(1, 0, teams.pop()!);
		}
	}

	private currentRoundMatches(): Match[] {
		const phase = this.s.phase;
		if (phase.kind === 'regularSeason') {
			return this.s.matches.filter((m) => m.season === this.s.season && m.week === phase.week);
		}
		if (phase.kind === 'playoffs') {
			return this.s.matches.filter((m) => m.season === this.s.season && m.round === phase.round);
		}
		return [];
	}

	private currentMatchFor(team: TeamId): Match | undefined {
		return this.currentRoundMatches().find((m) => m.a === team || m.b === team);
	}

	private startRound(): void {
		const matches = this.currentRoundMatches();
		for (const team of this.s.teams) {
			team.lineup = sanitizeLineup(team.fighters, team.equipment, team.lineup);
			// teams without a fight this round have nothing to do
			team.ready = !matches.some((m) => m.a === team.id || m.b === team.id);
		}
		this.botsTakeTurns();
		this.checkRoundComplete();
	}

	private playMatchIfReady(match: Match): void {
		if (match.result) return;
		const a = this.team(match.a);
		const b = this.team(match.b);
		if (!a || !b || !a.ready || !b.ready) return;
		this.playMatch(match, a, b);
	}

	private playMatch(match: Match, a: TeamState, b: TeamState): void {
		const combatants: Combatant[] = [];
		for (const team of [a, b]) {
			const keyOf = new Map(team.equipment.map((e) => [e.id, e.key]));
			const lineup = sanitizeLineup(team.fighters, team.equipment, team.lineup);
			for (const fighter of team.fighters) {
				combatants.push({ fighter, equipment: (lineup[fighter.id] ?? []).map((id) => keyOf.get(id)!), team: team.id });
			}
		}
		const outcome = simulateFight(this.rng, combatants, true);
		match.result = {
			winner: outcome.winner,
			standingA: outcome.standing.get(a.id) ?? 0,
			standingB: outcome.standing.get(b.id) ?? 0
		};
		this.fightLogs.set(match.id, { matchId: match.id, ticks: outcome.ticks });

		const playoffs = match.round !== null;
		// one line per fighter per match, so viewers can leave out fights they haven't seen yet
		for (const f of outcome.fighters) {
			this.s.statLines.push({
				fighterId: f.fighterId,
				name: f.name,
				team: f.team,
				season: this.s.season,
				matchId: match.id,
				playoffs,
				fights: 1,
				prevailed: f.standing ? 1 : 0,
				kos: f.kos,
				kod: f.kod,
				dmgDealt: f.dmgDealt,
				dmgTaken: f.dmgTaken
			} satisfies StatLine);
		}
	}

	/** Once every fight this round is done, move to the next week or playoff round. */
	private checkRoundComplete(forced = false): void {
		const matches = this.currentRoundMatches();
		if (matches.length === 0 || matches.some((m) => !m.result)) return;
		// with nobody left in the league, wait for the host instead of simulating seasons forever
		if (!forced && this.humanTeams().length === 0) return;
		const phase = this.s.phase;
		if (phase.kind === 'regularSeason') {
			if (phase.week + 1 < regularSeasonWeeks(this.s.teams.length)) {
				this.s.phase = { kind: 'regularSeason', week: phase.week + 1 };
				this.startRound();
			} else {
				this.startPlayoffs();
			}
		} else if (phase.kind === 'playoffs') {
			this.advanceBracket(phase.round);
		}
	}

	private startPlayoffs(): void {
		const standings = computeStandings(
			this.s.matches,
			this.s.season,
			this.s.teams.map((t) => t.id)
		);
		const size = Math.min(playoffSize(this.s.teams.length), standings.length);
		const bracketSize = 2 ** playoffRoundCount(size);
		// bracket order keeps the top seeds apart until the end: 1v4, 2v3 / 1v8, 4v5, 2v7, 3v6.
		// Seeds past the playoff size are byes, so with 6 teams the top two skip the first round.
		let order = [1, 2];
		while (order.length < bracketSize) {
			const total = order.length * 2 + 1;
			order = order.flatMap((seed) => [seed, total - seed]);
		}
		const slot = (seed: number) =>
			seed <= size ? { team: standings[seed - 1].team, seed } : { team: null, seed: null };
		const rounds: PlayoffPairing[][] = [];
		const first: PlayoffPairing[] = [];
		for (let i = 0; i < order.length; i += 2) {
			const a = slot(order[i]);
			const b = slot(order[i + 1]);
			const bye = b.team === null;
			first.push({ a, b, matchId: null, winner: bye ? a.team : null, ...(bye ? { bye: true } : {}) });
		}
		rounds.push(first);
		for (let count = first.length / 2; count >= 1; count /= 2) {
			rounds.push(
				Array.from({ length: count }, () => ({
					a: { team: null, seed: null },
					b: { team: null, seed: null },
					matchId: null,
					winner: null
				}))
			);
		}
		this.s.bracket = { rounds };
		this.startPlayoffRound(0);
	}

	private startPlayoffRound(round: number): void {
		const bracket = this.s.bracket!;
		for (const pairing of bracket.rounds[round]) {
			if (pairing.bye) continue;
			const match: Match = {
				id: this.nextId(),
				season: this.s.season,
				week: null,
				round,
				a: pairing.a.team!,
				b: pairing.b.team!,
				result: null
			};
			pairing.matchId = match.id;
			this.s.matches.push(match);
		}
		this.s.phase = { kind: 'playoffs', round };
		this.startRound();
	}

	private advanceBracket(round: number): void {
		const bracket = this.s.bracket!;
		const pairings = bracket.rounds[round];
		for (const pairing of pairings) {
			if (pairing.bye) continue;
			const match = this.s.matches.find((m) => m.id === pairing.matchId);
			pairing.winner = match?.result?.winner ?? null;
		}
		if (round + 1 >= bracket.rounds.length) {
			this.finishSeason(pairings[0].winner);
			return;
		}
		const next = bracket.rounds[round + 1];
		pairings.forEach((pairing, i) => {
			const winnerSlot = pairing.winner === pairing.a.team ? pairing.a : pairing.b;
			const target = next[Math.floor(i / 2)];
			if (i % 2 === 0) target.a = { ...winnerSlot };
			else target.b = { ...winnerSlot };
		});
		this.startPlayoffRound(round + 1);
	}

	private finishSeason(champion: TeamId | null): void {
		if (champion !== null) {
			const team = this.team(champion);
			if (team) team.titles++;
		}
		this.s.seasons.push({
			season: this.s.season,
			standings: computeStandings(
				this.s.matches,
				this.s.season,
				this.s.teams.map((t) => t.id)
			),
			bracket: this.s.bracket as Bracket,
			champion
		});
		this.s.phase = { kind: 'seasonOver' };
		this.resetReady();
		this.botsTakeTurns();
	}

	// ---- lineups ----

	private equip(team: TeamState, equipmentId: number, fighterId: number | null): boolean {
		const phase = this.s.phase.kind;
		if (phase !== 'regularSeason' && phase !== 'playoffs') return false;
		if (team.ready) return false;
		const item = team.equipment.find((e) => e.id === equipmentId);
		if (!item) return false;
		if (fighterId !== null && !team.fighters.some((f) => f.id === fighterId)) return false;
		const lineup: Record<number, number[]> = {};
		for (const f of team.fighters) lineup[f.id] = (team.lineup[f.id] ?? []).filter((id) => id !== equipmentId);
		if (fighterId !== null) {
			const keys = lineup[fighterId].map((id) => team.equipment.find((e) => e.id === id)?.key ?? '');
			if (!canWearTogether([...keys, item.key])) return false;
			lineup[fighterId].push(equipmentId);
		}
		team.lineup = lineup;
		return true;
	}

	// ---- history ----

	/**
	 * Once a season is over, its per-match detail is only needed in aggregate: box scores roll
	 * up to one line per fighter, team and season half, and matches and replays are dropped
	 * (the standings and bracket live on in the season's record).
	 */
	private rollUpSeason(): void {
		const totals = new Map<string, StatTotal>();
		for (const l of this.s.statLines) {
			const key = `${l.fighterId}:${l.team}:${l.playoffs}`;
			let t = totals.get(key);
			if (!t) {
				t = { ...emptyTotals(), fighterId: l.fighterId, name: l.name, team: l.team, season: l.season, playoffs: l.playoffs };
				totals.set(key, t);
			}
			addTotals(t, l);
		}
		this.s.seasonStats.push(...totals.values());
		this.s.statLines = [];
		this.s.matches = [];
		this.s.bracket = null;
		this.fightLogs.clear();
		this.historyVersion++;
	}

	private buildHistory(): LeagueHistory {
		const careers = new Map<number, Career & { lastSeason: number; seasonSet: Set<number> }>();
		for (const t of this.s.seasonStats) {
			let c = careers.get(t.fighterId);
			if (!c) {
				c = {
					fighterId: t.fighterId,
					name: t.name,
					team: t.team,
					seasons: 0,
					regularSeason: emptyTotals(),
					playoffs: emptyTotals(),
					lastSeason: 0,
					seasonSet: new Set()
				};
				careers.set(t.fighterId, c);
			}
			addTotals(t.playoffs ? c.playoffs : c.regularSeason, t);
			c.seasonSet.add(t.season);
			if (t.season >= c.lastSeason) {
				c.lastSeason = t.season;
				c.team = t.team;
			}
		}
		return {
			version: this.historyVersion,
			seasons: this.s.seasons.filter((s) => s.season < this.s.season),
			careers: [...careers.values()].map(({ lastSeason: _l, seasonSet, ...c }) => ({ ...c, seasons: seasonSet.size }))
		};
	}

	// ---- replays, export and import ----

	private sendFight(viewerId: number, matchId: number): void {
		const log = this.fightLogs.get(matchId);
		if (log) this.emitPrivate(viewerId, { type: 'fightLog', log });
		else this.emitPrivate(viewerId, { type: 'notice', message: 'That replay is no longer available.' });
	}

	/** The league as a file: the state, minus who's controlling teams, with season totals packed. */
	private exportLeague(): Omit<LeagueState, 'seasonStats'> & { seasonStats: PackedRows } {
		this.s.rng = [...this.rng.state];
		const copy = structuredClone(this.s);
		for (const team of copy.teams) team.controller = 'bot';
		return { ...copy, seasonStats: packTotals(copy.seasonStats) };
	}

	private importLeague(viewerId: number, raw: unknown): boolean {
		const parsed = leagueSchema.safeParse(raw);
		if (!parsed.success) {
			const issue = parsed.error.issues[0];
			this.emitPrivate(viewerId, {
				type: 'notice',
				message: `Couldn't import that league: ${issue.path.join('.')} ${issue.message}`
			});
			return false;
		}
		const league = parsed.data as LeagueState;
		const problem = checkLeague(league);
		if (problem) {
			this.emitPrivate(viewerId, { type: 'notice', message: `Couldn't import that league: ${problem}.` });
			return false;
		}
		// people keep the teams they had, if those teams are in the imported league
		const previous = new Map(this.s.teams.map((t) => [t.id, t.controller]));
		for (const team of league.teams) {
			const controller = previous.get(team.id);
			team.controller = controller ?? 'bot';
			if (team.controller === 'bot') team.ready = true;
		}
		this.s = league;
		this.rng = new Rng(league.rng);
		this.s.rng = this.rng.state;
		this.fightLogs.clear();
		this.historyVersion++;
		const phase = this.s.phase.kind;
		if (phase === 'regularSeason' || phase === 'playoffs') {
			for (const m of this.currentRoundMatches()) this.playMatchIfReady(m);
			this.checkRoundComplete();
		} else {
			this.maybeAdvance();
		}
		this.emitPrivate(viewerId, { type: 'notice', message: 'League imported.' });
		return true;
	}

	// ---- what each viewer sees ----

	viewpointOf(viewerId: number): MMViewpointWire {
		const mine = this.teamOf(viewerId);
		return {
			pov: viewerId,
			myTeam: mine?.id ?? null,
			season: this.s.season,
			phase: this.s.phase,
			teams: this.s.teams.map((t) => ({
				id: t.id,
				controller: t.controller === 'bot' ? 'bot' : 'human',
				isMine: t === mine,
				money: t.money,
				ready: t.ready,
				fighters: t.fighters,
				equipment: t.equipment,
				titles: t.titles,
				expiring: t.expiring,
				repairs: t.repairs
			})),
			freeAgents: this.s.freeAgents,
			matches: this.s.matches,
			bracket: this.s.bracket,
			stats: packStatLines(this.s.statLines),
			historyVersion: this.historyVersion,
			// lineups, shopping and training plans stay secret until the fight
			private: mine ? { lineup: mine.lineup, shop: mine.shop, training: mine.training } : null
		};
	}
}

function emptyTotals(): Totals {
	return { fights: 0, prevailed: 0, kos: 0, kod: 0, dmgDealt: 0, dmgTaken: 0 };
}

function addTotals(into: Totals, from: Totals): void {
	into.fights += from.fights;
	into.prevailed += from.prevailed;
	into.kos += from.kos;
	into.kod += from.kod;
	into.dmgDealt += from.dmgDealt;
	into.dmgTaken += from.dmgTaken;
}
