import type { Badge, WordInGrid } from './types.js';

export const ROWS = 11;
export const COLS = 12;

// Returns all horizontal and vertical word sequences of length >= 2 in the grid.
export function getAllWords(grid: string[][]): WordInGrid[] {
	const words: WordInGrid[] = [];

	// Horizontal words
	for (let x = 0; x < ROWS; x++) {
		let cur = '';
		for (let y = 0; y < COLS; y++) {
			if (grid[x][y] !== '') {
				cur += grid[x][y];
			} else {
				if (cur.length > 1) {
					words.push({ word: cur, starts: [x, y - cur.length], down: false });
				}
				cur = '';
			}
		}
		if (cur.length > 1) {
			words.push({ word: cur, starts: [x, COLS - cur.length], down: false });
		}
	}

	// Vertical words
	for (let y = 0; y < COLS; y++) {
		let cur = '';
		for (let x = 0; x < ROWS; x++) {
			if (grid[x][y] !== '') {
				cur += grid[x][y];
			} else {
				if (cur.length > 1) {
					words.push({ word: cur, starts: [x - cur.length, y], down: true });
				}
				cur = '';
			}
		}
		if (cur.length > 1) {
			words.push({ word: cur, starts: [ROWS - cur.length, y], down: true });
		}
	}

	return words;
}

export function gridIsLegal(
	legalWords: string[],
	words: WordInGrid[]
): { gridLegality: boolean[][]; illegalWordFound: boolean } {
	let illegalWordFound = false;
	const isLegal: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));

	for (const word of words) {
		if (legalWords.includes(word.word)) {
			if (word.down) {
				for (let x = 0; x < word.word.length; x++) {
					isLegal[x + word.starts[0]][word.starts[1]] = true;
				}
			} else {
				for (let y = 0; y < word.word.length; y++) {
					isLegal[word.starts[0]][y + word.starts[1]] = true;
				}
			}
		} else {
			illegalWordFound = true;
		}
	}

	return { gridLegality: isLegal, illegalWordFound };
}

// Returns true when all 12 letters form a single connected group.
// Bug fixed: was `y <= 12` (allowed out-of-bounds y=12), now `y < 12`.
export function gameIsWon(grid: string[][]): boolean {
	// Find first filled cell
	let firstX = 0;
	let firstY = 0;
	outer: for (let x = 0; x < ROWS; x++) {
		for (let y = 0; y < COLS; y++) {
			if (grid[x][y] !== '') {
				firstX = x;
				firstY = y;
				break outer;
			}
		}
	}

	// BFS to count connected filled cells
	const visited = new Set<number>();
	const key = (x: number, y: number) => x * COLS + y;
	const frontier: [number, number][] = [[firstX, firstY]];
	visited.add(key(firstX, firstY));

	while (frontier.length > 0) {
		const [x, y] = frontier.pop()!;
		for (const [nx, ny] of [
			[x + 1, y],
			[x - 1, y],
			[x, y + 1],
			[x, y - 1]
		] as [number, number][]) {
			if (nx >= 0 && nx < ROWS && ny >= 0 && ny < COLS && grid[nx][ny] !== '' && !visited.has(key(nx, ny))) {
				visited.add(key(nx, ny));
				frontier.push([nx, ny]);
			}
		}
	}

	return visited.size === 12;
}

export function getBadges(grid: string[][], words: WordInGrid[], solveTime: number): Badge[] {
	const badges: Badge[] = [];

	// Speed badges
	if (solveTime <= 30) {
		badges.push({ name: 'Ludicrous Speed', icon: '🤯', description: 'Won in under 30 seconds.' });
	} else if (solveTime <= 60) {
		badges.push({ name: 'Supersonic', icon: '✈️', description: 'Won in under 1 minute.' });
	} else if (solveTime <= 120) {
		badges.push({ name: 'Blazing Fast', icon: '🔥', description: 'Won in under 2 minutes.' });
	} else if (solveTime <= 180) {
		badges.push({ name: 'Fast', icon: '🏃', description: 'Won in under 3 minutes.' });
	}

	// Nuclear Family: 2x2 square of letters
	outer: for (let x = 0; x < ROWS - 1; x++) {
		for (let y = 0; y < COLS - 1; y++) {
			if (grid[x][y] !== '' && grid[x + 1][y] !== '' && grid[x][y + 1] !== '' && grid[x + 1][y + 1] !== '') {
				badges.push({ name: 'Nuclear Family', icon: '👨‍👩‍👧‍👦', description: 'Grid contains a 2x2 square of letters.' });
				break outer;
			}
		}
	}

	// Word count badges
	if (words.length === 2) {
		badges.push({ name: 'Perfect Pair', icon: '♊', description: 'Grid contains only 2 words.' });
	}
	if (words.length >= 6) {
		badges.push({ name: 'Like Sardines', icon: '🐟', description: 'Grid has 6 or more words.' });
	}

	// Long word badge
	if (words.some((w) => w.word.length >= 8)) {
		badges.push({ name: 'Sesquipedalian', icon: '🧠', description: 'Grid contains a word with 8 or more letters.' });
	}

	// Donut badge: flood fill empty cells (8-directional) from all perimeter cells.
	// Seeding from only (0,0) fails when corner cells are letters — visited stays 0,
	// falsely triggering the badge. Seeding from the full perimeter fixes this.
	// If fewer than all empty cells are reachable from outside, the letters enclose a region.
	{
		const visited = new Set<number>();
		const key = (x: number, y: number) => x * COLS + y;
		const frontier: [number, number][] = [];
		for (let x = 0; x < ROWS; x++) {
			for (let y = 0; y < COLS; y++) {
				if ((x === 0 || x === ROWS - 1 || y === 0 || y === COLS - 1) && grid[x][y] === '') {
					const k = key(x, y);
					if (!visited.has(k)) {
						visited.add(k);
						frontier.push([x, y]);
					}
				}
			}
		}

		while (frontier.length > 0) {
			const [x, y] = frontier.pop()!;
			for (const [nx, ny] of [
				[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1],
				[x + 1, y + 1], [x - 1, y + 1], [x + 1, y - 1], [x - 1, y - 1]
			] as [number, number][]) {
				if (nx >= 0 && nx < ROWS && ny >= 0 && ny < COLS && grid[nx][ny] === '' && !visited.has(key(nx, ny))) {
					visited.add(key(nx, ny));
					frontier.push([nx, ny]);
				}
			}
		}

		// Total cells = ROWS * COLS = 132; 12 are letters → 120 empty.
		// If fewer than 120 empty cells are reachable from (0,0), there's a hole.
		if (visited.size < ROWS * COLS - 12) {
			badges.push({ name: 'Donut', icon: '🍩', description: 'Grid contains a rectangle with a hole in the middle.' });
		}
	}

	// Symmetry badges.
	// Compute bounding box of all word positions (accounting for orientation).
	let top = ROWS - 1, bottom = 0, left = COLS - 1, right = 0;
	for (const word of words) {
		top    = Math.min(top,    word.starts[0]);
		left   = Math.min(left,   word.starts[1]);
		bottom = Math.max(bottom, word.down  ? word.starts[0] + word.word.length - 1 : word.starts[0]);
		right  = Math.max(right,  !word.down ? word.starts[1] + word.word.length - 1 : word.starts[1]);
	}
	const rowMid = (top + bottom) / 2;
	const colMid = (left + right) / 2;

	// Rotational symmetry (180°): for each word at (r, c), there must be a word at (2*rowMid-r, 2*colMid-c).
	const rotSym = words.every((word) => {
		const oppRow = 2 * rowMid - word.starts[0];
		const oppCol = 2 * colMid - word.starts[1];
		return words.some((w2) => w2.down === word.down && w2.starts[0] === oppRow && w2.starts[1] === oppCol);
	});

	// Horizontal-axis symmetry: same column, row reflected.
	const horizSym = words.every((word) => {
		const oppRow = 2 * rowMid - word.starts[0];
		return words.some((w2) => w2.down === word.down && w2.starts[0] === oppRow && w2.starts[1] === word.starts[1]);
	});

	// Vertical-axis symmetry: same row, column reflected.
	const vertSym = words.every((word) => {
		const oppCol = 2 * colMid - word.starts[1];
		return words.some((w2) => w2.down === word.down && w2.starts[0] === word.starts[0] && w2.starts[1] === oppCol);
	});

	if (rotSym || horizSym || vertSym) {
		badges.push({ name: 'Perfect Balance', icon: '☯️', description: 'Grid is symmetrical.' });
	}

	return badges;
}
