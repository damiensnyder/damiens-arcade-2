import { Side, oppositeSideOf } from '../types.js';
import type { AuctionTTTViewpoint, AuctionTTTEvent, Settings, Players, WinResult } from './types.js';

export class AuctionTTTState {
	// Core game state (mirrors server)
	gameStage = $state<'pregame' | 'nomination' | 'bidding' | 'postgame'>('pregame');
	settings = $state<Settings>({ startingMoney: 15, useTiebreaker: false });
	players = $state<Players>({
		[Side.X]: { controller: null, money: 0 },
		[Side.O]: { controller: null, money: 0 }
	});
	squares = $state<Side[][]>([
		[Side.None, Side.None, Side.None],
		[Side.None, Side.None, Side.None],
		[Side.None, Side.None, Side.None]
	]);
	startingPlayer = $state<Side>(Side.X);
	nominatingPlayer = $state<Side>(Side.X);
	biddingPlayer = $state<Side>(Side.O);
	nominatedSquare = $state<{ row: number; col: number } | null>(null);
	currentBid = $state<number>(0);
	winner = $state<WinResult | null>(null);

	// Local UI state (not from server)
	pendingNomination = $state<{ row: number; col: number } | null>(null);
	pendingBidAmount = $state<number>(0);

	// Timer display (client-estimated between server events)
	displayTimeTaken = $state<{ [Side.X]: number; [Side.O]: number }>({ [Side.X]: 0, [Side.O]: 0 });
	private lastTimerTick = 0;
	private timerInterval: ReturnType<typeof setInterval> | null = null;

	applyGamestate(viewpoint: AuctionTTTViewpoint): void {
		this.gameStage = viewpoint.gameStage;
		this.settings = viewpoint.settings;
		// Deep copy players to trigger reactivity
		this.players = {
			[Side.X]: { ...viewpoint.players[Side.X] },
			[Side.O]: { ...viewpoint.players[Side.O] }
		};

		if (viewpoint.gameStage === 'pregame') {
			this.squares = this.emptyBoard();
			this.nominatedSquare = null;
			this.winner = null;
		} else if (viewpoint.gameStage === 'nomination') {
			this.squares = viewpoint.squares.map((r) => [...r]);
			this.startingPlayer = viewpoint.startingPlayer as Side;
			this.nominatingPlayer = viewpoint.nominatingPlayer as Side;
			this.nominatedSquare = null;
		} else if (viewpoint.gameStage === 'bidding') {
			this.squares = viewpoint.squares.map((r) => [...r]);
			this.startingPlayer = viewpoint.startingPlayer as Side;
			this.nominatingPlayer = viewpoint.nominatingPlayer as Side;
			this.biddingPlayer = viewpoint.biddingPlayer as Side;
			this.nominatedSquare = viewpoint.nominatedSquare;
			this.currentBid = viewpoint.currentBid;
			this.pendingBidAmount = viewpoint.currentBid + 1;
		} else if (viewpoint.gameStage === 'postgame') {
			this.squares = viewpoint.squares.map((r) => [...r]);
			this.startingPlayer = viewpoint.startingPlayer as Side;
			this.winner = viewpoint.winner;
			this.nominatedSquare = null;
		}

		this.syncTimerDisplay();
		this.restartTimerIfNeeded();
	}

	handleEvent(event: AuctionTTTEvent): void {
		switch (event.type) {
			case 'join':
				this.players[event.side as Side.X | Side.O] = {
					...this.players[event.side as Side.X | Side.O],
					controller: event.controller
				};
				break;

			case 'leave':
				this.players[event.side as Side.X | Side.O] = {
					...this.players[event.side as Side.X | Side.O],
					controller: null
				};
				break;

			case 'changeSettings':
				this.settings = event.settings;
				break;

			case 'start':
				this.gameStage = 'nomination';
				this.startingPlayer = event.startingPlayer as Side;
				this.nominatingPlayer = event.startingPlayer as Side;
				this.squares = this.emptyBoard();
				this.players[Side.X] = { ...this.players[Side.X], money: this.settings.startingMoney, timeTaken: this.settings.useTiebreaker ? 0 : undefined };
				this.players[Side.O] = { ...this.players[Side.O], money: this.settings.startingMoney, timeTaken: this.settings.useTiebreaker ? 0 : undefined };
				this.winner = null;
				this.nominatedSquare = null;
				this.pendingNomination = null;
				this.syncTimerDisplay();
				this.restartTimerIfNeeded();
				break;

			case 'nominate':
				this.gameStage = 'bidding';
				this.nominatedSquare = { row: event.row, col: event.col };
				this.currentBid = event.startingBid;
				this.biddingPlayer = oppositeSideOf(this.nominatingPlayer as Side.X | Side.O);
				this.pendingBidAmount = event.startingBid + 1;
				this.pendingNomination = null;
				break;

			case 'bid':
				this.currentBid = event.amount;
				this.pendingBidAmount = event.amount + 1;
				this.biddingPlayer = oppositeSideOf(event.biddingPlayer as Side.X | Side.O);
				break;

			case 'pass':
				// Nothing to update; awardSquare follows immediately
				break;

			case 'awardSquare': {
				const newSquares = this.squares.map((r) => [...r]);
				newSquares[event.row][event.col] = event.side as Side;
				this.squares = newSquares;
				this.players[event.side as Side.X | Side.O] = {
					...this.players[event.side as Side.X | Side.O],
					money: this.players[event.side as Side.X | Side.O].money - event.cost
				};
				this.nominatingPlayer = event.nextNominatingPlayer as Side;
				this.nominatedSquare = null;
				this.gameStage = 'nomination';
				break;
			}

			case 'gameOver':
				this.gameStage = 'postgame';
				this.winner = { winningSide: event.winningSide as Side, start: event.start, end: event.end };
				this.nominatedSquare = null;
				this.stopTimer();
				break;

			case 'timing':
				this.players[Side.X] = { ...this.players[Side.X], timeTaken: event.timeTaken[Side.X] };
				this.players[Side.O] = { ...this.players[Side.O], timeTaken: event.timeTaken[Side.O] };
				this.syncTimerDisplay();
				break;
		}
	}

	private emptyBoard(): Side[][] {
		return [
			[Side.None, Side.None, Side.None],
			[Side.None, Side.None, Side.None],
			[Side.None, Side.None, Side.None]
		];
	}

	private syncTimerDisplay(): void {
		this.displayTimeTaken = {
			[Side.X]: this.players[Side.X].timeTaken ?? 0,
			[Side.O]: this.players[Side.O].timeTaken ?? 0
		};
		this.lastTimerTick = Date.now();
	}

	private restartTimerIfNeeded(): void {
		this.stopTimer();
		if (
			this.settings.useTiebreaker &&
			(this.gameStage === 'nomination' || this.gameStage === 'bidding')
		) {
			this.lastTimerTick = Date.now();
			this.timerInterval = setInterval(() => {
				const now = Date.now();
				const elapsed = now - this.lastTimerTick;
				this.lastTimerTick = now;
				const active = this.gameStage === 'bidding' ? this.biddingPlayer : this.nominatingPlayer;
				this.displayTimeTaken = {
					...this.displayTimeTaken,
					[active]: (this.displayTimeTaken[active as Side.X | Side.O] ?? 0) + elapsed
				};
			}, 1000);
		}
	}

	private stopTimer(): void {
		if (this.timerInterval !== null) {
			clearInterval(this.timerInterval);
			this.timerInterval = null;
		}
	}

	destroy(): void {
		this.stopTimer();
	}
}
