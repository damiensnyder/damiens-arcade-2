// Types shared by the Mayhem Manager server and client.

export type StatName = 'strength' | 'accuracy' | 'energy' | 'speed' | 'toughness';
export const STAT_NAMES: StatName[] = ['strength', 'accuracy', 'energy', 'speed', 'toughness'];
export type Stats = Record<StatName, number>;

export type Slot = 'head' | 'hand' | 'torso' | 'legs' | 'feet';

/** Index into TEAMS (the 16 fixed team identities). */
export type TeamId = number;

export interface Look {
	gender: 'M' | 'F' | 'A';
	hair: number; // 1–4
	face: number; // 1–2
	shirt: number; // 1–2
	skin: number; // index into SKIN_TONES
	hairColor: number; // index into HAIR_COLORS
}

export interface Fighter {
	id: number;
	name: string;
	age: number;
	stats: Stats;
	/** Stats before this season's training camp, to show what changed. */
	prevStats?: Stats;
	look: Look;
	/** Key into ABILITIES. */
	ability: string;
	/** Equipment catalog keys this fighter is attuned to. */
	attunements: string[];
	/** Seasons left on the contract, counting the current one. */
	contractYears: number;
	/** The stand-in a team gets when it has no fighters. */
	isOwner?: boolean;
}

export interface Equipment {
	id: number;
	/** Key into EQUIPMENT. */
	key: string;
	/** Seasons left before it needs repair, counting the current one. */
	yearsLeft: number;
	/** Seasons this team has owned it. */
	yearsOwned: number;
	/** How many times it's been repaired. Each repair costs more than the last. */
	timesRepaired: number;
}

export type Decision = 'pending' | 'keep' | 'drop';

export interface ExpiringContract {
	fighter: Fighter;
	ask: number;
	decision: Decision;
}

export interface RepairItem {
	equipment: Equipment;
	price: number;
	decision: Decision;
}

export interface ShopItem {
	id: number;
	key: string;
	price: number;
	bought: boolean;
}

export type TrainingPlan = { kind: 'stat'; stat: StatName } | { kind: 'attune'; key: string };

/**
 * A fighter without a team. Between free agencies these are the unsigned ones who might be
 * offered again next season, plus (in the offseason) this season's rookies.
 */
export interface FreeAgent {
	fighter: Fighter;
	/** Asking price on each day of free agency. Empty outside free agency. */
	prices: number[];
	/** Most recent team, if they've ever had one. */
	formerTeam: TeamId | null;
	/** New to the league this season. */
	rookie: boolean;
	signedBy: TeamId | null;
	signedPrice: number | null;
}

export type Phase =
	| { kind: 'pregame' }
	| { kind: 'offseason' }
	| { kind: 'freeAgency'; day: number } // 1-based
	| { kind: 'training' }
	| { kind: 'regularSeason'; week: number } // 0-based
	| { kind: 'playoffs'; round: number } // 0-based
	| { kind: 'seasonOver' };

export interface MatchResult {
	winner: TeamId;
	/** Fighters still standing at the end, for teams a and b. */
	standingA: number;
	standingB: number;
}

export interface Match {
	id: number;
	season: number;
	/** 0-based week for regular-season matches, null for playoffs. */
	week: number | null;
	/** 0-based round for playoff matches, null for the regular season. */
	round: number | null;
	a: TeamId;
	b: TeamId;
	result: MatchResult | null;
}

export interface PlayoffSlot {
	team: TeamId | null;
	seed: number | null;
}

export interface PlayoffPairing {
	a: PlayoffSlot;
	b: PlayoffSlot;
	matchId: number | null;
	winner: TeamId | null;
	/** Team a advances without a fight. */
	bye?: boolean;
}

export interface Bracket {
	rounds: PlayoffPairing[][];
}

export interface StandingRow {
	team: TeamId;
	wins: number;
	losses: number;
	/** Own fighters still standing at the end of fights ("prevailed for"). */
	pf: number;
	/** Opponents' fighters still standing ("prevailed against"). */
	pa: number;
}

export interface SeasonRecord {
	season: number;
	standings: StandingRow[];
	bracket: Bracket;
	champion: TeamId | null;
}

export interface StatLine {
	fighterId: number;
	name: string;
	team: TeamId;
	season: number;
	matchId: number;
	playoffs: boolean;
	fights: number;
	prevailed: number;
	kos: number;
	kod: number;
	dmgDealt: number;
	dmgTaken: number;
}

export interface TeamView {
	id: TeamId;
	controller: 'human' | 'bot';
	isMine: boolean;
	money: number;
	ready: boolean;
	fighters: Fighter[];
	equipment: Equipment[];
	titles: number;
	expiring: ExpiringContract[];
	repairs: RepairItem[];
}

/** State only the team's own controller can see. */
export interface MyTeamPrivate {
	/** Fighter ID → equipment IDs. */
	lineup: Record<number, number[]>;
	shop: ShopItem[];
	training: Record<number, TrainingPlan | null>;
}

/** Totals for one fighter, on one team, in one season's regular season or playoffs. */
export type StatTotal = Omit<StatLine, 'matchId'>;

export interface Totals {
	fights: number;
	prevailed: number;
	kos: number;
	kod: number;
	dmgDealt: number;
	dmgTaken: number;
}

/** A fighter's totals over every finished season. */
export interface Career {
	fighterId: number;
	name: string;
	/** The team they played for most recently. */
	team: TeamId;
	seasons: number;
	regularSeason: Totals;
	playoffs: Totals;
}

/** Everything about finished seasons. Sent only when asked for, since it grows every season. */
export interface LeagueHistory {
	/** Changes whenever a season is rolled into history (or a league is imported). */
	version: number;
	seasons: SeasonRecord[];
	careers: Career[];
}

// ---- compact wire formats (see wire.ts) ----

/** Rows of numbers instead of objects, plus each fighter's name once. */
export interface PackedRows {
	names: Record<number, string>;
	rows: number[][];
}

export interface LeagueHistoryWire {
	version: number;
	seasons: { season: number; standings: number[][]; bracket: Bracket; champion: TeamId | null }[];
	careers: PackedRows;
}

/** What the server sends; the client unpacks `stats` into `statLines`. */
export type MMViewpointWire = Omit<MMViewpoint, 'statLines'> & { stats: PackedRows };

export interface MMViewpoint {
	pov: number;
	myTeam: TeamId | null;
	season: number;
	phase: Phase;
	teams: TeamView[];
	freeAgents: FreeAgent[];
	/** This season's matches only; earlier seasons are in the league history. */
	matches: Match[];
	bracket: Bracket | null;
	/** This season's box scores, one line per fighter per match. */
	statLines: StatLine[];
	/** Compare with a cached LeagueHistory to know when to ask for a new one. */
	historyVersion: number;
	private: MyTeamPrivate | null;
}

// ---- Fight replays ----

export type Tint = [number, number, number, number];

export interface FighterVisual {
	name: string;
	fighterId: number;
	team: TeamId;
	look: Look;
	/** Equipment catalog keys currently worn. */
	equipment: string[];
	stats: Stats;
	hp: number;
	x: number;
	y: number;
	facing: number;
	rotation: number;
	tint: Tint;
	flash: number;
}

export type FightEvent =
	| { type: 'spawn'; fighter: FighterVisual }
	| { type: 'animation'; fighter: number; updates: Partial<FighterVisual> }
	| { type: 'projectile'; fighter: number; target: number; img: string }
	| { type: 'text'; fighter: number; text: string; color?: string }
	| { type: 'particle'; fighter: number; img: string };

export interface FightLog {
	matchId: number;
	ticks: FightEvent[][];
}

/** Sent only to the viewer who asked for it. */
export type MMPrivateEvent =
	| { type: 'fightLog'; log: FightLog }
	| { type: 'leagueExport'; league: unknown }
	| { type: 'notice'; message: string }
	| { type: 'history'; history: LeagueHistoryWire }
	| { type: 'seasonStats'; version: number; season: number; totals: PackedRows };
