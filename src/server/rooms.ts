import type WebSocket from 'ws';
import type { GameLogicHandler } from './game-logic-base.js';

const EMPTY_ROOM_TTL_MS = 5 * 60 * 1000; // 5 minutes

type Room = {
	code: string;
	gameType: string;
	logic: GameLogicHandler;
	viewers: Map<number, WebSocket>;
	host: number | null;
	cleanupTimeout: ReturnType<typeof setTimeout> | null;
};

const rooms = new Map<string, Room>();

function generateRoomCode(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	let code: string;
	do {
		code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
	} while (rooms.has(code));
	return code;
}

function broadcast(room: Room, message: object): void {
	const data = JSON.stringify(message);
	for (const ws of room.viewers.values()) {
		ws.send(data);
	}
}

export function createRoom(gameType: string, logic: GameLogicHandler): string {
	const code = generateRoomCode();
	const room: Room = { code, gameType, logic, viewers: new Map(), host: null, cleanupTimeout: null };
	logic.emitEvent = (event) => broadcast(room, { type: 'event', payload: event });
	rooms.set(code, room);
	return code;
}

export function getRoom(code: string): Room | undefined {
	return rooms.get(code);
}

export function joinRoom(code: string, viewerId: number, ws: WebSocket): boolean {
	const room = rooms.get(code);
	if (!room) return false;
	if (room.cleanupTimeout !== null) {
		clearTimeout(room.cleanupTimeout);
		room.cleanupTimeout = null;
	}
	room.viewers.set(viewerId, ws);
	if (room.host === null) room.host = viewerId;
	return true;
}

export function leaveRoom(code: string, viewerId: number): void {
	const room = rooms.get(code);
	if (!room) return;

	room.logic.handleDisconnect(viewerId);
	room.viewers.delete(viewerId);

	if (room.viewers.size === 0) {
		room.host = null;
		room.cleanupTimeout = setTimeout(() => rooms.delete(code), EMPTY_ROOM_TTL_MS);
		return;
	}

	if (room.host === viewerId) {
		const candidates = [...room.viewers.keys()];
		room.host = room.logic.getPreferredNewHost(candidates) ?? candidates[0];
		broadcast(room, { type: 'event', payload: { type: 'changeHost', host: room.host } });
	}
}

export function handleAction(code: string, viewerId: number, action: unknown): void {
	const room = rooms.get(code);
	if (!room) return;
	const isHost = room.host === viewerId;
	room.logic.handleAction(viewerId, action, isHost);
}
