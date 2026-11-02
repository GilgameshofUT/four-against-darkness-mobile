import { openDB } from 'idb';
import type { GameState } from '../engine/types';
import { SAVE_VERSION, DEFAULT_SETTINGS } from '../engine/state';

const DB = '4ad';
const STORE = 'saves';

async function db() {
  return openDB(DB, 1, {
    upgrade(d) {
      d.createObjectStore(STORE);
    },
  });
}

export async function saveGame(s: GameState) {
  try {
    const d = await db();
    await d.put(STORE, JSON.parse(JSON.stringify(s)), 'current');
  } catch (e) {
    console.warn('save failed', e);
  }
}

export async function loadGame(): Promise<GameState | undefined> {
  try {
    const d = await db();
    const s = (await d.get(STORE, 'current')) as GameState | undefined;
    if (!s) return;
    s.settings = { ...DEFAULT_SETTINGS, ...s.settings };
    if (s.version !== SAVE_VERSION) s.version = SAVE_VERSION;
    return s;
  } catch {
    return;
  }
}

export async function wipeSave() {
  const d = await db();
  await d.delete(STORE, 'current');
}

export function exportSave(s: GameState): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(s))));
}
export function importSave(txt: string): GameState {
  return JSON.parse(decodeURIComponent(escape(atob(txt.trim()))));
}
