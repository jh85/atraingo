import type { Direction, Pos } from './types.js';

// Direction vectors: dx, dy (y increases downward)
export const DIR_VECTORS: Record<Direction, Pos> = {
  N:  { x:  0, y: -1 },
  NE: { x:  1, y: -1 },
  E:  { x:  1, y:  0 },
  SE: { x:  1, y:  1 },
  S:  { x:  0, y:  1 },
  SW: { x: -1, y:  1 },
  W:  { x: -1, y:  0 },
  NW: { x: -1, y: -1 },
};

export const ALL_DIRECTIONS: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// Direction index (clockwise from N)
const DIR_INDEX: Record<Direction, number> = {
  N: 0, NE: 1, E: 2, SE: 3, S: 4, SW: 5, W: 6, NW: 7,
};

const INDEX_DIR: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function oppositeDir(d: Direction): Direction {
  return INDEX_DIR[(DIR_INDEX[d] + 4) % 8];
}

// Returns the absolute angular difference in 45-degree steps (0-4)
export function angleDiff(a: Direction, b: Direction): number {
  let diff = DIR_INDEX[b] - DIR_INDEX[a];
  if (diff < 0) diff += 8;
  if (diff > 4) diff = 8 - diff;
  return diff;
}

// Returns the relative angle (in 45-degree steps) from heading to target direction
// 0 = straight, 1 = 45° right, -1 = 45° left, 2 = 90° right, etc.
function relativeAngle(heading: Direction, target: Direction): number {
  let diff = DIR_INDEX[target] - DIR_INDEX[heading];
  if (diff > 4) diff -= 8;
  if (diff < -4) diff += 8;
  return diff;
}

// Get allowed directions from a given heading (6 directions, excluding ±90°)
export function getAllowedDirections(heading: Direction): Direction[] {
  return ALL_DIRECTIONS.filter(d => {
    const angle = Math.abs(relativeAngle(heading, d));
    return angle !== 2; // exclude ±90° (2 steps of 45°)
  });
}

// Check if moving from heading to direction is allowed
export function isTurnAllowed(heading: Direction, target: Direction): boolean {
  const angle = Math.abs(relativeAngle(heading, target));
  return angle !== 2;
}

// Apply direction to position
export function movePos(pos: Pos, dir: Direction): Pos {
  const v = DIR_VECTORS[dir];
  return { x: pos.x + v.x, y: pos.y + v.y };
}

// Serialize/deserialize position keys
export function posKey(pos: Pos): string {
  return `${pos.x},${pos.y}`;
}

export function parseKey(key: string): Pos {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

// Manhattan distance on grid
export function gridDistance(a: Pos, b: Pos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// Get direction from pos a to adjacent pos b
export function directionFromTo(a: Pos, b: Pos): Direction | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const dir of ALL_DIRECTIONS) {
    const v = DIR_VECTORS[dir];
    if (v.x === dx && v.y === dy) return dir;
  }
  return null;
}
