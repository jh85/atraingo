import type { GameState, ServerMessage, ClientMessage } from '../shared/types.js';
import { CURSOR_START_X, CURSOR_START_Y } from '../shared/constants.js';
import { Renderer } from './Renderer.js';
import { InputHandler } from './InputHandler.js';
import { UI } from './UI.js';

let state: GameState | null = null;
let ws: WebSocket | null = null;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);

function sendAction(msg: ClientMessage): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

const input = new InputHandler(
  canvas,
  renderer,
  sendAction,
  { x: CURSOR_START_X, y: CURSOR_START_Y },
  renderer.getCellSize(),
);
const ui = new UI(sendAction);

// Render loop
function renderLoop(): void {
  if (state) {
    renderer.render(state, input.camera.x, input.camera.y, input.cursor);
    ui.update(state, input.cursor, input.connectSource);
  }
  requestAnimationFrame(renderLoop);
}
requestAnimationFrame(renderLoop);

function connect(): void {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    ui.setStatus('Connected');
  };

  ws.onmessage = (event) => {
    const msg: ServerMessage = JSON.parse(event.data);
    switch (msg.type) {
      case 'game_state':
      case 'update':
        state = msg.state;
        break;
      case 'error':
        ui.showError(msg.message);
        break;
    }
  };

  ws.onclose = () => {
    ui.setStatus('Disconnected. Reconnecting...');
    setTimeout(connect, 2000);
  };

  ws.onerror = () => {
    ui.setStatus('Connection error');
  };
}

connect();
