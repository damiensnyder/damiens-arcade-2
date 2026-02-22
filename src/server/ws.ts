import { WebSocketServer } from 'ws';
import type { Server } from 'http';
import * as rooms from './rooms.js';
import { gameRegistry } from './game-registry.js';

let viewerIdCounter = 0;

export function setupWebSocket(server: Server): void {
	const wss = new WebSocketServer({ server, path: '/ws' });

	wss.on('connection', (ws) => {
		const viewerId = ++viewerIdCounter;
		let roomCode: string | null = null;

		ws.on('message', (data) => {
			let msg: unknown;
			try {
				msg = JSON.parse(data.toString());
			} catch {
				return;
			}

			if (!msg || typeof msg !== 'object' || !('type' in msg)) return;
			const type = (msg as Record<string, unknown>).type;

			if (type === 'createRoom') {
				const gameType = (msg as Record<string, unknown>).gameType as string;
				const LogicClass = gameRegistry[gameType];
				if (!LogicClass) {
					ws.send(JSON.stringify({ type: 'error', message: 'Unknown game type' }));
					return;
				}
				const logic = new LogicClass();
				const code = rooms.createRoom(gameType, logic);
				ws.send(JSON.stringify({ type: 'roomCreated', roomCode: code }));
			} else if (type === 'joinRoom') {
				const code = ((msg as Record<string, unknown>).roomCode as string)?.toUpperCase();
				const room = code ? rooms.getRoom(code) : undefined;
				if (!room) {
					ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
					return;
				}
				roomCode = code;
				rooms.joinRoom(code, viewerId, ws);
				const updatedRoom = rooms.getRoom(code)!;
				ws.send(JSON.stringify({ type: 'roomJoined', viewerId, host: updatedRoom.host }));
				ws.send(JSON.stringify({ type: 'gamestate', payload: updatedRoom.logic.viewpointOf(viewerId) }));
			} else if (type === 'action' && roomCode) {
				rooms.handleAction(roomCode, viewerId, (msg as Record<string, unknown>).payload);
			}
		});

		ws.on('close', () => {
			if (roomCode) {
				rooms.leaveRoom(roomCode, viewerId);
			}
		});
	});
}
