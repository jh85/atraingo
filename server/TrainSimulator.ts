import type { Train } from '../shared/types.js';
import { parseKey, oppositeDir, directionFromTo } from '../shared/directions.js';
import { TRAIN_MOVE_TICKS } from '../shared/constants.js';
import type { TrackNetwork } from './TrackNetwork.js';

export class TrainSimulator {
  private moveCooldowns: Map<string, number> = new Map();

  // Returns IDs of trains that just arrived at a station this tick
  tick(trains: Train[], tracks: TrackNetwork, stationKeys: Set<string>): string[] {
    const arrivals: string[] = [];

    // Move trains
    for (const train of trains) {
      if (train.state === 'stopped') continue;
      if (train.state === 'at_station') {
        train.stationTimer--;
        if (train.stationTimer <= 0) {
          train.state = 'moving';
          train.stationTimer = 0;
        }
        continue;
      }

      // Movement cooldown
      const cd = (this.moveCooldowns.get(train.id) ?? 0) + 1;
      if (cd < TRAIN_MOVE_TICKS) {
        this.moveCooldowns.set(train.id, cd);
        continue;
      }
      this.moveCooldowns.set(train.id, 0);

      // Find next cell
      const nextKey = tracks.getNextCell(train.position, train.heading);
      if (!nextKey) {
        // Dead end: reverse heading and wait a beat before trying again
        train.heading = oppositeDir(train.heading);
        continue;
      }

      const nextPos = parseKey(nextKey);
      const newHeading = directionFromTo(train.position, nextPos);
      if (newHeading) {
        train.heading = newHeading;
      }
      train.position = nextPos;

      // Check if arrived at a station
      if (stationKeys.has(nextKey)) {
        train.state = 'at_station';
        arrivals.push(train.id);
      }
    }

    // Collision detection: if two trains are on the same cell, both reverse
    for (let i = 0; i < trains.length; i++) {
      for (let j = i + 1; j < trains.length; j++) {
        if (trains[i].position.x === trains[j].position.x &&
            trains[i].position.y === trains[j].position.y) {
          trains[i].heading = oppositeDir(trains[i].heading);
          trains[j].heading = oppositeDir(trains[j].heading);
          if (trains[i].state === 'at_station') trains[i].state = 'moving';
          if (trains[j].state === 'at_station') trains[j].state = 'moving';
        }
      }
    }

    return arrivals;
  }
}
