export type RngState = [number, number, number, number];

/** Seedable jsf32b PRNG, so simulations are reproducible from a seed. */
export class Rng {
	state: RngState;

	constructor(seed?: RngState) {
		this.state = seed
			? [...seed]
			: [0, 0, 0, 0].map(() => Math.floor(Math.random() * 4294967296)) as RngState;
	}

	private next(): number {
		const s = this.state;
		s[0] |= 0;
		s[1] |= 0;
		s[2] |= 0;
		s[3] |= 0;
		const t = (s[0] - ((s[1] << 27) | (s[1] >>> 5))) | 0;
		s[0] = s[1] ^ ((s[2] << 17) | (s[2] >>> 15));
		s[1] = (s[2] + s[3]) | 0;
		s[2] = (s[3] + t) | 0;
		s[3] = (s[0] + t) | 0;
		return s[3] >>> 0;
	}

	/** Random real in [0, 1). */
	real(): number {
		return this.next() / 4294967296;
	}

	/** Random real from a normal distribution (Box–Muller). */
	normal(mean = 0, sd = 1): number {
		const u = 1 - this.real();
		const v = this.real();
		return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
	}

	/** Random integer between min and max, inclusive. */
	int(min: number, max: number): number {
		return min + Math.floor((max + 1 - min) * this.real());
	}

	pick<T>(array: readonly T[]): T {
		return array[this.int(0, array.length - 1)];
	}

	shuffle<T>(array: T[]): T[] {
		for (let i = array.length - 1; i > 0; i--) {
			const j = this.int(0, i);
			[array[i], array[j]] = [array[j], array[i]];
		}
		return array;
	}
}
