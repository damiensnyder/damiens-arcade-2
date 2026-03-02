import { createServer } from 'http';
import { setupWebSocket } from './ws.js';

const isProd = process.env.NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT ?? (isProd ? '3000' : '3001'));

async function main() {
	// In production, serve the built SvelteKit app alongside WebSocket
	let svelteHandler: ((req: unknown, res: unknown) => void) | null = null;
	if (isProd) {
		const build = await import('../../build/handler.js');
		svelteHandler = build.handler;
	}

	const server = createServer((req, res) => {
		if (svelteHandler) {
			svelteHandler(req, res);
		} else {
			(res as import('http').ServerResponse).writeHead(404);
			(res as import('http').ServerResponse).end();
		}
	});

	setupWebSocket(server);
	server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

main();
