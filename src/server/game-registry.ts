import type { GameLogicHandler } from './game-logic-base.js';
import AuctionTTT from './games/auction-ttt.js';

export const gameRegistry: Record<string, new () => GameLogicHandler> = {
	'auction-ttt': AuctionTTT
};
