import type { PageServerLoad } from './$types';
import rollsByDay from '$lib/games/qless/rolls.json';

type RollEntry = { roll: string; legalWords: string[] };
type RollsByDay = Record<string, RollEntry[]>;

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Epoch: Jan 8, 2026 (Thursday) — the first day rolls were assigned.
// Week index counts 7-day periods from this anchor; each weekday's roll list
// is indexed by (weeksSinceEpoch % rolls[weekday].length), looping forever.
const EPOCH_MS = Date.UTC(2026, 0, 8);

function getRollForDate(date: Date): RollEntry {
	const dayName = DAYS[date.getUTCDay()];
	const rolls = (rollsByDay as RollsByDay)[dayName] ?? [];
	if (rolls.length === 0) {
		return { roll: 'rollnotfound', legalWords: [] };
	}
	const daysSinceEpoch = Math.floor((date.getTime() - EPOCH_MS) / 86_400_000);
	const weeksSinceEpoch = Math.floor(daysSinceEpoch / 7);
	// Use proper modulo to handle negative values (dates before epoch)
	const idx = ((weeksSinceEpoch % rolls.length) + rolls.length) % rolls.length;
	return rolls[idx];
}

export const load: PageServerLoad = () => {
	const today = new Date();
	const { roll, legalWords } = getRollForDate(today);
	return {
		roll,
		legalWords,
		dateStr: today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
	};
};
