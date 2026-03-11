import { WebSocketServer, WebSocket } from 'ws';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { WS_PORT } from '../shared/constants.js';
import { GameWorld } from './GameWorld.js';
import type { ClientMessage, ServerMessage } from '../shared/types.js';

const SAVE_PATH = './savegame.json';

const world = new GameWorld();
let client: WebSocket | null = null;

// Load save file if it exists
if (existsSync(SAVE_PATH)) {
  try {
    const data = JSON.parse(readFileSync(SAVE_PATH, 'utf-8'));
    world.load(data);
    console.log('Loaded save file');
  } catch (e) {
    console.error('Failed to load save:', e);
  }
}

function saveGame(): void {
  try {
    writeFileSync(SAVE_PATH, JSON.stringify(world.save()));
  } catch (e) {
    console.error('Failed to save:', e);
  }
}

const wss = new WebSocketServer({ port: WS_PORT });

function sendToClient(msg: ServerMessage): void {
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(msg));
  }
}

// Lightweight tick: only trains, stations, player, time (no track network)
world.setTickCallback((data) => {
  sendToClient({ type: 'tick', data });
});

// Delta updates for track/action changes: only affected nodes
world.setTrackUpdateCallback((changes, removed, branchDefaults, player) => {
  sendToClient({
    type: 'track_update',
    changes,
    removed,
    branchDefaults: branchDefaults,
    player,
  });
});

world.setTaxCallback((amount) => {
  sendToClient({ type: 'error', message: `Tax day! Paid $${amount.toLocaleString()} (${Math.ceil(amount / 5)} tiles × $5)` });
});

world.setAutoSaveCallback(() => {
  saveGame();
});

wss.on('connection', (ws) => {
  console.log('Client connected');
  client = ws;

  // Send initial state
  sendToClient({ type: 'game_state', state: world.getState() });

  ws.on('message', (data) => {
    try {
      const msg: ClientMessage = JSON.parse(data.toString());
      if (msg.type === 'save_game') {
        saveGame();
        sendToClient({ type: 'error', message: 'Game saved!' });
        return;
      }
      const result = world.handleAction(msg);
      if (!result.success) {
        sendToClient({ type: 'error', message: result.error ?? 'Unknown error' });
      }
    } catch (e) {
      console.error('Invalid message:', e);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    client = null;
  });
});

world.start();
console.log(`A-Train server running on ws://localhost:${WS_PORT}`);
