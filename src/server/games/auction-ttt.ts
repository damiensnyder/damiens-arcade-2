import { z } from 'zod';
import { GameLogicHandler } from '../game-logic-base.js';
import { Side, oppositeSideOf } from '../../lib/games/types.js';
import { winningSide } from '../../lib/games/auction-ttt/utils.js';

type Settings = { startingMoney: number; useTiebreaker: boolean };
type PlayerState = { controller: number | null; money: number; timeTaken?: number };
type Players = { [Side.X]: PlayerState; [Side.O]: PlayerState };
type GameStage = 'pregame' | 'nomination' | 'bidding' | 'postgame';

// Action schemas
const joinSchema = z.object({ type: z.literal('join'), side: z.nativeEnum(Side).refine((s) => s !== Side.None) });
const leaveSchema = z.object({ type: z.literal('leave'), side: z.nativeEnum(Side).refine((s) => s !== Side.None) });
const changeSettingsSchema = z.object({
	type: z.literal('changeSettings'),
	settings: z.object({ startingMoney: z.number().int().min(0), useTiebreaker: z.boolean() })
});
const startSchema = z.object({ type: z.literal('start') });
const nominateSchema = z.object({
	type: z.literal('nominate'),
	row: z.number().int().min(0).max(2),
	col: z.number().int().min(0).max(2),
	startingBid: z.number().int().min(0)
});
const bidSchema = z.object({ type: z.literal('bid'), amount: z.number().int().min(0) });
const passSchema = z.object({ type: z.literal('pass') });

export default class AuctionTTT extends GameLogicHandler {
	private gameStage: GameStage = 'pregame';
	private settings: Settings = { startingMoney: 15, useTiebreaker: false };
	private players: Players = {
		[Side.X]: { controller: null, money: 0 },
		[Side.O]: { controller: null, money: 0 }
	};
	private squares: Side[][] = this.emptyBoard();
	private startingPlayer: Side = Side.X;
	private nominatingPlayer: Side = Side.X;
	private biddingPlayer: Side = Side.O;
	private nominatedSquare: { row: number; col: number } = { row: 0, col: 0 };
	private currentBid: number = 0;
	private winner: { winningSide: Side; start: [number, number]; end: [number, number] } | null = null;
	private turnStartTime: number = 0;

	private emptyBoard(): Side[][] {
		return [
			[Side.None, Side.None, Side.None],
			[Side.None, Side.None, Side.None],
			[Side.None, Side.None, Side.None]
		];
	}

	handleAction(viewerId: number, action: unknown, isHost: boolean): void {
		const xCtrl = this.players[Side.X].controller;
		const oCtrl = this.players[Side.O].controller;

		// JOIN — any stage, side must be uncontrolled
		const joinResult = joinSchema.safeParse(action);
		if (joinResult.success) {
			const { side } = joinResult.data;
			const target = this.players[side as Side.X | Side.O];
			if (target.controller === null) {
				target.controller = viewerId;
				this.emitEvent({ type: 'join', side, controller: viewerId });
			}
			return;
		}

		// LEAVE — any stage, must control that side
		const leaveResult = leaveSchema.safeParse(action);
		if (leaveResult.success) {
			const { side } = leaveResult.data;
			const target = this.players[side as Side.X | Side.O];
			if (target.controller === viewerId) {
				target.controller = null;
				this.emitEvent({ type: 'leave', side });
			}
			return;
		}

		// CHANGE SETTINGS — pregame or postgame, host only
		const settingsResult = changeSettingsSchema.safeParse(action);
		if (settingsResult.success && isHost && (this.gameStage === 'pregame' || this.gameStage === 'postgame')) {
			this.settings = settingsResult.data.settings;
			this.emitEvent({ type: 'changeSettings', settings: this.settings });
			return;
		}

		// START — pregame or postgame, host, both sides controlled
		const startResult = startSchema.safeParse(action);
		if (
			startResult.success &&
			isHost &&
			(this.gameStage === 'pregame' || this.gameStage === 'postgame') &&
			xCtrl !== null &&
			oCtrl !== null
		) {
			if (this.gameStage === 'postgame') {
				this.startingPlayer = oppositeSideOf(this.startingPlayer as Side.X | Side.O);
			}
			this.startGame();
			return;
		}

		// NOMINATE — nomination stage, nominating player's controller
		const nominateResult = nominateSchema.safeParse(action);
		if (
			nominateResult.success &&
			this.gameStage === 'nomination' &&
			this.players[this.nominatingPlayer as Side.X | Side.O].controller === viewerId &&
			this.squares[nominateResult.data.row][nominateResult.data.col] === Side.None &&
			nominateResult.data.startingBid <= this.players[this.nominatingPlayer as Side.X | Side.O].money
		) {
			const { row, col, startingBid } = nominateResult.data;
			this.nominatedSquare = { row, col };
			this.currentBid = startingBid;
			this.biddingPlayer = oppositeSideOf(this.nominatingPlayer as Side.X | Side.O);
			if (this.settings.useTiebreaker) this.updateTiming(this.nominatingPlayer as Side.X | Side.O);
			this.gameStage = 'bidding';
			this.emitEvent({ type: 'nominate', row, col, startingBid });

			// Auto-pass if opponent can't afford starting bid
			if (this.players[this.biddingPlayer].money <= startingBid) {
				this.awardSquare();
			}
			return;
		}

		// BID — bidding stage, bidding player's controller, valid amount
		const bidResult = bidSchema.safeParse(action);
		if (
			bidResult.success &&
			this.gameStage === 'bidding' &&
			this.players[this.biddingPlayer].controller === viewerId &&
			bidResult.data.amount > this.currentBid &&
			bidResult.data.amount <= this.players[this.biddingPlayer].money
		) {
			const { amount } = bidResult.data;
			if (this.settings.useTiebreaker) this.updateTiming(this.biddingPlayer);
			this.currentBid = amount;
			const prevBidder = this.biddingPlayer;
			this.biddingPlayer = oppositeSideOf(this.biddingPlayer);
			this.emitEvent({ type: 'bid', amount, biddingPlayer: prevBidder });

			// Auto-pass if opponent can't afford to outbid
			if (this.players[this.biddingPlayer].money <= amount) {
				this.awardSquare();
			}
			return;
		}

		// PASS — bidding stage, bidding player's controller
		const passResult = passSchema.safeParse(action);
		if (passResult.success && this.gameStage === 'bidding' && this.players[this.biddingPlayer].controller === viewerId) {
			this.emitEvent({ type: 'pass' });
			if (this.settings.useTiebreaker) this.updateTiming(this.biddingPlayer);
			this.awardSquare();
			return;
		}
	}

	handleDisconnect(viewerId: number): void {
		for (const side of [Side.X, Side.O] as const) {
			if (this.players[side].controller === viewerId) {
				this.players[side].controller = null;
				this.emitEvent({ type: 'leave', side });
			}
		}
	}

	private startGame(): void {
		this.nominatingPlayer = this.startingPlayer;
		this.gameStage = 'nomination';
		this.squares = this.emptyBoard();
		this.players[Side.X].money = this.settings.startingMoney;
		this.players[Side.O].money = this.settings.startingMoney;
		this.winner = null;

		if (this.settings.useTiebreaker) {
			this.players[Side.X].timeTaken = 0;
			this.players[Side.O].timeTaken = 0;
			this.turnStartTime = Date.now();
		} else {
			delete this.players[Side.X].timeTaken;
			delete this.players[Side.O].timeTaken;
		}

		this.emitEvent({ type: 'start', startingPlayer: this.startingPlayer });
	}

	private updateTiming(side: Side.X | Side.O): void {
		const elapsed = Math.round((Date.now() - this.turnStartTime) / 1000) * 1000;
		this.players[side].timeTaken = (this.players[side].timeTaken ?? 0) + elapsed;
		this.turnStartTime = Date.now();
		this.emitEvent({
			type: 'timing',
			timeTaken: { [Side.X]: this.players[Side.X].timeTaken ?? 0, [Side.O]: this.players[Side.O].timeTaken ?? 0 }
		});
	}

	private awardSquare(): void {
		// The winner is whoever is NOT the current biddingPlayer
		const winner = oppositeSideOf(this.biddingPlayer);
		const cost = this.currentBid;
		const { row, col } = this.nominatedSquare;

		this.squares[row][col] = winner;
		this.players[winner].money -= cost;
		const nextNominatingPlayer = oppositeSideOf(this.nominatingPlayer as Side.X | Side.O);

		this.emitEvent({ type: 'awardSquare', side: winner, row, col, cost, nextNominatingPlayer });

		if (this.checkGameOver()) return;

		this.nominatingPlayer = nextNominatingPlayer;
		this.gameStage = 'nomination';
	}

	private checkGameOver(): boolean {
		const result = winningSide(this.squares);
		const boardFull = this.squares.every((row) => row.every((s) => s !== Side.None));

		if (result.winningSide !== Side.None || boardFull) {
			let finalWinner = result;

			if (result.winningSide === Side.None && this.settings.useTiebreaker) {
				const xTime = this.players[Side.X].timeTaken ?? 0;
				const oTime = this.players[Side.O].timeTaken ?? 0;
				finalWinner = {
					winningSide: xTime <= oTime ? Side.X : Side.O,
					start: [-1, -1],
					end: [-1, -1]
				};
			}

			this.winner = finalWinner;
			this.gameStage = 'postgame';
			this.emitEvent({ type: 'gameOver', ...finalWinner });
			return true;
		}
		return false;
	}

	getPreferredNewHost(candidates: number[]): number | null {
		const controllers = [this.players[Side.X].controller, this.players[Side.O].controller];
		return candidates.find((id) => controllers.includes(id)) ?? null;
	}

	viewpointOf(_viewerId: number): unknown {
		const base = { settings: this.settings, players: this.players };

		if (this.gameStage === 'pregame') {
			return { gameStage: 'pregame', ...base };
		}

		// For active stages, include the current turn's elapsed time in the active
		// player's timeTaken so late-joining viewers show accurate timer values.
		const playersWithCurrentTurn = (): typeof this.players => {
			if (!this.settings.useTiebreaker) return this.players;
			const elapsed = Date.now() - this.turnStartTime;
			const active = this.gameStage === 'bidding' ? this.biddingPlayer : this.nominatingPlayer;
			return {
				...this.players,
				[active]: {
					...this.players[active as Side.X | Side.O],
					timeTaken: (this.players[active as Side.X | Side.O].timeTaken ?? 0) + elapsed
				}
			};
		};

		if (this.gameStage === 'nomination') {
			return {
				gameStage: 'nomination',
				settings: this.settings,
				players: playersWithCurrentTurn(),
				squares: this.squares,
				startingPlayer: this.startingPlayer,
				nominatingPlayer: this.nominatingPlayer
			};
		}

		if (this.gameStage === 'bidding') {
			return {
				gameStage: 'bidding',
				settings: this.settings,
				players: playersWithCurrentTurn(),
				squares: this.squares,
				startingPlayer: this.startingPlayer,
				nominatingPlayer: this.nominatingPlayer,
				biddingPlayer: this.biddingPlayer,
				nominatedSquare: this.nominatedSquare,
				currentBid: this.currentBid
			};
		}

		// postgame
		return {
			gameStage: 'postgame',
			...base,
			squares: this.squares,
			startingPlayer: this.startingPlayer,
			winner: this.winner
		};
	}
}
