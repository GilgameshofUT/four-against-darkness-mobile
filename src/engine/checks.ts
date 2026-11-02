import type { Game } from './game';
import type { Hero } from './types';
import { saveMods, isImmune, stealthMods, type SaveSpec } from './mods/save';
import { CLASSES } from '../data/classes';
import { sumMods, type Mod } from './dice';
import { isAlive } from './hero';

export interface SaveOutcome {
  hero: Hero;
  success: boolean;
  natural: number;
  total: number;
  immune?: boolean;
}

export async function save(g: Game, h: Hero, s: SaveSpec, extraMods: Mod[] = []): Promise<SaveOutcome> {
  if (isImmune(h, s)) {
    g.log('good', `${h.name} is immune (${s.label}).`);
    return { hero: h, success: true, natural: 6, total: 99, immune: true };
  }
  const { mods, reroll } = saveMods(g, h, s);
  const res = await g.heroRoll({
    hero: h,
    kind: 'save',
    label: s.label,
    mods: [...mods, ...extraMods],
    target: s.target,
    saveType: s.type,
    freeReroll: reroll,
    context: `Save vs L${s.target}`,
  });
  // Iron will / clockwork reflexes etc for non-halflings: grant a reroll once
  let success = !!res.success;
  let r = res;
  if (!success && reroll && h.classId !== 'halfling') {
    const r2 = await g.heroRoll({ hero: h, kind: 'save', label: s.label + ' (reroll)', mods: [...mods, ...extraMods], target: s.target, saveType: s.type, noReroll: true });
    success = !!r2.success;
    r = r2;
  }
  return { hero: h, success, natural: r.natural, total: r.total };
}

export async function saveAll(g: Game, s: SaveSpec, heroes = g.party()): Promise<SaveOutcome[]> {
  const out: SaveOutcome[] = [];
  for (const h of heroes) if (isAlive(h)) out.push(await save(g, h, s));
  return out;
}

/** Group stealth: single roll using the worst modifier. */
export async function groupStealth(g: Game, heroes: Hero[], target: number, label = 'Stealth'): Promise<boolean> {
  let worst: { h: Hero; mods: Mod[]; tot: number } | undefined;
  for (const h of heroes) {
    const mods = stealthMods(g, h);
    const tot = sumMods(mods);
    if (!worst || tot < worst.tot) worst = { h, mods, tot };
  }
  if (!worst) return false;
  const res = await g.heroRoll({ hero: worst.h, kind: 'stealth', label: `${label} (worst: ${worst.h.name})`, mods: worst.mods, target, context: `Stealth vs L${target}` });
  return !!res.success;
}

export function savesAsLabel(h: Hero) {
  return CLASSES[h.classId].savesAs;
}

/** Random living hero */
export function randomHero(g: Game, pool = g.party()): Hero | undefined {
  if (!pool.length) return;
  return pool[Math.floor(g.d6() / 6.0001 * pool.length) % pool.length] ?? pool[0];
}

export function byPosition(g: Game, pos: number): Hero | undefined {
  const order = (g.s.dungeon?.marchingOrder ?? g.s.party).map((id) => g.hero(id)).filter(isAlive);
  return order[pos - 1] ?? order[order.length - 1];
}
