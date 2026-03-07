import type { Train, Station } from '../shared/types.js';
import { gridDistance } from '../shared/directions.js';
import {
  MAX_WAITING_PASSENGERS,
  TRAIN_CAPACITY,
  STATION_STOP_TICKS,
  REVENUE_PER_PASSENGER_PER_DIST,
  BASE_PASSENGER_RATE,
} from '../shared/constants.js';

export class PassengerSystem {
  // Stations generate passengers at a base rate + traffic bonus
  generatePassengers(stations: Station[]): void {
    for (const station of stations) {
      const rate = BASE_PASSENGER_RATE + Math.floor(station.trafficScore / 100);
      station.waitingPassengers = Math.min(
        station.waitingPassengers + rate,
        MAX_WAITING_PASSENGERS,
      );
    }
  }

  // Handle boarding and exiting at stations. Returns revenue earned.
  handleStationStop(train: Train, stations: Station[]): number {
    const stationAtPos = stations.find(
      s => s.position.x === train.position.x && s.position.y === train.position.y
    );
    if (!stationAtPos) return 0;

    let revenue = 0;

    // Passengers exit
    if (train.passengers > 0 && train.boardedAtStation) {
      const dist = gridDistance(train.boardedAtStation, train.position);
      revenue = dist * train.passengers * REVENUE_PER_PASSENGER_PER_DIST;
      stationAtPos.trafficScore += train.passengers;
      train.passengers = 0;
      train.boardedAtStation = null;
    }

    // Passengers board
    const boarding = Math.min(stationAtPos.waitingPassengers, TRAIN_CAPACITY);
    if (boarding > 0) {
      train.passengers = boarding;
      train.boardedAtStation = { ...stationAtPos.position };
      stationAtPos.waitingPassengers -= boarding;
      stationAtPos.trafficScore += boarding;
    }

    train.stationTimer = STATION_STOP_TICKS;
    return revenue;
  }
}
