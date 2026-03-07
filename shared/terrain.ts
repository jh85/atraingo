import type { TerrainType } from './types.js';
import { GRID_WIDTH, GRID_HEIGHT, MAP_SEED, TRACK_COST, BRIDGE_COST_SHALLOW, BRIDGE_COST_MEDIUM, BRIDGE_COST_DEEP, TUNNEL_COST } from './constants.js';

// Deterministic hash -> [0, 1)
function hash(x: number, y: number, seed: number): number {
  let h = (seed + x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return ((h & 0x7fffffff) / 0x7fffffff);
}

// Value noise with smoothstep interpolation
function valueNoise(px: number, py: number, seed: number, scale: number): number {
  const sx = px / scale;
  const sy = py / scale;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const fx = sx - x0;
  const fy = sy - y0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);

  const n00 = hash(x0, y0, seed);
  const n10 = hash(x0 + 1, y0, seed);
  const n01 = hash(x0, y0 + 1, seed);
  const n11 = hash(x0 + 1, y0 + 1, seed);

  const i0 = n00 + (n10 - n00) * u;
  const i1 = n01 + (n11 - n01) * u;
  return i0 + (i1 - i0) * v;
}

// Multi-octave fractal noise
function fbm(x: number, y: number, seed: number): number {
  return (
    valueNoise(x, y, seed, 120) * 0.45 +
    valueNoise(x, y, seed + 1000, 60) * 0.25 +
    valueNoise(x, y, seed + 2000, 30) * 0.18 +
    valueNoise(x, y, seed + 3000, 14) * 0.12
  );
}

function elevationAt(x: number, y: number): number {
  const cx = GRID_WIDTH / 2;
  const cy = GRID_HEIGHT / 2;
  const dx = (x - cx) / cx;
  const dy = (y - cy) / cy;
  const distFromCenter = Math.sqrt(dx * dx + dy * dy);
  const islandShape = Math.max(0, 1.0 - distFromCenter * 1.1);
  return islandShape * 0.55 + fbm(x, y, MAP_SEED) * 0.45;
}

// Get terrain type for a given world coordinate
export function terrainAt(x: number, y: number): TerrainType {
  const elevation = elevationAt(x, y);
  const moisture = fbm(x, y, MAP_SEED + 5000);

  // Rivers: thin winding bands using noise contour lines
  if (elevation > 0.33 && elevation < 0.60) {
    const river1 = valueNoise(x, y, MAP_SEED + 7000, 80) * 0.65
                 + valueNoise(x, y, MAP_SEED + 7500, 35) * 0.35;
    if (Math.abs(river1 - 0.5) < 0.012) return 'water';

    const river2 = valueNoise(x, y, MAP_SEED + 8000, 90) * 0.6
                 + valueNoise(x, y, MAP_SEED + 8500, 40) * 0.4;
    if (Math.abs(river2 - 0.5) < 0.010) return 'water';
  }

  // Lakes: pockets of water inland
  if (elevation > 0.34 && elevation < 0.50) {
    const lakeNoise = valueNoise(x, y, MAP_SEED + 9000, 35);
    if (lakeNoise > 0.83) return 'water';
  }

  if (elevation < 0.28) return 'water';
  if (elevation < 0.33) return 'sand';
  if (elevation > 0.68) return 'mountain';
  if (elevation > 0.35 && moisture > 0.52) return 'forest';
  return 'grass';
}

// Water depth: 1=shallow, 2=medium, 3=deep (only meaningful for water tiles)
export function waterDepthAt(x: number, y: number): number {
  const elevation = elevationAt(x, y);
  // Rivers/lakes (elevation >= ocean threshold) are always shallow
  if (elevation >= 0.20) return 1;
  if (elevation >= 0.12) return 2;
  return 3;
}

// Get the cost to build a track at this position
export function trackCostAt(x: number, y: number): number {
  const terrain = terrainAt(x, y);
  if (terrain === 'water') {
    const depth = waterDepthAt(x, y);
    if (depth === 3) return BRIDGE_COST_DEEP;
    if (depth === 2) return BRIDGE_COST_MEDIUM;
    return BRIDGE_COST_SHALLOW;
  }
  if (terrain === 'mountain') return TUNNEL_COST;
  return TRACK_COST;
}
