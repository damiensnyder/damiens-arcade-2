// Checks that the code's equipment and abilities match docs/mm-catalog-plain.txt, the source of
// truth. Equipment is matched by name and abilities by description, since the text has no keys.
// Also checks that everything has battle behavior and images.
//
//   npx tsx scripts/mm-catalog-check.ts

import { existsSync, readFileSync } from 'node:fs';
import { ABILITIES, EQUIPMENT, equipmentIcon, equipmentImg } from '../src/lib/games/mayhem-manager/catalog.js';
import type { Slot } from '../src/lib/games/mayhem-manager/types.js';
import { ABILITY_BEHAVIORS, EQUIPMENT_BEHAVIORS } from '../src/server/games/mayhem-manager/sim/behaviors.js';

const text = readFileSync(new URL('../docs/mm-catalog-plain.txt', import.meta.url), 'utf8');
const problems: string[] = [];

function section(heading: string): string[][] {
	const match = text.split(/^# /m).find((s) => s.startsWith(heading));
	if (!match) {
		problems.push(`no "# ${heading}" section in the txt`);
		return [];
	}
	return match
		.slice(heading.length)
		.split(/\n\s*\n/)
		.map((block) => block.split('\n').map((l) => l.trim()).filter(Boolean))
		.filter((lines) => lines.length > 0);
}

function parseSlots(text: string): Slot[] {
	if (text === 'two-handed') return ['hand', 'hand'];
	return text.split(',').map((s) => s.trim() as Slot);
}

// ---- equipment ----

const codeEquipment = new Map(Object.values(EQUIPMENT).map((e) => [e.name, e]));
const seen = new Set<string>();
for (const [name, slotsAndPrice, description, flavor = '', ...extra] of section('Equipment')) {
	seen.add(name);
	const e = codeEquipment.get(name);
	if (!e) {
		problems.push(`equipment "${name}" is in the txt but not the code`);
		continue;
	}
	if (extra.length > 0) problems.push(`${name}: unexpected extra lines: ${extra.join(' / ')}`);
	const m = slotsAndPrice.match(/^(.*), \$(\d+)$/);
	if (!m) {
		problems.push(`${name}: can't read slots and price from "${slotsAndPrice}"`);
	} else {
		const slots = parseSlots(m[1]);
		if (slots.join(',') !== e.slots.join(',')) problems.push(`${name}: slots are ${m[1]} in the txt, ${e.slots.join(', ')} in the code`);
		if (Number(m[2]) !== e.price) problems.push(`${name}: price is $${m[2]} in the txt, $${e.price} in the code`);
	}
	if (description !== e.description) problems.push(`${name}: description differs\n    txt:  ${description}\n    code: ${e.description}`);
	if (flavor !== e.flavor) problems.push(`${name}: flavor text differs\n    txt:  ${flavor}\n    code: ${e.flavor}`);
}
for (const e of codeEquipment.values()) {
	if (!seen.has(e.name)) problems.push(`equipment "${e.name}" (${e.key}) is in the code but not the txt`);
	if (!EQUIPMENT_BEHAVIORS[e.key]) problems.push(`${e.name}: no battle behavior in sim/behaviors.ts`);
	for (const img of [equipmentImg(e.key), equipmentIcon(e.key)]) {
		if (!existsSync(new URL(`../static${img}`, import.meta.url))) problems.push(`${e.name}: missing image static${img}`);
	}
}

// ---- abilities ----

const codeAbilities = new Map(
	Object.values(ABILITIES)
		.filter((a) => a.key !== 'noAbilities')
		.map((a) => [a.description, a])
);
const seenAbilities = new Set<string>();
for (const [description, flavor = '', ...extra] of section('Abilities')) {
	seenAbilities.add(description);
	const a = codeAbilities.get(description);
	if (!a) {
		problems.push(`ability "${description}" is in the txt but not the code (or its wording differs)`);
		continue;
	}
	if (extra.length > 0) problems.push(`ability "${description}": unexpected extra lines: ${extra.join(' / ')}`);
	if (flavor !== a.flavor) problems.push(`ability ${a.key}: flavor text differs\n    txt:  ${flavor}\n    code: ${a.flavor}`);
}
for (const a of codeAbilities.values()) {
	if (!seenAbilities.has(a.description)) problems.push(`ability ${a.key} ("${a.description}") is in the code but not the txt`);
	if (!ABILITY_BEHAVIORS[a.key]) problems.push(`ability ${a.key}: no battle behavior in sim/behaviors.ts`);
}

if (problems.length === 0) {
	console.log(`catalog matches the txt (${codeEquipment.size} equipment, ${codeAbilities.size} abilities)`);
} else {
	console.log(problems.map((p) => '- ' + p).join('\n'));
	process.exitCode = 1;
}
