import { FOES, type FoeDef, type Special } from '../data/foes';
import type { Foe } from './types';
import type { Game } from './game';
import { tierOf } from './hero';

export function special<T extends Special['id']>(def: FoeDef | undefined, id: T): Extract<Special, { id: T }> | undefined {
  return def?.specials?.find((s) => s.id === id) as Extract<Special, { id: T }> | undefined;
}
export function fdef(f: Foe): FoeDef {
  return FOES[f.defId];
}
export function fspecial<T extends Special['id']>(f: Foe, id: T) {
  return special(fdef(f), id);
}
export function isMinor(f: Foe) {
  return f.category === 'vermin' || f.category === 'minion';
}
export function isMajor(f: Foe) {
  return !isMinor(f);
}
export function foeAlive(f: Foe) {
  return !f.fled && (isMinor(f) ? f.count > 0 : f.life > 0);
}
export function hasTag(f: Foe, t: string) {
  return f.tags.includes(t);
}
export function isUndead(f: Foe) {
  return hasTag(f, 'undead');
}
export function isUnliving(f: Foe) {
  return ['undead', 'artificial', 'elemental'].some((t) => hasTag(f, t));
}
export function immune(f: Foe, what: string) {
  return !!fdef(f)?.immune?.includes(what);
}

function resolveExpr(expr: number | string | undefined, hcl: number, fallback: number): number {
  if (expr === undefined) return fallback;
  if (typeof expr === 'number') return expr;
  const [main, min] = expr.split('|');
  const T = tierOf(hcl);
  let v: number;
  if (main === 'T') v = T;
  else if (main === 'H') v = hcl;
  else if (main.startsWith('T+')) v = T + Number(main.slice(2));
  else if (main.startsWith('H+')) v = hcl + Number(main.slice(2));
  else v = Number(main);
  return Math.max(v, min ? Number(min) : 0);
}

/** Instantiate a foe from its definition, rolling count and fixing L with the current HCL. */
export function makeFoe(g: Game, defId: string, opts: { count?: number; finalBoss?: boolean; wandering?: boolean } = {}): Foe {
  const def = FOES[defId];
  if (!def) throw new Error('Unknown foe ' + defId);
  const hcl = g.hcl();
  let level = def.fixed ?? hcl + def.lv;
  if (def.max) level = Math.min(level, def.max);
  level = Math.max(1, level);
  const minor = def.table === 'vermin' || def.table === 'minion';
  const count = minor ? opts.count ?? Math.max(1, g.roll(def.count ?? '1')) : 1;
  let life = minor ? 1 : resolveExpr(def.life, hcl, 3);
  let attacks = typeof def.attacks === 'string' && def.attacks.startsWith('d') ? g.roll(def.attacks) : resolveExpr(def.attacks, hcl, 1);
  const damage = resolveExpr(def.damage, hcl, 1);
  const f: Foe = {
    uid: g.uid('f'),
    defId,
    name: def.name,
    category: def.table,
    level,
    baseLevel: level,
    count,
    initialCount: count,
    life,
    maxLife: life,
    attacks,
    damage,
    tags: [...def.tags],
    morale: def.morale ?? 0,
    moraleChecked: false,
    noMorale: !!def.noMorale,
    treasure: { rolls: def.treasure?.rolls ?? 1, mod: def.treasure?.mod ?? 0, none: def.treasure?.none, special: def.treasure?.special },
    reduced: false,
    levelMods: [],
    state: {},
    surprise: def.surprise,
    hates: def.hates,
    wandering: opts.wandering,
  };
  if (opts.finalBoss) makeFinalBoss(f);
  if (defId === 'fungus_hydra') f.state.heads = attacks;
  return f;
}

export function makeFinalBoss(f: Foe) {
  f.finalBoss = true;
  f.life += 1;
  f.maxLife += 1;
  f.attacks += 1;
  f.noMorale = true;
}

/** Effective L for rolls against this foe right now. */
export function foeLevel(g: Game, f: Foe, opts: { attacking?: boolean; vsHero?: string } = {}): number {
  const c = g.s.combat;
  let L = f.level;
  // Distraction effects are not cumulative: take the strongest 'distract' and add others.
  const distract = Math.min(0, ...f.levelMods.filter((m) => m.label.startsWith('Distract')).map((m) => m.value));
  L += distract + f.levelMods.filter((m) => !m.label.startsWith('Distract')).reduce((a, m) => a + m.value, 0);
  if (c && c.turn === 1) {
    if (c.partySurprise) L -= 1;
    const ftl = fspecial(f, 'first_turn_level');
    if (ftl && opts.attacking) L += ftl.value;
    if (f.defId === 'minosaur' && opts.attacking && !f.state.hitByRanged) L += 1;
  }
  if (f.defId === 'echo_bats' && g.s.dungeon?.tiles[g.s.dungeon.currentTile]?.echo) L += 1;
  if (opts.attacking && opts.vsHero && fspecial(f, 'frenzy')) {
    const h = g.hero(opts.vsHero);
    const { maxLife } = heroLife;
    if (h.life < maxLife(h)) L += 1;
  }
  if (f.state.trialPenalty) L += 1;
  return Math.max(1, L);
}

import * as heroLife from './hero';

/** Major foe: reduce L by 1 once it has lost more than half its Life. */
export function checkHalfLife(g: Game, f: Foe) {
  if (isMajor(f) && !f.reduced && f.life > 0 && f.life < f.maxLife / 2 && !['living_statue'].includes(f.defId)) {
    f.reduced = true;
    f.level = Math.max(1, f.level - 1);
    g.log('combat', `${f.name} is badly wounded and slows down (L${f.level}).`);
  }
}

export function foeLabel(f: Foe): string {
  return isMinor(f) ? `${f.count} ${f.name}` : f.name;
}
