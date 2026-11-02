// Seeded, serializable RNG (mulberry32). The state lives in the save file so a
// reloaded checkpoint replays identically (no save-scumming, reproducible bugs).
export interface RngState {
  seed: number;
}

export function makeRng(seed = Math.floor(Math.random() * 2 ** 31)): RngState {
  return { seed: seed >>> 0 };
}

export function next(r: RngState): number {
  let t = (r.seed = (r.seed + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function int(r: RngState, min: number, max: number): number {
  return min + Math.floor(next(r) * (max - min + 1));
}

export function pick<T>(r: RngState, arr: readonly T[]): T {
  return arr[int(r, 0, arr.length - 1)];
}

export function shuffle<T>(r: RngState, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = int(r, 0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
