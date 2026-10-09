// How fighters are drawn. The base sprites are pure red, recolored with CSS filters.

import { EQUIPMENT, equipmentImg } from './catalog.js';
import type { Look, TeamId } from './types.js';
import { TEAMS } from './teams.js';

/** [brightness, saturate] applied after hue-rotate(25deg). */
export const SKIN_TONES: [number, number][] = [
	[0.3, 1], [0.5, 0.8], [1, 0.6], [1.5, 0.5], [2, 0.3], [3, 0.4], [5, 0.5], [7, 0.4], [8, 0.4], [10, 0.3]
];

/** [brightness, saturate] applied after hue-rotate(25deg). */
export const HAIR_COLORS: [number, number][] = [
	[0.1, 0], [0.1, 0.1], [0.2, 0.3], [0.4, 0.4], [0.5, 0.5], [0.5, 0.8], [0.8, 0.3], [2, 0.5], [4, 0.4], [5, 0.1]
];

/** [hue-rotate degrees, brightness, saturate] */
export type Kit = { shirt: [number, number, number]; shorts: [number, number, number] };

/** What free agents wear. */
export const FREE_AGENT_KIT: Kit = { shirt: [240, 2, 0.5], shorts: [0, 0, 1] };
const SHOES: [number, number, number] = [0, 0.8, 0.3];

function tone([b, s]: [number, number]): string {
	return `hue-rotate(25deg) brightness(${b}) saturate(${s})`;
}

function recolor([h, b, s]: [number, number, number]): string {
	return `hue-rotate(${h}deg) brightness(${b}) saturate(${s})`;
}

export interface SpriteLayer {
	src: string;
	filter: string;
	flip: boolean;
}

export function kitFor(team: TeamId | null): Kit {
	return team === null ? FREE_AGENT_KIT : TEAMS[team].kit;
}

/** The away team's colors when their usual shirts would look too much like the home team's. */
export function awayKit(home: TeamId, away: TeamId): Kit {
	// compare the colors the shirts are meant to look like, not the filter numbers
	const [r1, g1, b1] = hexToRgb(TEAMS[home].color1);
	const [r2, g2, b2] = hexToRgb(TEAMS[away].color1);
	const clash = Math.hypot(r1 - r2, g1 - g2, b1 - b2) < 90;
	const kit = TEAMS[away].kit;
	return clash ? { shirt: kit.shorts, shorts: kit.shirt } : kit;
}

function hexToRgb(hex: string): [number, number, number] {
	let h = hex.replace('#', '');
	if (h.length === 3) h = [...h].map((c) => c + c).join('');
	return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** Image layers, back to front, for a fighter wearing the given equipment keys. */
export function spriteLayers(look: Look, kit: Kit, equipment: string[] = []): SpriteLayer[] {
	const g = look.gender;
	const worn = (slot: string) => equipment.filter((k) => EQUIPMENT[k]?.slots.includes(slot as never));
	const head = worn('head');
	const torso = worn('torso');
	const hands = worn('hand');
	const legs = worn('legs');
	const feet = worn('feet');
	const layer = (src: string, filter = 'none', flip = false): SpriteLayer => ({ src, filter, flip });

	const layers: SpriteLayer[] = [
		layer(`/mm/base/body_${g}1.png`, tone(SKIN_TONES[look.skin] ?? SKIN_TONES[0])),
		layer(`/mm/base/face_${look.face}.png`),
		layer(`/mm/base/hair_${g}${look.hair}.png`, tone(HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[0]))
	];
	layers.push(
		legs.length > 0 ? layer(equipmentImg(legs[0])) : layer(`/mm/base/shorts_${g}1.png`, recolor(kit.shorts))
	);
	if (head.length > 0) layers.push(layer(equipmentImg(head[0])));
	layers.push(feet.length > 0 ? layer(equipmentImg(feet[0])) : layer(`/mm/base/shoes_${g}1.png`, recolor(SHOES)));
	layers.push(
		torso.length > 0 ? layer(equipmentImg(torso[0])) : layer(`/mm/base/shirt_${g}${look.shirt}.png`, recolor(kit.shirt))
	);
	if (hands.length >= 2) layers.push(layer(equipmentImg(hands[1]), 'none', true));
	if (hands.length >= 1) layers.push(layer(equipmentImg(hands[0])));
	return dedupe(layers);
}

/** Equipment covering several slots (like a suit of armor) should only be drawn once. */
function dedupe(layers: SpriteLayer[]): SpriteLayer[] {
	const seen = new Set<string>();
	return layers.filter((l) => {
		if (!l.src.includes('/equipment/')) return true;
		const key = l.src + l.flip;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
