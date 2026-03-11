import type { GameState, Pos, TerrainType, Direction } from '../shared/types.js';
import { parseKey } from '../shared/directions.js';
import { terrainAt, waterDepthAt } from '../shared/terrain.js';
import { GRID_WIDTH, GRID_HEIGHT } from '../shared/constants.js';

const CELL_SIZE = 32;

// Minimap constants (exported for click handling)
export const MINIMAP_SIZE = 180;
export const MINIMAP_MARGIN = 10;

// Dragon Quest / JRPG-inspired palette
const TERRAIN_COLORS: Record<TerrainType, string> = {
  grass: '#50B848',
  water: '#3088F0',
  forest: '#208828',
  mountain: '#906838',
  sand: '#E8C840',
};

const TERRAIN_ACCENT: Record<TerrainType, string> = {
  grass: '#40A038',
  water: '#58A8F8',
  forest: '#186018',
  mountain: '#706050',
  sand: '#D0B030',
};

// Minimap terrain color (simpler/brighter for tiny pixels)
const MINIMAP_COLORS: Record<TerrainType, [number, number, number]> = {
  grass:    [80, 184, 72],
  water:    [48, 136, 240],
  forest:   [32, 136, 40],
  mountain: [144, 104, 56],
  sand:     [232, 200, 64],
};

// Smooth noise for clustered tile variant selection
function variantNoise(x: number, y: number, seed: number, scale: number): number {
  const sx = x / scale;
  const sy = y / scale;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const fx = sx - x0;
  const fy = sy - y0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number) => {
    let r = (seed + a * 374761393 + b * 668265263) | 0;
    r = Math.imul(r ^ (r >>> 13), 1274126177);
    return ((r ^ (r >>> 16)) & 0x7fffffff) / 0x7fffffff;
  };
  const n00 = h(x0, y0), n10 = h(x0 + 1, y0);
  const n01 = h(x0, y0 + 1), n11 = h(x0 + 1, y0 + 1);
  const i0 = n00 + (n10 - n00) * u;
  const i1 = n01 + (n11 - n01) * u;
  return i0 + (i1 - i0) * v;
}

function pickVariant(x: number, y: number, seed: number, count: number): number {
  return Math.min(count - 1, Math.floor(variantNoise(x, y, seed, 20) * count));
}

// Per-terrain seeds so variant clusters don't align
const VARIANT_SEEDS: Record<string, number> = {
  grass: 111, forest: 333, mountain: 444, sand: 555, water: 222,
};

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tileSprites: Map<TerrainType, HTMLCanvasElement[]> = new Map();
  private waterDepthSprites: HTMLCanvasElement[][] = []; // [depth-1][variant]
  private stationSprite: HTMLCanvasElement | null = null;
  private minimapTerrain: HTMLCanvasElement | null = null;
  private frameCount = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    this.buildTileSprites();
    this.buildStationSprite();
    this.buildMinimapTerrain();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
  }

  private resize(): void {
    const container = this.canvas.parentElement!;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w > 0 && h > 0) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private buildTileSprites(): void {
    // Land terrain variants
    const variantCounts: Partial<Record<TerrainType, number>> = {
      grass: 5, forest: 5, mountain: 4, sand: 4,
    };
    for (const type of Object.keys(variantCounts) as TerrainType[]) {
      const variants: HTMLCanvasElement[] = [];
      for (let v = 0; v < variantCounts[type]!; v++) {
        const c = document.createElement('canvas');
        c.width = CELL_SIZE; c.height = CELL_SIZE;
        const ctx = c.getContext('2d')!;
        this.drawLandVariant(ctx, type, v);
        variants.push(c);
      }
      this.tileSprites.set(type, variants);
    }

    // Water depth sprites: 3 depths × 2 variants each
    for (let depth = 1; depth <= 3; depth++) {
      const variants: HTMLCanvasElement[] = [];
      for (let v = 0; v < 2; v++) {
        const c = document.createElement('canvas');
        c.width = CELL_SIZE; c.height = CELL_SIZE;
        const ctx = c.getContext('2d')!;
        this.drawWaterVariant(ctx, depth, v);
        variants.push(c);
      }
      this.waterDepthSprites.push(variants);
    }
  }

  private drawWaterVariant(ctx: CanvasRenderingContext2D, depth: number, v: number): void {
    const s = CELL_SIZE;
    if (depth === 1) {
      // Shallow — bright blue, gentle ripples
      ctx.fillStyle = '#4098F0'; ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#70B8F8'; ctx.lineWidth = 1;
      if (v === 0) {
        for (let row = 0; row < 3; row++) {
          const y = 7 + row * 10;
          ctx.beginPath(); ctx.moveTo(2,y);
          ctx.quadraticCurveTo(8,y-2,16,y); ctx.quadraticCurveTo(22,y+2,28,y); ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#80C8FF'; ctx.fillRect(8,10,2,1); ctx.fillRect(20,20,2,1);
        ctx.strokeStyle = '#68B0F0'; ctx.lineWidth = 1;
        const y = 15;
        ctx.beginPath(); ctx.moveTo(4,y); ctx.quadraticCurveTo(14,y-2,24,y); ctx.stroke();
      }
    } else if (depth === 2) {
      // Medium — mid blue, moderate waves
      ctx.fillStyle = '#2870D0'; ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#4090E0'; ctx.lineWidth = 1.5;
      if (v === 0) {
        for (let row = 0; row < 2; row++) {
          const y = 10 + row * 12;
          ctx.beginPath(); ctx.moveTo(1,y);
          ctx.quadraticCurveTo(8,y-3,16,y); ctx.quadraticCurveTo(24,y+3,30,y); ctx.stroke();
        }
      } else {
        const y = 14;
        ctx.beginPath(); ctx.moveTo(3,y);
        ctx.quadraticCurveTo(10,y-4,18,y); ctx.quadraticCurveTo(26,y+3,30,y); ctx.stroke();
        ctx.fillStyle = '#3880D8'; ctx.fillRect(12,22,3,2);
      }
    } else {
      // Deep — dark navy, barely any detail
      ctx.fillStyle = '#183880'; ctx.fillRect(0, 0, s, s);
      if (v === 0) {
        ctx.strokeStyle = '#204898'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(4,16); ctx.quadraticCurveTo(16,13,28,16); ctx.stroke();
      } else {
        ctx.fillStyle = '#1C3C88'; ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = '#203888'; ctx.fillRect(10,10,6,3);
      }
    }
  }

  private drawLandVariant(ctx: CanvasRenderingContext2D, type: TerrainType, v: number): void {
    const s = CELL_SIZE;
    const base = TERRAIN_COLORS[type];
    const accent = TERRAIN_ACCENT[type];
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);

    switch (type) {
      case 'grass': {
        if (v === 0) {
          ctx.fillStyle = accent;
          ctx.fillRect(6,8,2,4); ctx.fillRect(5,8,1,2); ctx.fillRect(9,8,1,2);
          ctx.fillRect(20,18,2,4); ctx.fillRect(19,18,1,2); ctx.fillRect(23,18,1,2);
        } else if (v === 1) {
          ctx.fillStyle = '#8A8A7A';
          ctx.fillRect(8,10,3,2); ctx.fillRect(9,9,1,1);
          ctx.fillStyle = '#9A9A8A'; ctx.fillRect(22,20,2,2);
          ctx.fillStyle = '#7A7A6A'; ctx.fillRect(14,25,2,1);
        } else if (v === 2) {
          ctx.fillStyle = '#E8E058'; ctx.fillRect(7,12,2,2); ctx.fillRect(24,8,2,2);
          ctx.fillStyle = '#E06898'; ctx.fillRect(18,22,2,2);
          ctx.fillStyle = accent;
          ctx.fillRect(6,14,2,3); ctx.fillRect(17,24,2,3); ctx.fillRect(23,10,2,3);
        } else if (v === 3) {
          ctx.fillStyle = '#48A840'; ctx.fillRect(0,0,s,s);
          ctx.fillStyle = accent; ctx.fillRect(12,14,2,3);
        } else {
          ctx.fillStyle = '#C0A080'; ctx.fillRect(10,18,2,3); ctx.fillRect(22,12,2,3);
          ctx.fillStyle = '#D04030'; ctx.fillRect(9,16,4,2);
          ctx.fillStyle = '#E08030'; ctx.fillRect(21,10,4,2);
          ctx.fillStyle = accent; ctx.fillRect(5,24,2,3);
        }
        break;
      }
      case 'forest': {
        const trunkColor = '#5D4037';
        if (v === 0) {
          ctx.fillStyle = '#186818';
          ctx.beginPath(); ctx.arc(s/2,s/2-2,9,0,Math.PI*2); ctx.fill();
          ctx.fillStyle = accent;
          ctx.beginPath(); ctx.arc(s/2,s/2-2,7,0,Math.PI*2); ctx.fill();
          ctx.fillStyle = trunkColor; ctx.fillRect(s/2-2,s/2+6,4,6);
        } else if (v === 1) {
          ctx.fillStyle = '#186818';
          ctx.beginPath(); ctx.arc(s/2,s/2-2,9,0,Math.PI*2); ctx.fill();
          ctx.fillStyle = '#28A028';
          ctx.beginPath(); ctx.arc(s/2,s/2-2,7,0,Math.PI*2); ctx.fill();
          ctx.fillStyle = '#D03020';
          ctx.fillRect(11,10,3,3); ctx.fillRect(19,8,3,3); ctx.fillRect(15,14,3,3);
          ctx.fillStyle = trunkColor; ctx.fillRect(s/2-2,s/2+6,4,6);
        } else if (v === 2) {
          ctx.fillStyle = trunkColor; ctx.fillRect(s/2-1,s/2+4,3,8);
          ctx.fillStyle = '#1A6020';
          ctx.beginPath(); ctx.moveTo(s/2,3); ctx.lineTo(s/2+9,s/2+2); ctx.lineTo(s/2-9,s/2+2); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#228828';
          ctx.beginPath(); ctx.moveTo(s/2,7); ctx.lineTo(s/2+7,s/2+2); ctx.lineTo(s/2-7,s/2+2); ctx.closePath(); ctx.fill();
        } else if (v === 3) {
          ctx.fillStyle = '#A06010';
          ctx.beginPath(); ctx.arc(s/2,s/2-2,9,0,Math.PI*2); ctx.fill();
          ctx.fillStyle = '#C88020';
          ctx.beginPath(); ctx.arc(s/2,s/2-2,7,0,Math.PI*2); ctx.fill();
          ctx.fillStyle = '#D8A030'; ctx.fillRect(10,8,3,3); ctx.fillRect(18,12,3,3);
          ctx.fillStyle = trunkColor; ctx.fillRect(s/2-2,s/2+6,4,6);
        } else {
          ctx.fillStyle = '#186818';
          ctx.beginPath(); ctx.arc(10,s/2,6,0,Math.PI*2); ctx.fill();
          ctx.fillStyle = '#208828';
          ctx.beginPath(); ctx.arc(10,s/2,4.5,0,Math.PI*2); ctx.fill();
          ctx.fillStyle = '#1A7020';
          ctx.beginPath(); ctx.arc(22,s/2+2,7,0,Math.PI*2); ctx.fill();
          ctx.fillStyle = '#28A030';
          ctx.beginPath(); ctx.arc(22,s/2+2,5,0,Math.PI*2); ctx.fill();
        }
        break;
      }
      case 'mountain': {
        if (v === 0) {
          ctx.fillStyle = '#785830';
          ctx.beginPath(); ctx.moveTo(s/2,4); ctx.lineTo(s-4,s-4); ctx.lineTo(4,s-4); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = accent; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(s/2,4); ctx.lineTo(s-4,s-4); ctx.lineTo(4,s-4); ctx.closePath(); ctx.stroke();
          ctx.fillStyle = '#E8E8E8';
          ctx.beginPath(); ctx.moveTo(s/2,4); ctx.lineTo(s/2+6,14); ctx.lineTo(s/2-6,14); ctx.closePath(); ctx.fill();
        } else if (v === 1) {
          ctx.fillStyle = '#785830';
          ctx.beginPath(); ctx.moveTo(10,6); ctx.lineTo(20,s-4); ctx.lineTo(1,s-4); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#806838';
          ctx.beginPath(); ctx.moveTo(22,8); ctx.lineTo(s-2,s-4); ctx.lineTo(12,s-4); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#E8E8E8';
          ctx.beginPath(); ctx.moveTo(10,6); ctx.lineTo(14,12); ctx.lineTo(6,12); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#D8D8D8';
          ctx.beginPath(); ctx.moveTo(22,8); ctx.lineTo(25,14); ctx.lineTo(19,14); ctx.closePath(); ctx.fill();
        } else if (v === 2) {
          ctx.fillStyle = '#6A5030';
          ctx.beginPath(); ctx.moveTo(s/2-2,3); ctx.lineTo(s-3,s-4); ctx.lineTo(2,s-4); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#5A4020'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(8,s-8); ctx.lineTo(14,s/2); ctx.lineTo(20,s-6); ctx.stroke();
          ctx.fillStyle = '#D0D0D0';
          ctx.beginPath(); ctx.moveTo(s/2-2,3); ctx.lineTo(s/2+5,11); ctx.lineTo(s/2-7,11); ctx.closePath(); ctx.fill();
        } else {
          ctx.fillStyle = '#504030';
          ctx.beginPath(); ctx.moveTo(s/2,5); ctx.lineTo(s-5,s-3); ctx.lineTo(5,s-3); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#403028'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(s/2,5); ctx.lineTo(s-5,s-3); ctx.lineTo(5,s-3); ctx.closePath(); ctx.stroke();
          ctx.fillStyle = '#C06030'; ctx.fillRect(s/2-2,6,4,3);
        }
        break;
      }
      case 'sand': {
        if (v === 0) {
          ctx.fillStyle = accent;
          ctx.fillRect(7,7,2,2); ctx.fillRect(22,12,2,2); ctx.fillRect(12,22,2,2); ctx.fillRect(25,25,2,2);
        } else if (v === 1) {
          ctx.strokeStyle = accent; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(4,10); ctx.lineTo(20,9); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(8,20); ctx.lineTo(26,19); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(2,28); ctx.lineTo(18,27); ctx.stroke();
        } else if (v === 2) {
          ctx.fillStyle = '#D8B838'; ctx.fillRect(0,0,s,s);
          ctx.fillStyle = '#F0E0A0'; ctx.fillRect(14,14,4,3); ctx.fillRect(15,13,2,1);
          ctx.fillStyle = accent; ctx.fillRect(6,24,2,2);
        } else {
          ctx.fillStyle = '#60A830';
          ctx.fillRect(14,10,4,14); ctx.fillRect(10,14,4,3); ctx.fillRect(18,12,4,3);
          ctx.fillStyle = '#508820';
          ctx.fillRect(15,10,2,1); ctx.fillRect(11,14,2,1); ctx.fillRect(19,12,2,1);
        }
        break;
      }
    }
  }

  private buildStationSprite(): void {
    const c = document.createElement('canvas');
    c.width = CELL_SIZE;
    c.height = CELL_SIZE;
    const s = CELL_SIZE;
    const ctx = c.getContext('2d')!;

    // Foundation / platform
    ctx.fillStyle = '#78909C';
    ctx.fillRect(1, s - 6, s - 2, 6);
    ctx.fillStyle = '#607D8B';
    ctx.fillRect(1, s - 7, s - 2, 1);

    // Walls
    ctx.fillStyle = '#F5E6CA';
    ctx.fillRect(3, 10, s - 6, s - 16);

    // Wall detail lines
    ctx.strokeStyle = '#E0D0B0';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(3, 18); ctx.lineTo(s - 3, 18); ctx.stroke();

    // Door
    ctx.fillStyle = '#4E342E';
    ctx.fillRect(12, 16, 8, 10);
    // Door handle
    ctx.fillStyle = '#FFD54F';
    ctx.fillRect(18, 20, 1, 2);
    // Door arch
    ctx.fillStyle = '#3E2723';
    ctx.fillRect(12, 15, 8, 1);

    // Windows
    ctx.fillStyle = '#64B5F6';
    ctx.fillRect(4, 12, 5, 5);
    ctx.fillRect(s - 9, 12, 5, 5);
    // Window cross frames
    ctx.strokeStyle = '#3E2723'; ctx.lineWidth = 1;
    ctx.strokeRect(4, 12, 5, 5);
    ctx.strokeRect(s - 9, 12, 5, 5);
    ctx.beginPath(); ctx.moveTo(6.5, 12); ctx.lineTo(6.5, 17); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, 14.5); ctx.lineTo(9, 14.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s - 6.5, 12); ctx.lineTo(s - 6.5, 17); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s - 9, 14.5); ctx.lineTo(s - 4, 14.5); ctx.stroke();

    // Roof
    ctx.fillStyle = '#C62828';
    ctx.beginPath();
    ctx.moveTo(s / 2, 1);
    ctx.lineTo(s, 11);
    ctx.lineTo(0, 11);
    ctx.closePath();
    ctx.fill();
    // Roof outline
    ctx.strokeStyle = '#8E1C1C'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s / 2, 1); ctx.lineTo(s, 11); ctx.lineTo(0, 11); ctx.closePath();
    ctx.stroke();
    // Roof highlight
    ctx.fillStyle = '#E53935';
    ctx.beginPath();
    ctx.moveTo(s / 2, 2); ctx.lineTo(s / 2 + 8, 10); ctx.lineTo(s / 2, 10); ctx.closePath();
    ctx.fill();

    // Chimney
    ctx.fillStyle = '#5D4037';
    ctx.fillRect(s - 10, 3, 4, 7);
    ctx.fillStyle = '#4E342E';
    ctx.fillRect(s - 11, 2, 6, 2);

    this.stationSprite = c;
  }

  private buildMinimapTerrain(): void {
    const c = document.createElement('canvas');
    c.width = MINIMAP_SIZE;
    c.height = MINIMAP_SIZE;
    const ctx = c.getContext('2d')!;
    const imgData = ctx.createImageData(MINIMAP_SIZE, MINIMAP_SIZE);
    const data = imgData.data;
    const scaleX = GRID_WIDTH / MINIMAP_SIZE;
    const scaleY = GRID_HEIGHT / MINIMAP_SIZE;

    for (let py = 0; py < MINIMAP_SIZE; py++) {
      for (let px = 0; px < MINIMAP_SIZE; px++) {
        const wx = Math.floor(px * scaleX);
        const wy = Math.floor(py * scaleY);
        const terrain = terrainAt(wx, wy);
        let r: number, g: number, b: number;
        if (terrain === 'water') {
          const depth = waterDepthAt(wx, wy);
          if (depth === 3) { r = 15; g = 50; b = 140; }
          else if (depth === 2) { r = 35; g = 95; b = 200; }
          else { r = 70; g = 155; b = 240; }
        } else {
          [r, g, b] = MINIMAP_COLORS[terrain];
        }
        const idx = (py * MINIMAP_SIZE + px) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    this.minimapTerrain = c;
  }

  // Returns the minimap bounding rect in canvas coordinates
  getMinimapRect(): { x: number; y: number; w: number; h: number } {
    return {
      x: this.canvas.width - MINIMAP_SIZE - MINIMAP_MARGIN,
      y: this.canvas.height - MINIMAP_SIZE - MINIMAP_MARGIN,
      w: MINIMAP_SIZE,
      h: MINIMAP_SIZE,
    };
  }

  // Convert a point inside the minimap to world coordinates
  minimapToWorld(canvasX: number, canvasY: number): Pos | null {
    const r = this.getMinimapRect();
    const lx = canvasX - r.x;
    const ly = canvasY - r.y;
    if (lx < 0 || lx >= r.w || ly < 0 || ly >= r.h) return null;
    return {
      x: Math.floor((lx / MINIMAP_SIZE) * GRID_WIDTH),
      y: Math.floor((ly / MINIMAP_SIZE) * GRID_HEIGHT),
    };
  }

  render(state: GameState, cameraX: number, cameraY: number, cursor: Pos): void {
    this.frameCount++;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    const offsetX = Math.floor(w / 2 - cameraX * CELL_SIZE);
    const offsetY = Math.floor(h / 2 - cameraY * CELL_SIZE);
    ctx.imageSmoothingEnabled = false;

    const startX = Math.floor(-offsetX / CELL_SIZE) - 1;
    const startY = Math.floor(-offsetY / CELL_SIZE) - 1;
    const endX = startX + Math.ceil(w / CELL_SIZE) + 2;
    const endY = startY + Math.ceil(h / CELL_SIZE) + 2;

    // 1. Terrain
    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        if (x < 0 || x >= state.gridWidth || y < 0 || y >= state.gridHeight) {
          const sx = x * CELL_SIZE + offsetX;
          const sy = y * CELL_SIZE + offsetY;
          ctx.fillStyle = '#182848';
          ctx.fillRect(sx, sy, CELL_SIZE, CELL_SIZE);
          continue;
        }
        const terrain = terrainAt(x, y);
        const sx = x * CELL_SIZE + offsetX;
        const sy = y * CELL_SIZE + offsetY;
        if (terrain === 'water') {
          const depth = waterDepthAt(x, y);
          const wv = this.waterDepthSprites[depth - 1];
          const vi = pickVariant(x, y, VARIANT_SEEDS.water, wv.length);
          ctx.drawImage(wv[vi], sx, sy);
        } else {
          const variants = this.tileSprites.get(terrain);
          if (variants) {
            const vi = pickVariant(x, y, VARIANT_SEEDS[terrain] ?? 0, variants.length);
            ctx.drawImage(variants[vi], sx, sy);
          }
        }
      }
    }

    // 2. Bridges
    this.drawBridges(ctx, state, offsetX, offsetY);

    // 3. Tracks
    this.drawTracks(ctx, state, offsetX, offsetY);

    // 4. Stations
    this.drawStations(ctx, state, offsetX, offsetY);

    // 4.5. Street lights
    this.drawStreetLights(ctx, state, offsetX, offsetY);

    // 5. Cursor (under overlay so it dims too)
    this.drawCursor(ctx, cursor, offsetX, offsetY);

    // 6. Day/night overlay (with headlight + ambient cutouts)
    const nightAlpha = this.getDarknessAlpha(state.time.hour, state.time.minute);
    const headlights: { x: number; y: number }[] = [];
    const dimLights: { x: number; y: number }[] = [];
    const ambients: { x: number; y: number }[] = [];
    if (nightAlpha > 0.05) {
      const ddx: Record<string, number> = { N: 0, NE: 1, E: 1, SE: 1, S: 0, SW: -1, W: -1, NW: -1 };
      const ddy: Record<string, number> = { N: -1, NE: -1, E: 0, SE: 1, S: 1, SW: 1, W: 0, NW: -1 };
      const surDx = [-1, 0, 1, -1, 1, -1, 0, 1];
      const surDy = [-1, -1, -1, 0, 0, 1, 1, 1];
      // tier: 0=headlight(full), 1=dim(streetlight 3x3 / train ambient), 2=ambient(streetlight 5x5)
      const tileMap = new Map<string, { x: number; y: number; tier: number }>();

      const addTile = (k: string, x: number, y: number, tier: number) => {
        const existing = tileMap.get(k);
        if (!existing || tier < existing.tier) {
          tileMap.set(k, { x, y, tier });
        }
      };

      // Train's own cell: ambient brightness
      for (const t of state.trains) {
        if (terrainAt(t.position.x, t.position.y) === 'mountain') continue;
        const tk = `${t.position.x},${t.position.y}`;
        addTile(tk, t.position.x * CELL_SIZE + offsetX, t.position.y * CELL_SIZE + offsetY, 2);
      }

      // Street lights: 3x3 = dim, 5x5 outer ring = ambient
      for (const sl of state.streetLights) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const tx = sl.x + dx, ty = sl.y + dy;
            addTile(`${tx},${ty}`, tx * CELL_SIZE + offsetX, ty * CELL_SIZE + offsetY, 1);
          }
        }
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const tx = sl.x + dx, ty = sl.y + dy;
            addTile(`${tx},${ty}`, tx * CELL_SIZE + offsetX, ty * CELL_SIZE + offsetY, 2);
          }
        }
      }

      for (const [, t] of tileMap) {
        if (t.tier === 0) headlights.push(t);
        else if (t.tier === 1) dimLights.push(t);
        else ambients.push(t);
      }
    }
    this.drawDayNightOverlay(ctx, w, h, nightAlpha, headlights, dimLights, ambients);

    // 7. Trains (on top of overlay, dimmed at night)
    this.drawTrains(ctx, state, offsetX, offsetY, nightAlpha);

    // 8. Minimap
    this.drawMinimap(ctx, state, cameraX, cameraY, cursor);
  }

  private getDarknessAlpha(hour: number, minute: number): number {
    const t = hour + minute / 60;
    const MAX = 0.88;
    if (t < 5) return MAX;
    if (t < 7) return MAX * (1 - (t - 5) / 2);
    if (t < 17) return 0;
    if (t < 19) return MAX * ((t - 17) / 2);
    return MAX;
  }

  private drawDayNightOverlay(
    ctx: CanvasRenderingContext2D, w: number, h: number,
    alpha: number, headlights: { x: number; y: number }[],
    dimLights: { x: number; y: number }[],
    ambients: { x: number; y: number }[],
  ): void {
    if (alpha <= 0.001) return;

    const allLit = [...headlights, ...dimLights, ...ambients];

    if (allLit.length > 0) {
      // Draw full overlay with ALL lit tiles clipped out
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      for (const t of allLit) {
        ctx.rect(t.x, t.y, CELL_SIZE, CELL_SIZE);
      }
      ctx.clip('evenodd');
    }

    ctx.fillStyle = `rgba(5, 5, 30, ${alpha})`;
    ctx.fillRect(0, 0, w, h);

    if (allLit.length > 0) {
      ctx.restore();
    }

    // Dim lights (streetlight 3x3, train surroundings): moderate overlay
    if (dimLights.length > 0) {
      ctx.fillStyle = `rgba(5, 5, 30, ${alpha * 0.45})`;
      for (const t of dimLights) {
        ctx.fillRect(t.x, t.y, CELL_SIZE, CELL_SIZE);
      }
    }

    // Ambients (streetlight 5x5 outer ring): heavier overlay
    if (ambients.length > 0) {
      ctx.fillStyle = `rgba(5, 5, 30, ${alpha * 0.7})`;
      for (const t of ambients) {
        ctx.fillRect(t.x, t.y, CELL_SIZE, CELL_SIZE);
      }
    }
  }

  private drawBridges(
    ctx: CanvasRenderingContext2D, state: GameState,
    offsetX: number, offsetY: number,
  ): void {
    const half = CELL_SIZE / 2;
    for (const [key, neighbors] of state.trackConnections) {
      const pos = parseKey(key);
      if (terrainAt(pos.x, pos.y) !== 'water') continue;
      const depth = waterDepthAt(pos.x, pos.y);
      const bx = pos.x * CELL_SIZE + half + offsetX;
      const by = pos.y * CELL_SIZE + half + offsetY;

      if (neighbors.length === 0) continue;

      // Determine orientation from connections
      const np0 = parseKey(neighbors[0]);
      const dx0 = np0.x - pos.x, dy0 = np0.y - pos.y;
      let oriented = false;
      let angle = Math.atan2(dy0, dx0);
      const isDiag = Math.abs(dx0) + Math.abs(dy0) === 2;

      if (neighbors.length === 1) {
        oriented = true;
      } else if (neighbors.length === 2) {
        const np1 = parseKey(neighbors[1]);
        if (dx0 + (np1.x - pos.x) === 0 && dy0 + (np1.y - pos.y) === 0) {
          oriented = true;
        }
      }

      if (oriented) {
        const deckLen = isDiag ? CELL_SIZE * Math.SQRT2 : CELL_SIZE;
        this.drawOrientedBridge(ctx, bx, by, angle, deckLen, depth);
      } else if (neighbors.length === 2) {
        // Curved bridge: deck follows a Bezier curve between the two neighbor edges
        const np1 = parseKey(neighbors[1]);
        const dx1 = np1.x - pos.x, dy1 = np1.y - pos.y;
        const half = CELL_SIZE / 2;
        // Exit points at cell edges toward each neighbor
        const ex0 = bx + dx0 * half, ey0 = by + dy0 * half;
        const ex1 = bx + dx1 * half, ey1 = by + dy1 * half;
        this.drawCurvedBridge(ctx, ex0, ey0, bx, by, ex1, ey1, depth);
      } else {
        // Junction (3+ neighbors): draw individual bridge segments from center to each edge
        const half = CELL_SIZE / 2;
        for (const nk of neighbors) {
          const np = parseKey(nk);
          const ndx = np.x - pos.x, ndy = np.y - pos.y;
          const isDiagonal = Math.abs(ndx) + Math.abs(ndy) === 2;
          const segLen = isDiagonal ? half * Math.SQRT2 : half;
          const segAngle = Math.atan2(ndy, ndx);
          // Draw half-bridge from center toward neighbor edge
          const mx = bx + ndx * half * 0.5;
          const my = by + ndy * half * 0.5;
          this.drawOrientedBridge(ctx, mx, my, segAngle, segLen + 2, depth);
        }
      }
    }
  }

  private drawOrientedBridge(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, angle: number, deckLen: number, depth: number,
  ): void {
    const deckW = 18;
    const halfL = deckLen / 2 + 2;
    const halfW = deckW / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    if (depth === 1) {
      // Wooden bridge
      ctx.fillStyle = '#8D6E4C';
      ctx.fillRect(-halfL, -halfW, halfL * 2, deckW);
      ctx.strokeStyle = '#6D5030'; ctx.lineWidth = 0.5;
      for (let px = Math.ceil(-halfL); px < halfL; px += 5) {
        ctx.beginPath(); ctx.moveTo(px, -halfW); ctx.lineTo(px, halfW); ctx.stroke();
      }
      ctx.strokeStyle = '#A1887F'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-halfL, -halfW); ctx.lineTo(halfL, -halfW); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-halfL, halfW); ctx.lineTo(halfL, halfW); ctx.stroke();
      ctx.fillStyle = '#5D4037';
      ctx.fillRect(-halfL, -halfW - 2, 3, 3); ctx.fillRect(halfL - 3, -halfW - 2, 3, 3);
      ctx.fillRect(-halfL, halfW - 1, 3, 3); ctx.fillRect(halfL - 3, halfW - 1, 3, 3);
    } else if (depth === 2) {
      // Stone bridge
      ctx.fillStyle = '#808890';
      ctx.fillRect(-halfL, -halfW, halfL * 2, deckW);
      ctx.strokeStyle = '#687078'; ctx.lineWidth = 0.5;
      for (let px = Math.ceil(-halfL); px < halfL; px += 8) {
        ctx.beginPath(); ctx.moveTo(px, -halfW); ctx.lineTo(px, halfW); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(-halfL, 0); ctx.lineTo(halfL, 0); ctx.stroke();
      ctx.strokeStyle = '#505860'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, halfW + 2, halfW, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = '#606870';
      ctx.fillRect(-halfL, -halfW - 3, halfL * 2, 3);
      ctx.fillRect(-halfL, halfW, halfL * 2, 3);
      ctx.fillStyle = '#505860';
      ctx.fillRect(-halfL, -halfW - 4, 4, 5); ctx.fillRect(halfL - 4, -halfW - 4, 4, 5);
      ctx.fillRect(-halfL, halfW - 1, 4, 5); ctx.fillRect(halfL - 4, halfW - 1, 4, 5);
    } else {
      // Iron suspension bridge
      ctx.fillStyle = '#404850';
      ctx.fillRect(-halfL, -halfW, halfL * 2, deckW);
      ctx.fillStyle = '#505860';
      ctx.fillRect(-halfL + 2, -halfW + 2, halfL * 2 - 4, deckW - 4);
      ctx.fillStyle = '#808890';
      for (let px = -halfL + 4; px < halfL; px += 6) {
        ctx.fillRect(px, -halfW + 1, 2, 2); ctx.fillRect(px, halfW - 3, 2, 2);
      }
      ctx.fillStyle = '#384048';
      ctx.fillRect(-halfL, -halfW - 6, 4, deckW + 12);
      ctx.fillRect(halfL - 4, -halfW - 6, 4, deckW + 12);
      ctx.fillStyle = '#606870';
      ctx.fillRect(-halfL - 1, -halfW - 7, 6, 3); ctx.fillRect(halfL - 5, -halfW - 7, 6, 3);
      ctx.strokeStyle = '#90989F'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-halfL + 2, -halfW - 5);
      ctx.quadraticCurveTo(0, -halfW + 4, halfL - 2, -halfW - 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-halfL + 2, halfW + 5);
      ctx.quadraticCurveTo(0, halfW - 4, halfL - 2, halfW + 5); ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Draw a curved bridge deck along a quadratic Bezier curve.
   * Connects seamlessly to adjacent straight bridge segments at cell edges.
   */
  private drawCurvedBridge(
    ctx: CanvasRenderingContext2D,
    x0: number, y0: number,
    cpx: number, cpy: number,
    x2: number, y2: number,
    depth: number,
  ): void {
    const deckW = 18;
    const halfW = deckW / 2;

    // Compute normals at start, mid, and end for offsetting
    const railOff = halfW;
    const t0x = cpx - x0, t0y = cpy - y0;
    const t0len = Math.sqrt(t0x * t0x + t0y * t0y) || 1;
    const n0x = (-t0y / t0len) * railOff, n0y = (t0x / t0len) * railOff;
    const t2x = x2 - cpx, t2y = y2 - cpy;
    const t2len = Math.sqrt(t2x * t2x + t2y * t2y) || 1;
    const n2x = (-t2y / t2len) * railOff, n2y = (t2x / t2len) * railOff;
    const tmx = x2 - x0, tmy = y2 - y0;
    const tmlen = Math.sqrt(tmx * tmx + tmy * tmy) || 1;
    const nmx = (-tmy / tmlen) * railOff, nmy = (tmx / tmlen) * railOff;

    // Build deck shape: outer edge forward, inner edge backward
    ctx.beginPath();
    ctx.moveTo(x0 + n0x, y0 + n0y);
    ctx.quadraticCurveTo(cpx + nmx, cpy + nmy, x2 + n2x, y2 + n2y);
    ctx.lineTo(x2 - n2x, y2 - n2y);
    ctx.quadraticCurveTo(cpx - nmx, cpy - nmy, x0 - n0x, y0 - n0y);
    ctx.closePath();

    // Fill deck
    const deckColor = depth === 1 ? '#8D6E4C' : depth === 2 ? '#808890' : '#404850';
    ctx.fillStyle = deckColor;
    ctx.fill();

    // Edge lines (railings)
    const edgeColor = depth === 1 ? '#A1887F' : depth === 2 ? '#606870' : '#606870';
    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0 + n0x, y0 + n0y);
    ctx.quadraticCurveTo(cpx + nmx, cpy + nmy, x2 + n2x, y2 + n2y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x0 - n0x, y0 - n0y);
    ctx.quadraticCurveTo(cpx - nmx, cpy - nmy, x2 - n2x, y2 - n2y);
    ctx.stroke();

    // Detail: cross planks / stone joints along the curve
    const detailColor = depth === 1 ? '#6D5030' : depth === 2 ? '#687078' : '#505860';
    ctx.strokeStyle = detailColor;
    ctx.lineWidth = depth === 1 ? 0.5 : 0.5;
    const plankCount = depth === 1 ? 7 : 5;
    for (let i = 1; i < plankCount; i++) {
      const t = i / plankCount;
      const bx = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cpx + t * t * x2;
      const by = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cpy + t * t * y2;
      const btx = 2 * (1 - t) * (cpx - x0) + 2 * t * (x2 - cpx);
      const bty = 2 * (1 - t) * (cpy - y0) + 2 * t * (y2 - cpy);
      const btlen = Math.sqrt(btx * btx + bty * bty) || 1;
      const bnx = (-bty / btlen) * halfW, bny = (btx / btlen) * halfW;
      ctx.beginPath();
      ctx.moveTo(bx + bnx, by + bny);
      ctx.lineTo(bx - bnx, by - bny);
      ctx.stroke();
    }

    // Depth-specific embellishments
    if (depth === 1) {
      // Wooden posts at both ends
      ctx.fillStyle = '#5D4037';
      ctx.fillRect(x0 - 2, y0 - 2, 3, 3);
      ctx.fillRect(x2 - 2, y2 - 2, 3, 3);
    } else if (depth === 2) {
      // Stone crenellations along outer edge
      ctx.fillStyle = '#606870';
      const capOff = halfW + 1.5;
      const cn0x = (-t0y / t0len) * capOff, cn0y = (t0x / t0len) * capOff;
      const cn2x = (-t2y / t2len) * capOff, cn2y = (t2x / t2len) * capOff;
      const cnmx = (-tmy / tmlen) * capOff, cnmy = (tmx / tmlen) * capOff;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#606870';
      ctx.beginPath();
      ctx.moveTo(x0 + cn0x, y0 + cn0y);
      ctx.quadraticCurveTo(cpx + cnmx, cpy + cnmy, x2 + cn2x, y2 + cn2y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0 - cn0x, y0 - cn0y);
      ctx.quadraticCurveTo(cpx - cnmx, cpy - cnmy, x2 - cn2x, y2 - cn2y);
      ctx.stroke();
      // Corner posts
      ctx.fillStyle = '#505860';
      ctx.fillRect(x0 - 2, y0 - 2, 4, 4);
      ctx.fillRect(x2 - 2, y2 - 2, 4, 4);
    } else {
      // Iron suspension bridge: inner deck highlight + cable curves
      ctx.fillStyle = '#505860';
      const innerOff = halfW - 2;
      const in0x = (-t0y / t0len) * innerOff, in0y = (t0x / t0len) * innerOff;
      const in2x = (-t2y / t2len) * innerOff, in2y = (t2x / t2len) * innerOff;
      const inmx = (-tmy / tmlen) * innerOff, inmy = (tmx / tmlen) * innerOff;
      ctx.beginPath();
      ctx.moveTo(x0 + in0x, y0 + in0y);
      ctx.quadraticCurveTo(cpx + inmx, cpy + inmy, x2 + in2x, y2 + in2y);
      ctx.lineTo(x2 - in2x, y2 - in2y);
      ctx.quadraticCurveTo(cpx - inmx, cpy - inmy, x0 - in0x, y0 - in0y);
      ctx.closePath();
      ctx.fill();
      // Rivets along edges
      ctx.fillStyle = '#808890';
      for (let i = 1; i <= 3; i++) {
        const t = i / 4;
        const bx = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cpx + t * t * x2;
        const by = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cpy + t * t * y2;
        const btx = 2 * (1 - t) * (cpx - x0) + 2 * t * (x2 - cpx);
        const bty = 2 * (1 - t) * (cpy - y0) + 2 * t * (y2 - cpy);
        const btlen = Math.sqrt(btx * btx + bty * bty) || 1;
        const bnx = (-bty / btlen) * (halfW - 1), bny = (btx / btlen) * (halfW - 1);
        ctx.fillRect(bx + bnx - 1, by + bny - 1, 2, 2);
        ctx.fillRect(bx - bnx - 1, by - bny - 1, 2, 2);
      }
      // Tower posts at ends
      ctx.fillStyle = '#384048';
      ctx.fillRect(x0 - 2, y0 - 3, 4, 6);
      ctx.fillRect(x2 - 2, y2 - 3, 4, 6);
      ctx.fillStyle = '#606870';
      ctx.fillRect(x0 - 3, y0 - 4, 6, 3);
      ctx.fillRect(x2 - 3, y2 - 4, 6, 3);
      // Suspension cables
      ctx.strokeStyle = '#90989F';
      ctx.lineWidth = 1;
      const cableOff = halfW + 4;
      const cb0x = (-t0y / t0len) * cableOff, cb0y = (t0x / t0len) * cableOff;
      const cb2x = (-t2y / t2len) * cableOff, cb2y = (t2x / t2len) * cableOff;
      const sagOff = halfW - 3;
      const sg0x = (-t0y / t0len) * sagOff, sg0y = (t0x / t0len) * sagOff;
      const sg2x = (-t2y / t2len) * sagOff, sg2y = (t2x / t2len) * sagOff;
      const sgmx = (-tmy / tmlen) * sagOff, sgmy = (tmx / tmlen) * sagOff;
      // Outer cable
      ctx.beginPath();
      ctx.moveTo(x0 + cb0x, y0 + cb0y);
      ctx.quadraticCurveTo(cpx + sgmx, cpy + sgmy, x2 + cb2x, y2 + cb2y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0 - cb0x, y0 - cb0y);
      ctx.quadraticCurveTo(cpx - sgmx, cpy - sgmy, x2 - cb2x, y2 - cb2y);
      ctx.stroke();
    }
  }

  private drawTracks(
    ctx: CanvasRenderingContext2D, state: GameState,
    offsetX: number, offsetY: number,
  ): void {
    const half = CELL_SIZE / 2;

    for (const [key, neighbors] of state.trackConnections) {
      const pos = parseKey(key);
      const cx = pos.x * CELL_SIZE + half + offsetX;
      const cy = pos.y * CELL_SIZE + half + offsetY;
      const isTunnel = terrainAt(pos.x, pos.y) === 'mountain';
      ctx.globalAlpha = isTunnel ? 0.25 : 1.0;

      if (neighbors.length === 0) {
        // Isolated track: draw as horizontal segment
        this.drawTrackSegment(ctx, cx - half, cy, cx + half, cy);
        ctx.globalAlpha = 1.0;
        continue;
      }

      // Direction deltas to each neighbor
      const deltas: { dx: number; dy: number }[] = [];
      for (const nk of neighbors) {
        const np = parseKey(nk);
        deltas.push({ dx: np.x - pos.x, dy: np.y - pos.y });
      }

      if (deltas.length === 2) {
        const d0 = deltas[0], d1 = deltas[1];
        const ex0 = cx + d0.dx * half, ey0 = cy + d0.dy * half;
        const ex1 = cx + d1.dx * half, ey1 = cy + d1.dy * half;
        const isStraight = d0.dx + d1.dx === 0 && d0.dy + d1.dy === 0;

        if (isStraight) {
          this.drawTrackSegment(ctx, ex0, ey0, ex1, ey1);
        } else {
          this.drawCurvedTrack(ctx, ex0, ey0, cx, cy, ex1, ey1);
        }
      } else {
        // Junction (3+) or dead end (1): straight from center to each edge
        for (const d of deltas) {
          this.drawTrackSegment(ctx, cx, cy, cx + d.dx * half, cy + d.dy * half);
        }
      }
      ctx.globalAlpha = 1.0;
    }

    // Tunnel entrance arches
    for (const [key, neighbors] of state.trackConnections) {
      const pos = parseKey(key);
      if (terrainAt(pos.x, pos.y) !== 'mountain') continue;
      if (neighbors.length === 0) continue;
      const sx = pos.x * CELL_SIZE + offsetX;
      const sy = pos.y * CELL_SIZE + offsetY;
      ctx.fillStyle = 'rgba(40, 30, 20, 0.6)';
      ctx.beginPath(); ctx.arc(sx + half, sy + half + 2, 10, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(100, 80, 60, 0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx + half, sy + half + 2, 10, Math.PI, 0); ctx.stroke();
    }
  }

  private drawTrackSegment(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number, x2: number, y2: number,
  ): void {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const nx = (-dy / len) * 2.5, ny = (dx / len) * 2.5;

    // Bed
    ctx.strokeStyle = '#4A3728'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    // Rails
    ctx.strokeStyle = '#C0C0C0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x1 + nx, y1 + ny); ctx.lineTo(x2 + nx, y2 + ny); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1 - nx, y1 - ny); ctx.lineTo(x2 - nx, y2 - ny); ctx.stroke();
    // Cross ties
    ctx.strokeStyle = '#6D5840'; ctx.lineWidth = 1.5;
    const tnx = (-dy / len) * 4, tny = (dx / len) * 4;
    const steps = Math.max(2, Math.round(len / 8));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const mx = x1 + dx * t, my = y1 + dy * t;
      ctx.beginPath(); ctx.moveTo(mx + tnx, my + tny); ctx.lineTo(mx - tnx, my - tny); ctx.stroke();
    }
  }

  private drawCurvedTrack(
    ctx: CanvasRenderingContext2D,
    x0: number, y0: number, cpx: number, cpy: number, x2: number, y2: number,
  ): void {
    // Bed
    ctx.strokeStyle = '#4A3728'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cpx, cpy, x2, y2); ctx.stroke();

    // Rails — offset using local normals at endpoints and midpoint
    const railOff = 2.5;
    // Normal at start: perpendicular to tangent (cpx-x0, cpy-y0)
    const t0x = cpx - x0, t0y = cpy - y0;
    const t0len = Math.sqrt(t0x * t0x + t0y * t0y) || 1;
    const n0x = (-t0y / t0len) * railOff, n0y = (t0x / t0len) * railOff;
    // Normal at end: perpendicular to tangent (x2-cpx, y2-cpy)
    const t2x = x2 - cpx, t2y = y2 - cpy;
    const t2len = Math.sqrt(t2x * t2x + t2y * t2y) || 1;
    const n2x = (-t2y / t2len) * railOff, n2y = (t2x / t2len) * railOff;
    // Normal at control point: perpendicular to (x2-x0, y2-y0)
    const tmx = x2 - x0, tmy = y2 - y0;
    const tmlen = Math.sqrt(tmx * tmx + tmy * tmy) || 1;
    const nmx = (-tmy / tmlen) * railOff, nmy = (tmx / tmlen) * railOff;

    ctx.strokeStyle = '#C0C0C0'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0 + n0x, y0 + n0y);
    ctx.quadraticCurveTo(cpx + nmx, cpy + nmy, x2 + n2x, y2 + n2y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x0 - n0x, y0 - n0y);
    ctx.quadraticCurveTo(cpx - nmx, cpy - nmy, x2 - n2x, y2 - n2y);
    ctx.stroke();

    // Cross ties along curve
    ctx.strokeStyle = '#6D5840'; ctx.lineWidth = 1.5;
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      const bx = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cpx + t * t * x2;
      const by = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cpy + t * t * y2;
      const btx = 2 * (1 - t) * (cpx - x0) + 2 * t * (x2 - cpx);
      const bty = 2 * (1 - t) * (cpy - y0) + 2 * t * (y2 - cpy);
      const btlen = Math.sqrt(btx * btx + bty * bty) || 1;
      const bnx = (-bty / btlen) * 4, bny = (btx / btlen) * 4;
      ctx.beginPath(); ctx.moveTo(bx + bnx, by + bny); ctx.lineTo(bx - bnx, by - bny); ctx.stroke();
    }
  }

  private drawStations(
    ctx: CanvasRenderingContext2D, state: GameState,
    offsetX: number, offsetY: number,
  ): void {
    if (!this.stationSprite) return;
    for (const s of state.stations) {
      const sx = s.position.x * CELL_SIZE + offsetX;
      const sy = s.position.y * CELL_SIZE + offsetY;

      // Draw JRPG building sprite
      ctx.drawImage(this.stationSprite, sx, sy);

      // Station name above
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.font = 'bold 10px Courier New';
      ctx.textAlign = 'center';
      ctx.strokeText(s.name, sx + CELL_SIZE / 2, sy - 3);
      ctx.fillText(s.name, sx + CELL_SIZE / 2, sy - 3);

      // Waiting passengers below
      if (s.waitingPassengers > 0) {
        ctx.fillStyle = '#FFD700';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.font = 'bold 10px Courier New';
        ctx.strokeText(`${s.waitingPassengers}`, sx + CELL_SIZE / 2, sy + CELL_SIZE + 11);
        ctx.fillText(`${s.waitingPassengers}`, sx + CELL_SIZE / 2, sy + CELL_SIZE + 11);
      }
    }
  }

  private drawStreetLights(
    ctx: CanvasRenderingContext2D, state: GameState,
    offsetX: number, offsetY: number,
  ): void {
    const half = CELL_SIZE / 2;
    for (const sl of state.streetLights) {
      const sx = sl.x * CELL_SIZE + offsetX;
      const sy = sl.y * CELL_SIZE + offsetY;

      // Pole
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx + half, sy + CELL_SIZE - 4);
      ctx.lineTo(sx + half, sy + 6);
      ctx.stroke();

      // Arm
      ctx.beginPath();
      ctx.moveTo(sx + half, sy + 8);
      ctx.lineTo(sx + half + 5, sy + 6);
      ctx.stroke();

      // Lamp head
      ctx.fillStyle = '#FFE082';
      ctx.beginPath();
      ctx.arc(sx + half + 5, sy + 5, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#A08040';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Base
      ctx.fillStyle = '#666';
      ctx.fillRect(sx + half - 3, sy + CELL_SIZE - 4, 6, 3);
    }
  }

  private static TRAIN_COLORS: { bg: string; fg: string }[] = [
    { bg: '#D7D79B', fg: '#000000' },
    { bg: '#A0C6C7', fg: '#000000' },
    { bg: '#80BF7F', fg: '#000000' },
    { bg: '#6171A2', fg: '#000000' },
    { bg: '#8B8B8C', fg: '#000000' },
    { bg: '#A35363', fg: '#000000' },
    { bg: '#C1C1C1', fg: '#000000' },
    { bg: '#99602F', fg: '#000000' },
    { bg: '#0E0C0F', fg: '#7A0C1A' },
  ];

  private drawTrains(
    ctx: CanvasRenderingContext2D, state: GameState,
    offsetX: number, offsetY: number, nightAlpha: number,
  ): void {
    const dimAlpha = nightAlpha > 0.05 ? 1 - nightAlpha * 0.5 : 1;
    for (const t of state.trains) {
      if (terrainAt(t.position.x, t.position.y) === 'mountain') continue;
      const cx = t.position.x * CELL_SIZE + CELL_SIZE / 2 + offsetX;
      const cy = t.position.y * CELL_SIZE + CELL_SIZE / 2 + offsetY;
      const r = CELL_SIZE / 3;
      const idx = Math.max(0, Math.min(8, parseInt(t.id, 10) - 1));
      const colors = Renderer.TRAIN_COLORS[idx];

      ctx.globalAlpha = dimAlpha;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = colors.bg; ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = colors.fg; ctx.font = 'bold 11px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t.id, cx, cy);
      ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha = 1;
    }
  }

  private drawCursor(
    ctx: CanvasRenderingContext2D, cursor: Pos,
    offsetX: number, offsetY: number,
  ): void {
    const sx = cursor.x * CELL_SIZE + offsetX;
    const sy = cursor.y * CELL_SIZE + offsetY;
    const pulse = Math.sin(this.frameCount * 0.1) * 0.3 + 0.7;
    ctx.strokeStyle = `rgba(255, 255, 255, ${pulse})`; ctx.lineWidth = 3;
    ctx.strokeRect(sx + 1, sy + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    const corner = 8;
    ctx.strokeStyle = `rgba(255, 215, 0, ${pulse})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx,sy+corner); ctx.lineTo(sx,sy); ctx.lineTo(sx+corner,sy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx+CELL_SIZE-corner,sy); ctx.lineTo(sx+CELL_SIZE,sy); ctx.lineTo(sx+CELL_SIZE,sy+corner); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx,sy+CELL_SIZE-corner); ctx.lineTo(sx,sy+CELL_SIZE); ctx.lineTo(sx+corner,sy+CELL_SIZE); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx+CELL_SIZE-corner,sy+CELL_SIZE); ctx.lineTo(sx+CELL_SIZE,sy+CELL_SIZE); ctx.lineTo(sx+CELL_SIZE,sy+CELL_SIZE-corner); ctx.stroke();
  }

  private drawMinimap(
    ctx: CanvasRenderingContext2D, state: GameState,
    cameraX: number, cameraY: number, cursor: Pos,
  ): void {
    if (!this.minimapTerrain) return;

    const r = this.getMinimapRect();
    const mx = r.x;
    const my = r.y;
    const ms = MINIMAP_SIZE;
    const scaleX = ms / GRID_WIDTH;
    const scaleY = ms / GRID_HEIGHT;

    // Background + border
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(mx - 2, my - 2, ms + 4, ms + 4);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx - 2, my - 2, ms + 4, ms + 4);

    // Pre-rendered terrain
    ctx.drawImage(this.minimapTerrain, mx, my);

    // Track nodes as small white dots
    ctx.fillStyle = '#CCCCCC';
    for (const [key] of state.trackConnections) {
      const pos = parseKey(key);
      const px = mx + pos.x * scaleX;
      const py = my + pos.y * scaleY;
      ctx.fillRect(px, py, 1.5, 1.5);
    }

    // Stations as red dots
    ctx.fillStyle = '#FF3333';
    for (const s of state.stations) {
      const px = mx + s.position.x * scaleX;
      const py = my + s.position.y * scaleY;
      ctx.fillRect(px - 1, py - 1, 3, 3);
    }

    // Trains as cyan dots
    ctx.fillStyle = '#00FFFF';
    for (const t of state.trains) {
      const px = mx + t.position.x * scaleX;
      const py = my + t.position.y * scaleY;
      ctx.fillRect(px - 1, py - 1, 3, 3);
    }

    // Cursor as yellow dot
    ctx.fillStyle = '#FFD700';
    const cpx = mx + cursor.x * scaleX;
    const cpy = my + cursor.y * scaleY;
    ctx.fillRect(cpx - 2, cpy - 2, 4, 4);

    // Viewport rectangle
    const w = this.canvas.width;
    const h = this.canvas.height;
    const vpTilesW = w / CELL_SIZE;
    const vpTilesH = h / CELL_SIZE;
    const vpx = mx + (cameraX - vpTilesW / 2) * scaleX;
    const vpy = my + (cameraY - vpTilesH / 2) * scaleY;
    const vpw = vpTilesW * scaleX;
    const vph = vpTilesH * scaleY;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.strokeRect(vpx, vpy, vpw, vph);
  }

  private getDirVec(dir: Direction): { x: number; y: number } {
    const v: Record<Direction, { x: number; y: number }> = {
      N: { x: 0, y: -1 }, NE: { x: 0.7, y: -0.7 }, E: { x: 1, y: 0 },
      SE: { x: 0.7, y: 0.7 }, S: { x: 0, y: 1 }, SW: { x: -0.7, y: 0.7 },
      W: { x: -1, y: 0 }, NW: { x: -0.7, y: -0.7 },
    };
    return v[dir];
  }

  getCellSize(): number {
    return CELL_SIZE;
  }

  screenToWorld(screenX: number, screenY: number, cameraX: number, cameraY: number): Pos {
    const offsetX = this.canvas.width / 2 - cameraX * CELL_SIZE;
    const offsetY = this.canvas.height / 2 - cameraY * CELL_SIZE;
    return {
      x: Math.floor((screenX - offsetX) / CELL_SIZE),
      y: Math.floor((screenY - offsetY) / CELL_SIZE),
    };
  }
}
