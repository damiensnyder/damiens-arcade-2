import { Side } from '../types.js';
import type { WinResult } from './types.js';

const WIN_LINES: [[number, number], [number, number], [number, number]][] = [
	// rows
	[[0, 0], [0, 1], [0, 2]],
	[[1, 0], [1, 1], [1, 2]],
	[[2, 0], [2, 1], [2, 2]],
	// cols
	[[0, 0], [1, 0], [2, 0]],
	[[0, 1], [1, 1], [2, 1]],
	[[0, 2], [1, 2], [2, 2]],
	// diagonals
	[[0, 0], [1, 1], [2, 2]],
	[[0, 2], [1, 1], [2, 0]]
];

export function winningSide(squares: Side[][]): WinResult {
	for (const [[r0, c0], [r1, c1], [r2, c2]] of WIN_LINES) {
		const s = squares[r0][c0];
		if (s !== Side.None && s === squares[r1][c1] && s === squares[r2][c2]) {
			return { winningSide: s, start: [r0, c0], end: [r2, c2] };
		}
	}
	return { winningSide: Side.None, start: [-1, -1], end: [-1, -1] };
}

export function formatTime(ms: number): string {
	const total = Math.floor(ms / 1000);
	const minutes = Math.floor(total / 60);
	const seconds = total % 60;
	return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
