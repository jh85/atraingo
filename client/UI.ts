import type { GameState, GameTime, Pos, ClientMessage } from '../shared/types.js';
import { posKey } from '../shared/directions.js';
import { terrainAt, trackCostAt, waterDepthAt } from '../shared/terrain.js';

export class UI {
  private static TRAIN_COLORS = [
    '#D7D79B', '#A0C6C7', '#80BF7F', '#6171A2', '#8B8B8C',
    '#A35363', '#C1C1C1', '#99602F', '#0E0C0F',
  ];
  private moneyEl: HTMLElement;
  private timeEl: HTMLElement;
  private infoCursorEl: HTMLElement;
  private infoTerrainEl: HTMLElement;
  private infoTrainsEl: HTMLElement;
  private infoStationsEl: HTMLElement;
  private stationListEl: HTMLElement;
  private trainListEl: HTMLElement;
  private statusEl: HTMLElement;
  private errorEl: HTMLElement;
  private errorTimeout: ReturnType<typeof setTimeout> | null = null;
  private sendAction: (msg: ClientMessage) => void;

  constructor(sendAction: (msg: ClientMessage) => void) {
    this.sendAction = sendAction;
    this.moneyEl = document.getElementById('money')!;
    this.timeEl = document.getElementById('game-time')!;
    this.infoCursorEl = document.querySelector('#info-cursor span')!;
    this.infoTerrainEl = document.querySelector('#info-terrain span')!;
    this.infoTrainsEl = document.querySelector('#info-trains span')!;
    this.infoStationsEl = document.querySelector('#info-stations span')!;
    this.stationListEl = document.getElementById('station-list')!;
    this.trainListEl = document.getElementById('train-list')!;
    this.statusEl = document.getElementById('status')!;
    this.errorEl = document.getElementById('error-msg')!;
  }

  private formatTime(time: GameTime): string {
    return `Day ${time.day}`;
  }

  update(state: GameState, cursor: Pos, connectSource: Pos | null = null): void {
    this.moneyEl.textContent = `$${state.player.money.toLocaleString()}`;
    this.timeEl.textContent = this.formatTime(state.time);
    this.infoCursorEl.textContent = `${cursor.x}, ${cursor.y}`;
    const terrain = terrainAt(cursor.x, cursor.y);
    const cost = trackCostAt(cursor.x, cursor.y);
    const depthLabels = ['', 'shallow', 'medium', 'deep'];
    const label = terrain === 'water'
                ? `${depthLabels[waterDepthAt(cursor.x, cursor.y)]} water (bridge $${cost.toLocaleString()})`
                : terrain === 'mountain' ? `${terrain} (tunnel $${cost})`
                : `${terrain} ($${cost})`;
    this.infoTerrainEl.textContent = label;
    this.infoTrainsEl.textContent = `${state.trains.length}`;
    this.infoStationsEl.textContent = `${state.stations.length}`;

    if (connectSource) {
      this.statusEl.textContent = `Connecting from (${connectSource.x}, ${connectSource.y}) — press K on target, Esc to cancel`;
      this.statusEl.style.color = '#ffd700';
    } else {
      this.statusEl.style.color = '#666';
    }

    // Station list
    if (state.stations.length === 0) {
      this.stationListEl.textContent = 'None yet';
    } else {
      this.stationListEl.innerHTML = '';
      for (const s of state.stations) {
        const div = document.createElement('div');
        div.className = 'station-item';
        div.innerHTML = `${s.name} <span style="color:#ffd700">(${s.waitingPassengers})</span>`;
        div.addEventListener('click', () => {
          this.sendAction({ type: 'buy_train', stationKey: posKey(s.position) });
        });
        this.stationListEl.appendChild(div);
      }
    }

    // Train list
    if (state.trains.length === 0) {
      this.trainListEl.textContent = 'None yet';
    } else {
      this.trainListEl.innerHTML = '';
      for (const t of state.trains) {
        const div = document.createElement('div');
        div.className = 'train-item';
        const stateLabel = t.state === 'at_station' ? 'stopped' : t.state;
        const tidx = Math.max(0, Math.min(8, parseInt(t.id, 10) - 1));
        const trainBg = UI.TRAIN_COLORS[tidx];
        const trainFg = tidx === 8 ? '#7A0C1A' : '#000';
        let html = `<span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${trainBg};color:${trainFg};font-weight:bold;font-size:11px;text-align:center;line-height:16px;vertical-align:middle;">${t.id}</span> `
                 + `<span style="color:#aaa">${stateLabel}</span> `
                 + `<span style="color:#ffd700">${t.passengers}pax</span>`;
        if (t.stationHistory && t.stationHistory.length > 0) {
          const visits = t.stationHistory.slice().reverse().slice(0, 3);
          html += '<div class="visit-log">'
                + visits.map(v => `${v.name} (d${v.day})`).join(' → ')
                + '</div>';
        }
        div.innerHTML = html;
        this.trainListEl.appendChild(div);
      }
    }
  }

  setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  showError(msg: string): void {
    this.errorEl.textContent = msg;
    this.errorEl.style.display = 'block';
    if (this.errorTimeout) clearTimeout(this.errorTimeout);
    this.errorTimeout = setTimeout(() => {
      this.errorEl.style.display = 'none';
    }, 2000);
  }
}
