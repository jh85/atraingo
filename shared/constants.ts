export const GRID_WIDTH = 1000;
export const GRID_HEIGHT = 1000;
export const MAP_SEED = 42;

// Economy
export const STARTING_MONEY = 10000;
export const TRACK_COST = 100;
export const BRIDGE_COST_SHALLOW = 500;
export const BRIDGE_COST_MEDIUM = 2500;
export const BRIDGE_COST_DEEP = 10000;
export const TUNNEL_COST = 800;
export const STATION_COST = 500;
export const TRAIN_COST = 2000;
export const STREETLIGHT_COST = 50;
export const REVENUE_PER_PASSENGER_PER_DIST = 10;
export const TAX_INTERVAL_DAYS = 30;
export const TRACK_TAX_PER_TILE = 5;

// Simulation
export const TICK_RATE = 10;
export const TICK_INTERVAL = 1000 / TICK_RATE;
export const MINUTES_PER_TICK = 1;
export const START_HOUR = 8;  // Game starts at 8:00 AM
export const STATION_STOP_TICKS = 30;
export const TRAIN_MOVE_TICKS = 5;
export const PASSENGER_GEN_TICKS = 50;

// Passengers
export const MAX_WAITING_PASSENGERS = 50;
export const TRAIN_CAPACITY = 30;
export const BASE_PASSENGER_RATE = 1;

// Server
export const WS_PORT = 3001;

// Cursor starts at center of map
export const CURSOR_START_X = 500;
export const CURSOR_START_Y = 500;
