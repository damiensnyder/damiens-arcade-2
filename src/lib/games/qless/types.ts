export interface WordInGrid {
	word: string;
	starts: [number, number];
	down: boolean;
}

export interface Badge {
	name: string;
	icon: string;
	description: string;
}

export interface RollEntry {
	roll: string;
	legalWords: string[];
}
