import type { Train } from '../shared/types.js';
import { posKey, parseKey, oppositeDir, directionFromTo } from '../shared/directions.js';
import { TRAIN_MOVE_TICKS } from '../shared/constants.js';
import type { TrackNetwork } from './TrackNetwork.js';

export class TrainSimulator {
  private moveCooldowns: Map<string, number> = new Map();
  private blockedTicks: Map<string, number> = new Map();

  // Returns IDs of trains that just arrived at a station cell this tick
  tick(trains: Train[], tracks: TrackNetwork, stationKeys: Set<string>): string[] {
    const arrivals: string[] = [];

    // Build occupancy map for collision checking
    const occupied = new Map<string, string>();
    for (const train of trains) {
      occupied.set(posKey(train.position), train.id);
    }

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

      // Blocked cooldown
      const bt = this.blockedTicks.get(train.id) ?? 0;
      if (bt > 0) {
        this.blockedTicks.set(train.id, bt - 1);
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
        train.heading = oppositeDir(train.heading);
        continue;
      }

      // Collision avoidance: block if next cell is occupied AND not a station
      const occupant = occupied.get(nextKey);
      if (occupant && occupant !== train.id && !stationKeys.has(nextKey)) {
        this.blockedTicks.set(train.id, 2);
        continue;
      }

      // Move
      occupied.delete(posKey(train.position));
      const nextPos = parseKey(nextKey);
      const newHeading = directionFromTo(train.position, nextPos);
      if (newHeading) {
        train.heading = newHeading;
      }
      train.position = nextPos;
      train.cellsSinceLastStop++;
      occupied.set(nextKey, train.id);

      // Check if arrived at a station cell
      if (stationKeys.has(nextKey)) {
        arrivals.push(train.id);
      }
    }

    return arrivals;
  }
}
