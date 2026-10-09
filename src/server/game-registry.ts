import type { GameLogicHandler } from './game-logic-base.js';
import AuctionTTT from './games/auction-ttt.js';
import MayhemManager from './games/mayhem-manager/index.js';

export const gameRegistry: Record<string, new () => GameLogicHandler> = {
	'auction-ttt': AuctionTTT,
	'mayhem-manager': MayhemManager
};
