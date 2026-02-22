export enum Side {
	X = 'X',
	O = 'O',
	None = 'None'
}

export function oppositeSideOf(side: Side.X | Side.O): Side.X | Side.O {
	return side === Side.X ? Side.O : Side.X;
}
