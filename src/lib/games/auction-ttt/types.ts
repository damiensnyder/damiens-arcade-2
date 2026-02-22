import { Side } from '../types.js';

export type Settings = { startingMoney: number; useTiebreaker: boolean };

export type PlayerState = {
	controller: number | null;
	money: number;
	timeTaken?: number;
};

export type Players = { [Side.X]: PlayerState; [Side.O]: PlayerState };

export type WinResult = {
	winningSide: Side;
	start: [number, number];
	end: [number, number];
};

export type GameStage = 'pregame' | 'nomination' | 'bidding' | 'postgame';

// Viewpoints (server → client on connect/reconnect)
export type PregameViewpoint = {
	gameStage: 'pregame';
	settings: Settings;
	players: Players;
};

export type NominationViewpoint = {
	gameStage: 'nomination';
	settings: Settings;
	players: Players;
	squares: Side[][];
	startingPlayer: Side;
	nominatingPlayer: Side;
};

export type BiddingViewpoint = {
	gameStage: 'bidding';
	settings: Settings;
	players: Players;
	squares: Side[][];
	startingPlayer: Side;
	nominatingPlayer: Side;
	biddingPlayer: Side;
	nominatedSquare: { row: number; col: number };
	currentBid: number;
};

export type PostgameViewpoint = {
	gameStage: 'postgame';
	settings: Settings;
	players: Players;
	squares: Side[][];
	startingPlayer: Side;
	winner: WinResult;
};

export type AuctionTTTViewpoint =
	| PregameViewpoint
	| NominationViewpoint
	| BiddingViewpoint
	| PostgameViewpoint;

// Events (server → client incrementally)
export type AuctionTTTEvent =
	| { type: 'join'; side: Side; controller: number }
	| { type: 'leave'; side: Side }
	| { type: 'changeSettings'; settings: Settings }
	| { type: 'start'; startingPlayer: Side }
	| { type: 'nominate'; row: number; col: number; startingBid: number }
	| { type: 'bid'; amount: number; biddingPlayer: Side }
	| { type: 'pass' }
	| { type: 'awardSquare'; side: Side; row: number; col: number; cost: number; nextNominatingPlayer: Side }
	| { type: 'gameOver'; winningSide: Side; start: [number, number]; end: [number, number] }
	| { type: 'timing'; timeTaken: { [Side.X]: number; [Side.O]: number } }
	| { type: 'changeHost'; host: number };

// Actions (client → server)
export type AuctionTTTAction =
	| { type: 'join'; side: Side }
	| { type: 'leave'; side: Side }
	| { type: 'changeSettings'; settings: Settings }
	| { type: 'start' }
	| { type: 'nominate'; row: number; col: number; startingBid: number }
	| { type: 'bid'; amount: number }
	| { type: 'pass' };
