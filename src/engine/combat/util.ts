import type { Game } from '../game';
import type { Foe, Hero } from '../types';
import type { CombatState, HeroCombat } from './types';
import { foeAlive, isMinor } from '../foe';
import { isAlive } from '../hero';

export function newHeroCombat(): HeroCombat {
  return { acted: false, skipTurns: 0, reload: 0, needsDraw: false, defenseMods: [], attackMods: [], mirrorImages: 0 };
}

export function cs(g: Game): CombatState {
  if (!g.s.combat) throw new Error('not in combat');
  return g.s.combat;
}

export function liveFoes(g: Game): Foe[] {
  return cs(g).foes.filter(foeAlive);
}

export function foeHeadcount(foes: Foe[]): number {
  return foes.filter(foeAlive).reduce((a, f) => a + (isMinor(f) ? f.count : 1), 0);
}

export function hc(g: Game, h: Hero): HeroCombat {
  const c = cs(g);
  c.heroes[h.id] ??= newHeroCombat();
  return c.heroes[h.id];
}

/** Heroes able to fight in melee (corridor: positions 1-2 only; ambush: rear 2). */
export function meleeEligible(g: Game, h: Hero): boolean {
  const c = cs(g);
  if (!c.corridor) return true;
  const order = marching(g);
  const idx = order.findIndex((x) => x.id === h.id);
  if (idx < 0) return false;
  const front = c.narrow ? 1 : 2;
  if (c.ambush && !c.flags.ambushTurned) return idx >= order.length - front;
  return idx < front;
}

export function marching(g: Game): Hero[] {
  const order = g.s.dungeon?.marchingOrder ?? g.s.party;
  return order.map((id) => g.hero(id)).filter((h) => isAlive(h) && !g.s.combat?.heroes[h.id]?.fled);
}

export function combatHeroes(g: Game): Hero[] {
  return marching(g);
}

export function partyCount(g: Game): number {
  return combatHeroes(g).length + cs(g).allies.filter((a) => a.life > 0).length;
}

export function allFoesDown(g: Game) {
  return liveFoes(g).length === 0;
}

export function heroCanAct(g: Game, h: Hero): string | undefined {
  const x = hc(g, h);
  if (x.acted) return 'Already acted';
  if (x.skipTurns > 0) return 'Must skip this turn';
  if (x.asleep) return 'Asleep';
  if (x.engulfed) return 'Engulfed';
  if (h.conditions.some((c) => c.id === 'paralyzed')) return 'Paralyzed';
  if (x.knockedDown) return 'Knocked down (stand up)';
  return;
}
