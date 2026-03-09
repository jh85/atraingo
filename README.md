# A-Train Go

A 2D browser-based railway simulation game with an old visual style. Build tracks, place stations, buy trains, and manage a railway network on a 1000x1000 tile map.

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

To use a different port, change the `port` value in `vite.config.ts`:

```ts
server: {
  port: 3000, // change this to your desired port
```

## Controls

| Key | Action |
|-----|--------|
| `Q` `W` `E` / `A` `D` / `Z` `S` `C` | Move cursor (8 directions) |
| `Space` | Place or remove track |
| `F` | Place station ($500) |
| `T` | Buy train ($2,000) |
| `K` | Connect/disconnect tracks (press on source, move, press on target) |
| `L` | Place/remove street light ($50) |
| `Ctrl+S` | Save game |
| `Esc` | Cancel connection mode |
| Mouse drag | Pan the map |
| Click minimap | Jump to location |

## Gameplay

- **Tracks** cost $100 on flat terrain, $800 through mountains (tunnels), and $500/$2,500/$10,000 for bridges over shallow/medium/deep water.
- **Stations** generate passengers over time. Trains pick up passengers at one station and earn revenue delivering them to the next.
- **Trains** move automatically along the track network. Up to 9 trains, each with a unique color and number.
- **Tax** is collected every 30 days based on the number of track tiles you own ($5 per tile).
- **Street lights** illuminate surrounding tiles at night (3x3 bright, 5x5 dim). Placeable on grass and forest only.
- **Day/night cycle** with gradual brightness transitions. The game auto-saves at the start of each new day.

### Stations

Each station has configurable properties accessible from the sidebar:

- **Name** — click the station name to rename it (max 20 characters).
- **Stop probability** (`p=0.5`) — click to set. When a train arrives, it stops with this probability. Otherwise it passes through without boarding or dropping off passengers. Default is 0.5.
- **Stop duration** — proportional to the track distance the train has traveled since its last stop, capped at one in-game day.

### Train Collision

When a train tries to move into a cell occupied by another train, it waits for 2 ticks before retrying. Stations are exempt from this rule — multiple trains can occupy a station at the same time.

### Track Placement Rules

- Placing a track with 1-2 adjacent track neighbors auto-connects to them.
- Placing a track with 3+ adjacent neighbors creates an isolated node (use `K` to connect manually).
- Manual connections (via `K`) reject 90-degree angles.

### Train Movement at Junctions

At a junction with 3+ connections, trains filter out reverse and sharp turns (90 degrees or more), then choose randomly from remaining valid directions.

### Discord Notifications

Stations can send train arrival notifications to a Discord channel via webhooks.

1. Create a webhook in your Discord channel (Channel Settings > Integrations > Webhooks).
2. In the sidebar, click **[+D]** next to a station and paste the webhook URL.
3. When a train stops at that station, a message is sent with details: train number, origin station, stay duration, passengers on/off, and revenue.

To remove a webhook, click **[D]** and submit an empty URL.

## Architecture

```
client/          Browser client (HTML5 Canvas + TypeScript)
  index.html     Entry point and UI layout
  main.ts        WebSocket connection and render loop
  Renderer.ts    Canvas rendering (terrain, tracks, trains, day/night)
  InputHandler.ts Keyboard and mouse input
  UI.ts          Sidebar UI updates

server/          Game server (Node.js + TypeScript)
  index.ts       WebSocket server and save/load
  GameWorld.ts   Game state, actions, tick loop
  TrackNetwork.ts Track graph (adjacency list)
  TrainSimulator.ts Train movement and collision
  PassengerSystem.ts Passenger generation and revenue

shared/          Shared between client and server
  types.ts       Type definitions and message types
  constants.ts   Game constants (costs, rates, grid size)
  directions.ts  8-direction utilities
  terrain.ts     Procedural terrain generation (noise-based)
```

## Tech Stack

- **Server**: Node.js, WebSocket (`ws`)
- **Client**: HTML5 Canvas, TypeScript
- **Build**: Vite + tsx
- **No frameworks** - vanilla TypeScript throughout
