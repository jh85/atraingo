import type { Direction, Pos } from '../shared/types.js';
import { posKey, parseKey, movePos, oppositeDir, directionFromTo, angleDiff } from '../shared/directions.js';

export class TrackNetwork {
  connections: Map<string, Set<string>> = new Map();
  branchDefaults: Map<string, Direction> = new Map();

  hasNode(key: string): boolean {
    return this.connections.has(key);
  }

  getConnections(key: string): Set<string> {
    return this.connections.get(key) ?? new Set();
  }

  addTrack(from: Pos, to: Pos): void {
    const fk = posKey(from);
    const tk = posKey(to);
    if (!this.connections.has(fk)) this.connections.set(fk, new Set());
    if (!this.connections.has(tk)) this.connections.set(tk, new Set());
    this.connections.get(fk)!.add(tk);
    this.connections.get(tk)!.add(fk);
  }

  hasConnection(from: Pos, to: Pos): boolean {
    const conns = this.connections.get(posKey(from));
    return conns ? conns.has(posKey(to)) : false;
  }

  connectionCount(key: string): number {
    return this.getConnections(key).size;
  }

  isDeadEnd(key: string): boolean {
    return this.connectionCount(key) === 1;
  }

  // Get the next cell for a train at `pos` traveling in direction `heading`.
  // Returns the next position key, or null if no connections.
  getNextCell(pos: Pos, heading: Direction): string | null {
    const pk = posKey(pos);
    const neighbors = this.getConnections(pk);
    if (neighbors.size === 0) return null;

    const neighborKeys = Array.from(neighbors);

    // 1 connection: dead end — go to the only neighbor (may be U-turn)
    if (neighborKeys.length === 1) return neighborKeys[0];

    // The cell we came from
    const cameFromKey = posKey(movePos(pos, oppositeDir(heading)));

    // 2 connections: go in the non-reverse direction
    if (neighborKeys.length === 2) {
      const forward = neighborKeys.filter(k => k !== cameFromKey);
      return forward.length > 0 ? forward[0] : neighborKeys[0];
    }

    // 3+ connections (junction):
    // Filter out (a) reverse and (b) acute turns (90° or sharper)
    const candidates = neighborKeys.filter(k => {
      if (k === cameFromKey) return false;
      const np = parseKey(k);
      const dir = directionFromTo(pos, np);
      if (!dir) return false;
      return angleDiff(heading, dir) < 2; // only allow straight (0) and 45° (1)
    });

    if (candidates.length === 0) {
      // No valid direction: reverse
      return cameFromKey;
    }
    if (candidates.length === 1) return candidates[0];

    // Multiple valid directions: choose randomly
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  removeNode(key: string): void {
    const neighbors = this.connections.get(key);
    if (neighbors) {
      // Remove this node from all neighbors' connection sets
      for (const nk of neighbors) {
        this.connections.get(nk)?.delete(key);
      }
    }
    this.connections.delete(key);
    this.branchDefaults.delete(key);
  }

  setBranchDefault(key: string, direction: Direction): void {
    this.branchDefaults.set(key, direction);
  }

  serialize(): { connections: [string, string[]][]; branchDefaults: [string, Direction][] } {
    const conns: [string, string[]][] = [];
    for (const [key, set] of this.connections) {
      conns.push([key, Array.from(set)]);
    }
    return {
      connections: conns,
      branchDefaults: Array.from(this.branchDefaults.entries()),
    };
  }
}
