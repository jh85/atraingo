import type { Train, Station, Player, Direction, GameState, GameTime, ClientMessage, Pos } from '../shared/types.js';
import {
  GRID_WIDTH, GRID_HEIGHT, STARTING_MONEY, STATION_COST, TRAIN_COST, STREETLIGHT_COST,
  TICK_INTERVAL, PASSENGER_GEN_TICKS, STATION_STOP_TICKS, MAP_SEED,
  MINUTES_PER_TICK, START_HOUR, TAX_INTERVAL_DAYS, TRACK_TAX_PER_TILE,
} from '../shared/constants.js';
import { posKey, parseKey, movePos, directionFromTo, oppositeDir, angleDiff, ALL_DIRECTIONS } from '../shared/directions.js';
import { terrainAt, trackCostAt } from '../shared/terrain.js';
import { TrackNetwork } from './TrackNetwork.js';
import { TrainSimulator } from './TrainSimulator.js';
import { PassengerSystem } from './PassengerSystem.js';

export class GameWorld {
  tracks: TrackNetwork = new TrackNetwork();
  trains: Train[] = [];
  stations: Station[] = [];
  streetLights: Pos[] = [];
  player: Player;

  private trainSim = new TrainSimulator();
  private passengerSys = new PassengerSystem();
  private tickCount = 0;
  private nextTrainId = 1;
  private stationCount = 0;
  private onUpdate: (() => void) | null = null;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private time: GameTime = { day: 1, hour: START_HOUR, minute: 0 };
  private lastTaxDay = 0;
  private lastTaxAmount = 0;
  private onTax: ((amount: number) => void) | null = null;
  private onAutoSave: (() => void) | null = null;

  constructor() {
    this.player = {
      id: 'player1',
      money: STARTING_MONEY,
    };
  }

  setUpdateCallback(cb: () => void): void {
    this.onUpdate = cb;
  }

  setTaxCallback(cb: (amount: number) => void): void {
    this.onTax = cb;
  }

  setAutoSaveCallback(cb: () => void): void {
    this.onAutoSave = cb;
  }

  start(): void {
    this.intervalHandle = setInterval(() => this.tick(), TICK_INTERVAL);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private getStationKeys(): Set<string> {
    return new Set(this.stations.map(s => posKey(s.position)));
  }

  private advanceTime(): void {
    this.time.minute += MINUTES_PER_TICK;
    if (this.time.minute >= 60) {
      this.time.minute -= 60;
      this.time.hour++;
      if (this.time.hour >= 24) {
        this.time.hour = 0;
        this.time.day++;
        this.checkTax();
        this.onAutoSave?.();
      }
    }
  }

  private checkTax(): void {
    const taxDay = Math.floor(this.time.day / TAX_INTERVAL_DAYS);
    if (taxDay > this.lastTaxDay && this.time.day % TAX_INTERVAL_DAYS === 0) {
      this.lastTaxDay = taxDay;
      const trackCount = this.tracks.connections.size;
      const tax = trackCount * TRACK_TAX_PER_TILE;
      if (tax > 0) {
        this.lastTaxAmount = Math.min(tax, this.player.money);
        this.player.money = Math.max(0, this.player.money - tax);
        this.onTax?.(tax);
      }
    }
  }

  private tick(): void {
    this.tickCount++;
    this.advanceTime();

    if (this.trains.length === 0) {
      this.onUpdate?.();
      return;
    }

    const stationKeys = this.getStationKeys();
    const arrivals = this.trainSim.tick(this.trains, this.tracks, stationKeys);

    for (const trainId of arrivals) {
      const train = this.trains.find(t => t.id === trainId);
      if (train) {
        const station = this.stations.find(s => posKey(s.position) === posKey(train.position));
        if (station) {
          train.stationHistory.push({ name: station.name, day: this.time.day });
          if (train.stationHistory.length > 5) train.stationHistory.shift();
        }
        const revenue = this.passengerSys.handleStationStop(train, this.stations);
        this.player.money += revenue;
      }
    }

    if (this.tickCount % PASSENGER_GEN_TICKS === 0) {
      this.passengerSys.generatePassengers(this.stations);
    }

    this.onUpdate?.();
  }

  handleAction(msg: ClientMessage): { success: boolean; error?: string } {
    switch (msg.type) {
      case 'place_track':
        return this.placeTrack(msg.position);
      case 'place_station':
        return this.placeStation(msg.position);
      case 'buy_train':
        return this.buyTrain(msg.stationKey);
      case 'connect_track':
        return this.connectTrack(msg.from, msg.to);
      case 'place_streetlight':
        return this.placeStreetLight(msg.position);
      case 'set_branch_direction':
        return this.setBranchDirection(msg.posKey, msg.direction);
      default:
        return { success: false, error: 'Unknown action' };
    }
  }

  private placeTrack(position: Pos): { success: boolean; error?: string } {
    const pk = posKey(position);

    if (position.x < 0 || position.x >= GRID_WIDTH || position.y < 0 || position.y >= GRID_HEIGHT) {
      return { success: false, error: 'Out of bounds' };
    }

    if (this.tracks.hasNode(pk)) {
      // Priority: station → train → track
      const stationIdx = this.stations.findIndex(s => posKey(s.position) === pk);
      if (stationIdx >= 0) {
        return this.removeStation(stationIdx);
      }
      const trainIdx = this.trains.findIndex(t => posKey(t.position) === pk);
      if (trainIdx >= 0) {
        return this.removeTrain(trainIdx);
      }
      return this.removeTrack(position, pk);
    }

    const cost = trackCostAt(position.x, position.y);
    if (this.player.money < cost) {
      return { success: false, error: 'Not enough money' };
    }

    this.player.money -= cost;

    // Create node
    this.tracks.connections.set(pk, new Set());

    // Find adjacent existing track nodes
    const adjacentTracks: Pos[] = [];
    for (const dir of ALL_DIRECTIONS) {
      const neighbor = movePos(position, dir);
      const nk = posKey(neighbor);
      if (this.tracks.hasNode(nk)) {
        adjacentTracks.push(neighbor);
      }
    }

    // Auto-connect only if 1-2 neighbors; 3+ = no auto-connections
    if (adjacentTracks.length <= 2) {
      for (const neighbor of adjacentTracks) {
        this.tracks.addTrack(position, neighbor);
      }
    }

    this.onUpdate?.();
    return { success: true };
  }

  private removeStation(stationIdx: number): { success: boolean; error?: string } {
    const station = this.stations[stationIdx];
    const pk = posKey(station.position);

    // Can't remove if a train is stopped at this station
    if (this.trains.some(t => posKey(t.position) === pk && t.state === 'at_station')) {
      return { success: false, error: 'Train is at this station' };
    }

    this.stations.splice(stationIdx, 1);
    this.player.money += STATION_COST;

    this.onUpdate?.();
    return { success: true };
  }

  private removeTrain(trainIdx: number): { success: boolean; error?: string } {
    this.trains.splice(trainIdx, 1);
    this.player.money += TRAIN_COST;
    this.onUpdate?.();
    return { success: true };
  }

  private removeTrack(position: Pos, pk: string): { success: boolean; error?: string } {

    // Can't remove if a train is on this cell
    if (this.trains.some(t => posKey(t.position) === pk)) {
      return { success: false, error: 'Train is on this track' };
    }

    // Remove node and all its edges — refund based on terrain
    this.tracks.removeNode(pk);
    this.player.money += trackCostAt(position.x, position.y);

    this.onUpdate?.();
    return { success: true };
  }

  private connectTrack(from: Pos, to: Pos): { success: boolean; error?: string } {
    const fk = posKey(from);
    const tk = posKey(to);

    if (!this.tracks.hasNode(fk)) {
      return { success: false, error: 'No track at source' };
    }
    if (!this.tracks.hasNode(tk)) {
      return { success: false, error: 'No track at target' };
    }

    // Must be adjacent
    const dx = to.x - from.x, dy = to.y - from.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) {
      return { success: false, error: 'Tracks must be adjacent' };
    }

    if (this.tracks.hasConnection(from, to)) {
      // Already connected: disconnect instead
      this.tracks.getConnections(fk).delete(tk);
      this.tracks.getConnections(tk).delete(fk);
      this.onUpdate?.();
      return { success: true };
    }

    // 90° restriction: new connection must not form 90° with existing connections
    const dirFT = directionFromTo(from, to);
    if (!dirFT) return { success: false, error: 'Invalid direction' };
    const dirTF = oppositeDir(dirFT);

    for (const nk of this.tracks.getConnections(fk)) {
      const np = parseKey(nk);
      const existingDir = directionFromTo(from, np);
      if (existingDir && angleDiff(existingDir, dirFT) === 2) {
        return { success: false, error: '90° connections not allowed' };
      }
    }

    for (const nk of this.tracks.getConnections(tk)) {
      const np = parseKey(nk);
      const existingDir = directionFromTo(to, np);
      if (existingDir && angleDiff(existingDir, dirTF) === 2) {
        return { success: false, error: '90° connections not allowed' };
      }
    }

    this.tracks.addTrack(from, to);
    this.onUpdate?.();
    return { success: true };
  }

  private placeStreetLight(position: Pos): { success: boolean; error?: string } {
    const pk = posKey(position);

    if (position.x < 0 || position.x >= GRID_WIDTH || position.y < 0 || position.y >= GRID_HEIGHT) {
      return { success: false, error: 'Out of bounds' };
    }

    // Toggle: remove if already exists
    const idx = this.streetLights.findIndex(s => posKey(s) === pk);
    if (idx >= 0) {
      this.streetLights.splice(idx, 1);
      this.player.money += STREETLIGHT_COST;
      this.onUpdate?.();
      return { success: true };
    }

    const terrain = terrainAt(position.x, position.y);
    if (terrain === 'water' || terrain === 'mountain') {
      return { success: false, error: `Cannot place street light on ${terrain}` };
    }
    if (this.tracks.hasNode(pk)) {
      return { success: false, error: 'Cannot place street light on track' };
    }
    if (this.stations.some(s => posKey(s.position) === pk)) {
      return { success: false, error: 'Cannot place street light on station' };
    }

    if (this.player.money < STREETLIGHT_COST) {
      return { success: false, error: 'Not enough money' };
    }

    this.player.money -= STREETLIGHT_COST;
    this.streetLights.push({ ...position });
    this.onUpdate?.();
    return { success: true };
  }

  private placeStation(position: Pos): { success: boolean; error?: string } {
    const pk = posKey(position);

    if (!this.tracks.hasNode(pk)) {
      return { success: false, error: 'Must place station on track' };
    }

    const terrain = terrainAt(position.x, position.y);
    if (terrain === 'water' || terrain === 'mountain') {
      return { success: false, error: `Cannot place station on ${terrain}` };
    }

    if (this.stations.some(s => posKey(s.position) === pk)) {
      return { success: false, error: 'Station already exists here' };
    }

    if (this.player.money < STATION_COST) {
      return { success: false, error: 'Not enough money' };
    }

    this.player.money -= STATION_COST;
    this.stationCount++;
    this.stations.push({
      position: { ...position },
      name: `Station ${this.stationCount}`,
      waitingPassengers: 0,
      trafficScore: 0,
    });

    this.onUpdate?.();
    return { success: true };
  }

  private buyTrain(stationKey: string): { success: boolean; error?: string } {
    const station = this.stations.find(s => posKey(s.position) === stationKey);
    if (!station) return { success: false, error: 'No station at this position' };

    if (this.trains.length >= 9) {
      return { success: false, error: 'Maximum 9 trains' };
    }

    if (this.player.money < TRAIN_COST) {
      return { success: false, error: 'Not enough money' };
    }

    this.player.money -= TRAIN_COST;

    // Assign the lowest available number 1-9
    const used = new Set(this.trains.map(t => t.id));
    let trainId = '1';
    for (let i = 1; i <= 9; i++) {
      if (!used.has(String(i))) { trainId = String(i); break; }
    }

    const conns = this.tracks.getConnections(stationKey);
    const firstNeighbor = conns.values().next().value;
    let heading: Direction = 'E';
    if (firstNeighbor) {
      const neighborPos = parseKey(firstNeighbor);
      const dir = directionFromTo(station.position, neighborPos);
      if (dir) heading = dir;
    }

    const train: Train = {
      id: trainId,
      position: { ...station.position },
      heading,
      passengers: 0,
      boardedAtStation: null,
      state: 'at_station',
      stationTimer: STATION_STOP_TICKS,
      stationHistory: [{ name: station.name, day: this.time.day }],
    };
    this.trains.push(train);

    this.onUpdate?.();
    return { success: true };
  }

  private setBranchDirection(pk: string, direction: Direction): { success: boolean; error?: string } {
    if (!this.tracks.hasNode(pk)) {
      return { success: false, error: 'No track at this position' };
    }
    this.tracks.setBranchDefault(pk, direction);
    this.onUpdate?.();
    return { success: true };
  }

  getState(): GameState {
    const { connections, branchDefaults } = this.tracks.serialize();
    return {
      mapSeed: MAP_SEED,
      gridWidth: GRID_WIDTH,
      gridHeight: GRID_HEIGHT,
      trackConnections: connections,
      branchDefaults,
      trains: this.trains,
      stations: this.stations,
      streetLights: this.streetLights,
      player: this.player,
      time: { ...this.time },
    };
  }

  save(): object {
    const { connections, branchDefaults } = this.tracks.serialize();
    return {
      tracks: { connections, branchDefaults },
      trains: this.trains,
      stations: this.stations,
      streetLights: this.streetLights,
      player: this.player,
      time: { ...this.time },
      nextTrainId: this.nextTrainId,
      stationCount: this.stationCount,
      tickCount: this.tickCount,
      lastTaxDay: this.lastTaxDay,
    };
  }

  load(data: any): void {
    this.tracks = new TrackNetwork();
    for (const [key, neighbors] of data.tracks.connections) {
      this.tracks.connections.set(key, new Set(neighbors));
    }
    for (const [key, dir] of data.tracks.branchDefaults) {
      this.tracks.branchDefaults.set(key, dir);
    }
    this.trains = data.trains.map((t: any) => ({
      ...t,
      stationHistory: t.stationHistory ?? [],
    }));
    this.stations = data.stations;
    this.streetLights = data.streetLights ?? [];
    this.player = data.player;
    this.time = data.time;
    this.nextTrainId = data.nextTrainId;
    this.stationCount = data.stationCount;
    this.tickCount = data.tickCount;
    this.lastTaxDay = data.lastTaxDay ?? 0;
  }
}
