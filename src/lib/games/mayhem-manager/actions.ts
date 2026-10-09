import { z } from 'zod';
import { MAX_TEAMS } from './rules.js';

const id = z.number().int().nonnegative();
const teamId = z.number().int().min(0).max(MAX_TEAMS - 1);
const decision = z.enum(['pending', 'keep', 'drop']);
const stat = z.enum(['strength', 'accuracy', 'energy', 'speed', 'toughness']);

export const trainingPlanSchema = z.union([
	z.object({ kind: z.literal('stat'), stat }),
	z.object({ kind: z.literal('attune'), key: z.string() })
]);

export const actionSchema = z.discriminatedUnion('type', [
	/** Take an unused team (before the first season or during the offseason). */
	z.object({ type: z.literal('join'), team: teamId }),
	/** Take over a team a bot is running. */
	z.object({ type: z.literal('replace'), team: teamId }),
	z.object({ type: z.literal('leave') }),
	z.object({ type: z.literal('addBot') }),
	z.object({ type: z.literal('removeBot'), team: teamId }),
	z.object({ type: z.literal('ready') }),
	z.object({ type: z.literal('unready') }),
	/** Host only: bots make picks for everyone who isn't ready. */
	z.object({ type: z.literal('forceReady') }),
	z.object({ type: z.literal('contract'), fighter: id, decision }),
	z.object({ type: z.literal('repair'), equipment: id, decision }),
	z.object({ type: z.literal('sign'), fighter: id }),
	z.object({ type: z.literal('buy'), item: id, bought: z.boolean() }),
	z.object({ type: z.literal('train'), fighter: id, plan: trainingPlanSchema.nullable() }),
	z.object({ type: z.literal('equip'), equipment: id, fighter: id.nullable() }),
	z.object({ type: z.literal('getFight'), match: id }),
	/** The finished seasons' records and career totals. */
	z.object({ type: z.literal('getHistory') }),
	/** Per-fighter totals for one finished season. */
	z.object({ type: z.literal('getSeasonStats'), season: z.number().int().min(1) }),
	z.object({ type: z.literal('exportLeague') }),
	z.object({ type: z.literal('importLeague'), league: z.unknown() })
]);

export type MMAction = z.infer<typeof actionSchema>;
