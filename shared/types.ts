// === Directions ===

export type Direction = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

// === Grid ===

export interface Pos {
  x: number;
  y: number;
}

export type TerrainType = 'water' | 'sand' | 'grass' | 'forest' | 'mountain';

// === Entities ===

export type TrainState = 'moving' | 'stopped' | 'at_station';

export interface StationVisit {
  name: string;
  day: number;
}

export interface Train {
  id: string;
  position: Pos;
  heading: Direction;
  passengers: number;
  boardedAtStation: Pos | null;
  state: TrainState;
  stationTimer: number;
  stationHistory: StationVisit[];
  cellsSinceLastStop: number;
}

export interface Station {
  position: Pos;
  name: string;
  waitingPassengers: number;
  trafficScore: number;
  stopProbability: number;
  discordWebhook: string | null;
}

export interface Player {
  id: string;
  money: number;
}

// === Time ===

export interface GameTime {
  day: number;
  hour: number;  // 0-23
  minute: number; // 0-59
}

// === Game State (sent to client) ===

export interface GameState {
  mapSeed: number;
  gridWidth: number;
  gridHeight: number;
  trackConnections: [string, string[]][]; // serialized adjacency list
  branchDefaults: [string, Direction][]; // serialized branch defaults
  trains: Train[];
  stations: Station[];
  streetLights: Pos[];
  player: Player;
  time: GameTime;
}

// === Messages ===

export type ClientMessage =
  | { type: 'place_track'; position: Pos }
  | { type: 'place_station'; position: Pos }
  | { type: 'buy_train'; stationKey: string }
  | { type: 'set_branch_direction'; posKey: string; direction: Direction }
  | { type: 'connect_track'; from: Pos; to: Pos }
  | { type: 'place_streetlight'; position: Pos }
  | { type: 'rename_station'; stationKey: string; name: string }
  | { type: 'set_station_probability'; stationKey: string; probability: number }
  | { type: 'set_station_webhook'; stationKey: string; webhook: string }
  | { type: 'save_game' };

export type ServerMessage =
  | { type: 'game_state'; state: GameState }
  | { type: 'update'; state: GameState }
  | { type: 'error'; message: string };
