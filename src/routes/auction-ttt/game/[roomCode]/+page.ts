export function load({ params }: { params: { roomCode: string } }) {
	return { roomCode: params.roomCode.toUpperCase() };
}
