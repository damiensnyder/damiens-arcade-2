import { WebSocketServer } from 'ws';
import type { Server } from 'http';
import * as rooms from './rooms.js';
import { gameRegistry } from './game-registry.js';

export function setupWebSocket(server: Server): void {
	const wss = new WebSocketServer({ server, path: '/ws' });

	wss.on('connection', (ws) => {
		let joined: { roomCode: string; viewerId: number } | null = null;

		ws.on('message', (data) => {
			let msg: unknown;
			try {
				msg = JSON.parse(data.toString());
			} catch {
				return;
			}

			if (!msg || typeof msg !== 'object' || !('type' in msg)) return;
			const fields = msg as Record<string, unknown>;

			if (fields.type === 'createRoom') {
				const LogicClass = gameRegistry[fields.gameType as string];
				if (!LogicClass) {
					ws.send(JSON.stringify({ type: 'error', message: 'Unknown game type' }));
					return;
				}
				const code = rooms.createRoom(fields.gameType as string, new LogicClass());
				ws.send(JSON.stringify({ type: 'roomCreated', roomCode: code }));
			} else if (fields.type === 'joinRoom') {
				const code = typeof fields.roomCode === 'string' ? fields.roomCode.toUpperCase() : '';
				const clientId =
					typeof fields.clientId === 'string' && fields.clientId.length > 0 && fields.clientId.length <= 64
						? fields.clientId
						: null;
				if (joined) {
					rooms.leaveRoom(joined.roomCode, joined.viewerId, ws);
					joined = null;
				}
				const viewerId = code ? rooms.joinRoom(code, clientId, ws) : null;
				if (viewerId === null) {
					ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
					return;
				}
				joined = { roomCode: code, viewerId };
				rooms.sendWelcome(code, viewerId, ws);
			} else if (fields.type === 'action' && joined) {
				rooms.handleAction(joined.roomCode, joined.viewerId, fields.payload);
			}
		});

		ws.on('close', () => {
			if (joined) rooms.leaveRoom(joined.roomCode, joined.viewerId, ws);
		});
	});
}
