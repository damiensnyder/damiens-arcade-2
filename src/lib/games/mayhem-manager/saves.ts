// Leagues saved in this browser, so a league outlives its room. Each league's file lives under its
// own key; a small index of summaries lets the main page list them without parsing every league.

import type { Phase, TeamId } from './types.js';

const INDEX_KEY = 'mm-leagues';
const LEAGUE_PREFIX = 'mm-league:';

export interface SaveSummary {
	/** The league's creation time, which identifies it. */
	createdAt: number;
	/** A name the player gave it, or null for the default (see saveName). */
	name: string | null;
	savedAt: number;
	season: number;
	phase: Phase['kind'];
	/** The saver's team, so loading the league can put them back on it. */
	myTeam: TeamId | null;
}

/** A league to load into the room being opened (set by the main page, used by the game page). */
export let pendingImport: { league: unknown; myTeam: TeamId | null } | null = null;

export function setPendingImport(value: typeof pendingImport): void {
	pendingImport = value;
}

export function saveName(save: SaveSummary): string {
	if (save.name) return save.name;
	const d = new Date(save.createdAt);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `League - ${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Saved leagues, most recently played first. */
export function listSaves(): SaveSummary[] {
	try {
		const index = JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]');
		if (!Array.isArray(index)) return [];
		return (index as SaveSummary[]).filter((s) => typeof s?.createdAt === 'number').sort((a, b) => b.savedAt - a.savedAt);
	} catch {
		return [];
	}
}

function writeIndex(index: SaveSummary[]): void {
	localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

export function loadSave(createdAt: number): unknown {
	try {
		const raw = localStorage.getItem(LEAGUE_PREFIX + createdAt);
		return raw === null ? null : JSON.parse(raw);
	} catch {
		return null;
	}
}

/**
 * Saves a league export. If the browser is out of room, deletes the least recently played leagues
 * that still have their default names (never the one being saved) until it fits. Returns whether
 * the league was saved.
 */
export function putSave(league: unknown, myTeam: TeamId | null): boolean {
	const l = league as { createdAt?: unknown; season: number; phase: Phase };
	if (typeof l?.createdAt !== 'number') return false;
	const createdAt = l.createdAt;
	const data = JSON.stringify(league);
	try {
		for (;;) {
			const index = listSaves();
			const existing = index.find((s) => s.createdAt === createdAt);
			const summary: SaveSummary = {
				createdAt,
				name: existing?.name ?? null,
				savedAt: Date.now(),
				season: l.season,
				phase: l.phase.kind,
				myTeam
			};
			try {
				localStorage.setItem(LEAGUE_PREFIX + createdAt, data);
				writeIndex([summary, ...index.filter((s) => s.createdAt !== createdAt)]);
				return true;
			} catch {
				const victim = index.filter((s) => s.createdAt !== createdAt && !s.name).at(-1);
				if (!victim) return false;
				deleteSave(victim.createdAt);
			}
		}
	} catch {
		return false;
	}
}

/** Renames a saved league; a blank name goes back to the default. */
export function renameSave(createdAt: number, name: string): void {
	try {
		const trimmed = name.trim().slice(0, 100);
		writeIndex(listSaves().map((s) => (s.createdAt === createdAt ? { ...s, name: trimmed || null } : s)));
	} catch {
		// nowhere to put it
	}
}

export function deleteSave(createdAt: number): void {
	try {
		localStorage.removeItem(LEAGUE_PREFIX + createdAt);
		writeIndex(listSaves().filter((s) => s.createdAt !== createdAt));
	} catch {
		// nothing we can do
	}
}
