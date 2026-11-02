import type { Env, FoeCategory } from '../../engine/types';
import type { FoeDef } from './types';
import { DUNGEON_FOES } from './dungeon';
import { CAVERN_FOES } from './caverns';
import { FUNGAL_FOES } from './fungal';
import { FIENDISH_FOES } from './fiendish';
import { ADVENTURE_FOES } from './adventure';

export * from './types';

export const ALL_FOES: FoeDef[] = [...DUNGEON_FOES, ...CAVERN_FOES, ...FUNGAL_FOES, ...FIENDISH_FOES, ...ADVENTURE_FOES];
export const FOES: Record<string, FoeDef> = Object.fromEntries(ALL_FOES.map((f) => [f.id, f]));

/** d6-ordered foe table for an environment/category. Index 0 = roll 1. */
export function foeTable(env: Env, cat: FoeCategory, fiendish = false): FoeDef[] {
  if (fiendish) return FIENDISH_FOES.filter((f) => f.table === cat);
  const src = env === 'dungeon' ? DUNGEON_FOES : env === 'caverns' ? CAVERN_FOES : FUNGAL_FOES;
  const list = src.filter((f) => f.table === cat);
  // Dungeon minions table entry 1 is "skeletons or zombies": represented as two defs; handled in roller.
  return list;
}
