# Damien's Arcade

A SvelteKit 2 multiplayer game arcade with WebSocket support.

## Tech Stack

- **SvelteKit 2** with `@sveltejs/adapter-node`
- **TypeScript** (strict mode)
- **Zod** for runtime validation
- **WebSocket** server integrated with the Node adapter
- **Svelte 5 runes** for reactive state management

## Project Structure

```
src/
├── lib/
│   ├── games/
│   │   ├── types.ts              # Types for rooms or which apply across all games
│   │   ├── room.svelte.ts        # Room state management
│   │   ├── auction-ttt/          # Auction Tic-Tac-Toe
│   │   ├── daily-qless/          # Daily Q-less
│   │   └── mayhem-manager/        # Mayhem Manager
│   └── ws/
│       ├── client.ts             # Client WebSocket wrapper with reconnect
│       └── protocol.ts           # Message envelope types (Zod schemas)
├── routes/
│   ├── +page.svelte              # Arcade homepage
│   ├── auction-tic-tac-toe/      # Game pages
│   ├── daily-qless/              # Game page
│   └── mayhem-manager/           # Game pages
└── server/
    ├── index.ts                  # Custom Node server (HTTP + WebSocket)
    ├── ws.ts                     # WebSocket connection handler
    ├── rooms.ts                  # In-memory room management
    └── game-registry.ts          # Game definitions registry
```

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

This starts two servers:
- **Vite dev server** on http://localhost:5173 (SvelteKit app)
- **WebSocket server** on ws://localhost:3001/ws

### Production

```bash
# Build the app
npm run build

# Run production server
npm run preview
```

This starts a single server on http://localhost:3000 with integrated WebSocket support on ws://localhost:3000/ws.