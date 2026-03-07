import type { Direction, ClientMessage, Pos } from '../shared/types.js';
import { posKey } from '../shared/directions.js';
import { GRID_WIDTH, GRID_HEIGHT } from '../shared/constants.js';
import type { Renderer } from './Renderer.js';

// 8-direction keyboard layout:
//   Q W E     NW  N  NE
//   A   D  →  W       E
//   Z S C     SW  S  SE
const KEY_DIR_MAP: Record<string, Direction> = {
  w: 'N', e: 'NE', d: 'E', c: 'SE',
  s: 'S', z: 'SW', a: 'W', q: 'NW',
};

export interface Camera {
  x: number;
  y: number;
}

export class InputHandler {
  private sendAction: (msg: ClientMessage) => void;
  private renderer: Renderer;
  cursor: Pos;
  camera: Camera;
  connectSource: Pos | null = null;

  // Drag state
  private dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragCamStartX = 0;
  private dragCamStartY = 0;
  private dragMoved = false;

  private cellSize: number;
  private canvas: HTMLCanvasElement;

  constructor(
    canvas: HTMLCanvasElement,
    renderer: Renderer,
    sendAction: (msg: ClientMessage) => void,
    startPos: Pos,
    cellSize: number,
  ) {
    this.sendAction = sendAction;
    this.renderer = renderer;
    this.canvas = canvas;
    this.cursor = { ...startPos };
    this.camera = { x: startPos.x + 0.5, y: startPos.y + 0.5 };
    this.cellSize = cellSize;
    this.setupKeyboard();
    this.setupMouse(canvas);
  }

  private setupKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();

      if (e.ctrlKey && key === 's') {
        e.preventDefault();
        this.sendAction({ type: 'save_game' });
        return;
      }

      if (key in KEY_DIR_MAP) {
        e.preventDefault();
        const dir = KEY_DIR_MAP[key];
        const dx = { N: 0, NE: 1, E: 1, SE: 1, S: 0, SW: -1, W: -1, NW: -1 }[dir];
        const dy = { N: -1, NE: -1, E: 0, SE: 1, S: 1, SW: 1, W: 0, NW: -1 }[dir];
        const nx = this.cursor.x + dx;
        const ny = this.cursor.y + dy;
        if (nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT) {
          this.cursor.x = nx;
          this.cursor.y = ny;
          this.camera.x = nx + 0.5;
          this.camera.y = ny + 0.5;
        }
        return;
      }

      if (key === ' ') {
        e.preventDefault();
        this.sendAction({ type: 'place_track', position: { ...this.cursor } });
        return;
      }

      if (key === 'f') {
        e.preventDefault();
        this.sendAction({ type: 'place_station', position: { ...this.cursor } });
        return;
      }

      if (key === 't') {
        e.preventDefault();
        this.sendAction({ type: 'buy_train', stationKey: posKey(this.cursor) });
        return;
      }

      if (key === 'l') {
        e.preventDefault();
        this.sendAction({ type: 'place_streetlight', position: { ...this.cursor } });
        return;
      }

      if (key === 'k') {
        e.preventDefault();
        if (this.connectSource === null) {
          this.connectSource = { ...this.cursor };
        } else {
          this.sendAction({
            type: 'connect_track',
            from: this.connectSource,
            to: { ...this.cursor },
          });
          this.connectSource = null;
        }
        return;
      }

      if (key === 'escape') {
        this.connectSource = null;
        return;
      }
    });
  }

  private setupMouse(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.dragging = true;
        this.dragMoved = false;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.dragCamStartX = this.camera.x;
        this.dragCamStartY = this.camera.y;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        this.dragMoved = true;
      }
      this.camera.x = this.dragCamStartX - dx / this.cellSize;
      this.camera.y = this.dragCamStartY - dy / this.cellSize;
    });

    window.addEventListener('mouseup', (e) => {
      if (!this.dragging) return;
      this.dragging = false;

      // If mouse barely moved, treat as a click
      if (!this.dragMoved) {
        this.handleClick(e);
      }
    });
  }

  private handleClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    // Check if click is on the minimap
    const minimapWorld = this.renderer.minimapToWorld(canvasX, canvasY);
    if (minimapWorld) {
      // Click on minimap: move cursor and camera there
      this.cursor.x = Math.max(0, Math.min(GRID_WIDTH - 1, minimapWorld.x));
      this.cursor.y = Math.max(0, Math.min(GRID_HEIGHT - 1, minimapWorld.y));
      this.camera.x = this.cursor.x + 0.5;
      this.camera.y = this.cursor.y + 0.5;
      return;
    }

    // Click on main map: move cursor to clicked tile
    const worldPos = this.renderer.screenToWorld(canvasX, canvasY, this.camera.x, this.camera.y);
    if (worldPos.x >= 0 && worldPos.x < GRID_WIDTH && worldPos.y >= 0 && worldPos.y < GRID_HEIGHT) {
      this.cursor.x = worldPos.x;
      this.cursor.y = worldPos.y;
    }
  }
}
