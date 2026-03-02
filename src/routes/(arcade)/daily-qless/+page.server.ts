import type { PageServerLoad } from './$types';

type RollEntry = { roll: string; legalWords: string[] };

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Epoch: Jan 8, 2026 (Thursday) — the first day rolls were assigned.
// Week index counts 7-day periods from this anchor; each day's roll list
// is indexed by (weeksSinceEpoch % rolls[day].length), looping forever.
const EPOCH_MS = Date.UTC(2026, 0, 8);

// One import per file so Vite bundles them as separate lazy chunks.
// Only the current day's file is loaded at runtime.
const rollLoaders: Record<string, () => Promise<{ default: RollEntry[] }>> = {
	sunday:    () => import('$lib/games/qless/rolls-sunday.json'),
	monday:    () => import('$lib/games/qless/rolls-monday.json'),
	tuesday:   () => import('$lib/games/qless/rolls-tuesday.json'),
	wednesday: () => import('$lib/games/qless/rolls-wednesday.json'),
	thursday:  () => import('$lib/games/qless/rolls-thursday.json'),
	friday:    () => import('$lib/games/qless/rolls-friday.json'),
	saturday:  () => import('$lib/games/qless/rolls-saturday.json'),
};

function getRollForDate(rolls: RollEntry[], date: Date): RollEntry {
	if (rolls.length === 0) return { roll: 'rollnotfound', legalWords: [] };
	const daysSinceEpoch = Math.floor((date.getTime() - EPOCH_MS) / 86_400_000);
	const weeksSinceEpoch = Math.floor(daysSinceEpoch / 7);
	// Use proper modulo to handle negative values (dates before epoch)
	const idx = ((weeksSinceEpoch % rolls.length) + rolls.length) % rolls.length;
	return rolls[idx];
}

export const load: PageServerLoad = async () => {
	const today = new Date();
	const dayName = DAYS[today.getUTCDay()];
	const { default: rolls } = await rollLoaders[dayName]();
	const { roll, legalWords } = getRollForDate(rolls, today);
	return {
		roll,
		legalWords,
	};
};
