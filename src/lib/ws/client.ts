import type { ClientMessage, ServerMessage } from './protocol.js';

export type MessageHandler = (message: ServerMessage) => void;

export class WSClient {
	private ws: WebSocket | null = null;
	private readonly url: string;
	private handlers = new Set<MessageHandler>();
	private shouldReconnect = true;
	private openHandlers = new Set<() => void>();

	constructor(url: string) {
		this.url = url;
		this.connect();
	}

	private connect(): void {
		this.ws = new WebSocket(this.url);

		this.ws.onopen = () => {
			for (const h of this.openHandlers) h();
		};

		this.ws.onmessage = (e) => {
			let msg: ServerMessage;
			try {
				msg = JSON.parse(e.data as string) as ServerMessage;
			} catch {
				return;
			}
			for (const h of this.handlers) h(msg);
		};

		this.ws.onclose = () => {
			if (this.shouldReconnect) {
				setTimeout(() => this.connect(), 2000);
			}
		};
	}

	onOpen(handler: () => void): () => void {
		this.openHandlers.add(handler);
		return () => this.openHandlers.delete(handler);
	}

	addHandler(handler: MessageHandler): () => void {
		this.handlers.add(handler);
		return () => this.handlers.delete(handler);
	}

	send(message: ClientMessage): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(message));
		}
	}

	close(): void {
		this.shouldReconnect = false;
		this.ws?.close();
	}
}

export function getWsUrl(): string {
	const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
	return `${proto}//${window.location.host}/ws`;
}
