import { int, type RngState } from './rng';

export type DieSize = 6 | 8 | 10 | 12 | 20;

/** Explosion threshold per die type (book p.5). */
export const EXPLODE_ON: Record<DieSize, number> = { 6: 6, 8: 7, 10: 8, 12: 9, 20: 10 };
export const TIER_DIE: DieSize[] = [6, 6, 8, 10, 12, 20]; // index by tier (1..5)

export interface Mod {
  label: string;
  value: number;
}

export interface RollResult {
  label: string;
  die: DieSize;
  /** Every face rolled, in order (first is the natural roll, the rest are explosions). */
  faces: number[];
  natural: number;
  exploded: boolean;
  mods: Mod[];
  modTotal: number;
  total: number;
  target?: number;
  /** 'gte' = Save/Attack (meet or beat); 'gt' = Defense (must beat). */
  mode?: 'gte' | 'gt';
  success?: boolean;
  /** A natural 1 on Defense/Stealth etc is always a failure. */
  autoFail?: boolean;
  rerolled?: boolean;
  /** table rolls: success means total <= target (e.g. 1-in-6 chances) */
  atMost?: boolean;
  /** plain-language outcome for table rolls, e.g. 'It IS the Final Boss!' */
  outcomeText?: string;
}

export interface RollSpec {
  label: string;
  die?: DieSize;
  explode?: boolean;
  /** Masterwork weapons explode one lower. */
  explodeBonus?: number;
  mods?: Mod[];
  target?: number;
  mode?: 'gte' | 'gt';
  naturalOneFails?: boolean;
  /** Roll several dice and keep the best natural (barbarian rage, enchanted weapon). */
  keepBestOf?: number;
}

export function sumMods(mods: Mod[]): number {
  return mods.reduce((a, m) => a + m.value, 0);
}

export function cleanMods(mods: Mod[]): Mod[] {
  return mods.filter((m) => m.value !== 0);
}

function rollExploding(r: RngState, die: DieSize, explode: boolean, explodeBonus = 0): number[] {
  const faces = [int(r, 1, die)];
  const threshold = EXPLODE_ON[die] - explodeBonus;
  if (!explode) return faces;
  let guard = 0;
  while (faces[faces.length - 1] >= threshold && guard++ < 50) faces.push(int(r, 1, die));
  return faces;
}

export function resolveRoll(r: RngState, spec: RollSpec): RollResult {
  const die = spec.die ?? 6;
  const explode = spec.explode ?? true;
  let faces = rollExploding(r, die, explode, spec.explodeBonus);
  if (spec.keepBestOf && spec.keepBestOf > 1) {
    for (let i = 1; i < spec.keepBestOf; i++) {
      const alt = rollExploding(r, die, explode, spec.explodeBonus);
      if (alt.reduce((a, b) => a + b, 0) > faces.reduce((a, b) => a + b, 0)) faces = alt;
    }
  }
  return finish(spec, die, faces);
}

export function finish(spec: RollSpec, die: DieSize, faces: number[]): RollResult {
  const mods = cleanMods(spec.mods ?? []);
  const modTotal = sumMods(mods);
  const natural = faces[0];
  const raw = faces.reduce((a, b) => a + b, 0);
  const total = raw + modTotal;
  const res: RollResult = {
    label: spec.label,
    die,
    faces,
    natural,
    exploded: faces.length > 1,
    mods,
    modTotal,
    total,
    target: spec.target,
    mode: spec.mode,
  };
  if (spec.target !== undefined) {
    const mode = spec.mode ?? 'gte';
    res.autoFail = !!spec.naturalOneFails && natural === 1;
    res.success = !res.autoFail && (mode === 'gt' ? total > spec.target : total >= spec.target);
  }
  return res;
}

/** Plain table rolls (no explosion, no mods): d6, 2d6, d66, d3, NdM. */
export function d(r: RngState, sides: number): number {
  return int(r, 1, sides);
}
export function d3(r: RngState): number {
  return Math.ceil(d(r, 6) / 2);
}
export function nd(r: RngState, n: number, sides = 6): number {
  let t = 0;
  for (let i = 0; i < n; i++) t += d(r, sides);
  return t;
}
export function d66(r: RngState): number {
  return d(r, 6) * 10 + d(r, 6);
}

/** Parses "2d6+3", "d6", "3d6x10", "d3+1", "d6xd6" etc. */
export function rollExpr(r: RngState, expr: string): number {
  const e = expr.replace(/\s/g, '').toLowerCase();
  const mult = e.split('x');
  if (mult.length > 1) return mult.reduce((acc, part) => acc * rollExpr(r, part), 1);
  let total = 0;
  for (const term of e.match(/[+-]?[^+-]+/g) ?? []) {
    const sign = term.startsWith('-') ? -1 : 1;
    const t = term.replace(/^[+-]/, '');
    const m = t.match(/^(\d*)d(\d+)$/);
    if (m) {
      const n = m[1] ? Number(m[1]) : 1;
      const sides = Number(m[2]);
      total += sign * (sides === 3 ? Array.from({ length: n }, () => d3(r)).reduce((a, b) => a + b, 0) : nd(r, n, sides));
    } else total += sign * Number(t);
  }
  return total;
}

export function maxExpr(expr: string): number {
  const e = expr.replace(/\s/g, '').toLowerCase();
  const mult = e.split('x');
  if (mult.length > 1) return mult.reduce((acc, part) => acc * maxExpr(part), 1);
  let total = 0;
  for (const term of e.match(/[+-]?[^+-]+/g) ?? []) {
    const sign = term.startsWith('-') ? -1 : 1;
    const t = term.replace(/^[+-]/, '');
    const m = t.match(/^(\d*)d(\d+)$/);
    total += sign * (m ? (m[1] ? Number(m[1]) : 1) * Number(m[2]) : Number(t));
  }
  return total;
}
