// Messages sent from client to server
export type ClientMessage =
	| { type: 'createRoom'; gameType: string }
	| { type: 'joinRoom'; roomCode: string }
	| { type: 'action'; payload: unknown };

// Messages sent from server to client
export type ServerMessage =
	| { type: 'roomCreated'; roomCode: string }
	| { type: 'roomJoined'; viewerId: number; host: number }
	| { type: 'gamestate'; payload: unknown }
	| { type: 'event'; payload: Record<string, unknown> }
	| { type: 'error'; message: string };
