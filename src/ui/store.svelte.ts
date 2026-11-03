import type { ChoicePrompt, Io, RollPrompt } from '../engine/io';
import type { RollResult } from '../engine/dice';
import type { GameState, LogEntry } from '../engine/types';
import { Game } from '../engine/game';
import { newState } from '../engine/state';
import { saveGame, loadGame } from './persist';
import { foeAlive, isMinor } from '../engine/foe';

export type Pending =
  | { kind: 'choice'; prompt: ChoicePrompt<unknown>; resolve: (v: unknown) => void }
  | { kind: 'roll'; prompt: RollPrompt; result: RollResult; resolve: () => void }
  | { kind: 'pause'; title: string; text: string; art?: string; resolve: () => void };

class UiStore {
  version = $state(0);
  pending = $state<Pending | null>(null);
  busy = $state(false);
  toast = $state<LogEntry | null>(null);
  screen = $state<string>('title');
  sheetHero = $state<string | null>(null);
  showLog = $state(false);
  showMenu = $state(false);
  showSettings = $state(false);
  game!: Game;
  private snapshot = '';

  constructor() {
    const io = new UiIo(this);
    this.game = new Game(newState(), io);
  }

  get s(): GameState {
    void this.version;
    return this.game.s;
  }

  bump() {
    this.version++;
  }

  async load() {
    const saved = await loadGame();
    if (saved) {
      this.game.s = saved;
      this.screen = saved.mode === 'title' ? 'title' : saved.mode;
      this.bump();
      return true;
    }
    return false;
  }

  async save() {
    await saveGame(this.game.s);
  }

  /** Run an engine action. Snapshots state first so a crash or reload resumes cleanly. */
  async run(fn: (g: Game) => Promise<unknown>) {
    if (this.busy) return;
    this.busy = true;
    this.snapshot = JSON.stringify(this.game.s);
    try {
      await fn(this.game);
    } catch (e) {
      console.error(e);
      this.game.log('bad', `Something went wrong: ${(e as Error).message}. The game was restored to before this action.`);
      try {
        const keepLog = this.game.s.log;
        this.game.s = JSON.parse(this.snapshot);
        this.game.s.log = keepLog;
      } catch {}
    } finally {
      this.busy = false;
      this.pending = null;
      this.syncScreen();
      this.bump();
      await this.save();
    }
  }

  syncScreen() {
    const m = this.game.s.mode;
    if (m === 'dungeon' && this.screen !== 'dungeon') this.screen = 'dungeon';
    if (m === 'debrief') this.screen = 'debrief';
  }

  answer(v: unknown) {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    if (p.kind === 'choice') p.resolve(v);
    else p.resolve();
  }
}

class UiIo implements Io {
  constructor(private ui: UiStore) {}
  roll(p: RollPrompt, result: RollResult): Promise<void> {
    return new Promise((resolve) => {
      this.ui.pending = { kind: 'roll', prompt: p, result, resolve };
      this.ui.bump();
    });
  }
  choose<T>(p: ChoicePrompt<T>): Promise<T> {
    return new Promise((resolve) => {
      this.ui.pending = { kind: 'choice', prompt: p as ChoicePrompt<unknown>, resolve: resolve as (v: unknown) => void };
      this.ui.bump();
    });
  }
  pause(title: string, text: string, art?: string): Promise<void> {
    return new Promise((resolve) => {
      this.ui.pending = { kind: 'pause', title, text, art, resolve };
      this.ui.bump();
    });
  }
  log(e: LogEntry) {
    if (e.kind === 'good' || e.kind === 'bad' || e.kind === 'loot' || e.kind === 'level') this.ui.toast = e;
  }
  changed() {
    this.ui.bump();
  }
  checkpoint() {
    this.ui.bump();
  }
}

export const ui = new UiStore();

/** Live foe count for the combat header / prompt sheets. Null outside combat. */
export function combatFoes(): { groups: number; bodies: number; initial: number; slain: number } | null {
  const c = ui.s.combat;
  if (!c) return null;
  const alive = c.foes.filter(foeAlive);
  const bodies = alive.reduce((n, f) => n + (isMinor(f) ? f.count : 1), 0);
  const initial = c.foes.reduce((n, f) => n + (isMinor(f) ? (f.initialCount ?? f.count) : 1), 0);
  return { groups: alive.length, bodies, initial, slain: Math.max(0, initial - bodies) };
}

export function art(path?: string): string {
  if (!path) return '';
  return `./art/${path}.webp`;
}
