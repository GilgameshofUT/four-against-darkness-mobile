import type { Mod } from '../dice';
import type { Game, SaveType } from '../game';
import type { ClassId, CoreClass, Hero } from '../types';
import { CLASSES } from '../../data/classes';
import { armor, base, hasShieldInHand, inventoryCount, tierOf } from '../hero';
import { hasCond, hasLight } from '../effects';

/** Per-save class bonuses. Keys: classId, saves-as core class, tag (fighter, spellcaster, forester), or 'all'. */
export type SaveBonus = 'L' | 'half' | 'tier' | 'one' | 'reroll' | 'immune';
export type SaveBonusMap = Partial<Record<ClassId | CoreClass | 'fighter' | 'spellcaster' | 'forester' | 'all', SaveBonus>>;

export interface SaveSpec {
  type: SaveType;
  target: number;
  label: string;
  bonuses?: SaveBonusMap;
  /** agility save: armor penalties etc. */
  agility?: boolean;
  trapKind?: 'trapdoor' | 'pit' | 'fall' | 'generic';
}

function bval(b: SaveBonus, h: Hero): number {
  if (b === 'L') return h.level;
  if (b === 'half') return Math.floor(h.level / 2);
  if (b === 'tier') return tierOf(h.level);
  if (b === 'one') return 1;
  return 0;
}

/** Resolves the explicit bonus for this hero from a save's bonus map, honoring "saves as". */
export function lookupBonus(h: Hero, map: SaveBonusMap | undefined): SaveBonus | undefined {
  if (!map) return;
  const cls = CLASSES[h.classId];
  const candidates: (SaveBonus | undefined)[] = [map[h.classId]];
  // Assassin saves as rogue but explicitly does not add +L to trap/lock rolls
  if (!(h.classId === 'assassin')) candidates.push(map[cls.savesAs]);
  if (h.classId === 'light_gladiator') candidates.push(map.warrior, map.rogue);
  for (const tag of cls.tags) candidates.push(map[tag as 'fighter']);
  candidates.push(map.all);
  const order: SaveBonus[] = ['immune', 'L', 'half', 'tier', 'one', 'reroll'];
  const found = candidates.filter(Boolean) as SaveBonus[];
  // Pick the most valuable numeric; immune trumps
  if (found.includes('immune')) return 'immune';
  let best: SaveBonus | undefined;
  let bestV = -1;
  for (const b of found) {
    const v = b === 'reroll' ? 0.5 : bval(b, h);
    if (v > bestV) (best = b), (bestV = v);
  }
  void order;
  return best;
}

export function isImmune(h: Hero, s: SaveSpec): boolean {
  if (lookupBonus(h, s.bonuses) === 'immune') return true;
  if (h.classId === 'kukla' && ['poison', 'disease', 'petrify', 'mental', 'gas', 'sleep'].includes(s.type)) return true;
  if (h.classId === 'mushroom_monk' && s.type === 'sleep') return true;
  if (h.traits.includes('iron_stomach') && s.type === 'poison' && /ingest|food/i.test(s.label)) return true;
  return false;
}

export function saveMods(g: Game, h: Hero, s: SaveSpec): { mods: Mod[]; reroll: boolean } {
  const m: Mod[] = [];
  const L = h.level;
  const T = tierOf(L);
  const b = lookupBonus(h, s.bonuses);
  let reroll = b === 'reroll';
  if (b && b !== 'reroll' && b !== 'immune') m.push({ label: `${CLASSES[h.classId].name} bonus`, value: bval(b, h) });

  const already = (v: number) => (b && b !== 'reroll' ? bval(b, h) >= v : false);
  // Built-in class Save rules (applied when the specific save didn't already give as much)
  if (h.classId === 'wizard' && ['puzzle', 'magic'].includes(s.type) && !already(L)) m.push({ label: 'Wizard lore', value: L });
  if (['rogue'].includes(h.classId) && ['trap', 'lock'].includes(s.type) && !already(L)) m.push({ label: 'Rogue', value: L });
  if (h.classId === 'acrobat' && (s.type === 'fall' || s.trapKind === 'trapdoor' || s.trapKind === 'pit' || s.trapKind === 'fall') && !already(L)) m.push({ label: 'Acrobat (falls)', value: L });
  else if (h.classId === 'acrobat' && s.type === 'trap' && !already(Math.floor(L / 2))) m.push({ label: 'Acrobat', value: Math.floor(L / 2) });
  if (h.classId === 'gnome' && ['poison', 'gas'].includes(s.type) && !already(L)) m.push({ label: 'Gnome resistance', value: L });
  if (h.classId === 'mushroom_monk' && s.type === 'engulf' && !already(L)) m.push({ label: 'Break free', value: L });
  if (h.classId === 'ranger' && /climb|track|swim/i.test(s.label) && !already(L)) m.push({ label: 'Ranger', value: L });

  const t = h.traits;
  if (t.includes('nimble_step') && (s.type === 'trap' || s.type === 'fall')) m.push({ label: 'Nimble Step', value: T });
  if (t.includes('iron_stomach') && ['poison', 'gas'].includes(s.type)) m.push({ label: 'Iron Stomach', value: T });
  if (t.includes('keen_nose') && s.type === 'gas') m.push({ label: 'Keen Nose', value: 2 });
  if (t.includes('poison_expert') && s.type === 'poison') m.push({ label: 'Poison Expert', value: 1 });
  if (t.includes('quick_climber') && /climb/i.test(s.label)) m.push({ label: 'Quick Climber', value: T });
  if (t.includes('oathbound') && s.type === 'mental') m.push({ label: 'Oathbound', value: L });
  if (t.includes('iron_will') && ['madness', 'mental', 'fear'].includes(s.type)) reroll = true;
  if (t.includes('clockwork_reflexes') && s.type === 'trap') reroll = true;
  if (hasCond(h, 'divine_protection')) m.push({ label: 'Divine Protection', value: 1 });
  const lead = g.s.dungeon?.marchingOrder[0];
  if (['fear', 'madness'].includes(s.type) && lead && lead !== h.id && g.hero(lead).traits.includes('encouraging_presence') && g.hero(lead).status === 'ok')
    m.push({ label: 'Encouraging Presence', value: tierOf(g.hero(lead).level) });

  // Agility penalties
  if (s.agility || s.trapKind === 'trapdoor') {
    const arm = armor(h);
    const ab = base(arm);
    if (ab?.armorType === 'heavy') m.push({ label: 'Heavy armor', value: -2 });
    else if (ab && s.trapKind === 'trapdoor') m.push({ label: 'Light armor', value: -1 });
    if (hasCond(h, 'barkskin')) m.push({ label: 'Barkskin', value: -2 });
  }
  if (/climb/i.test(s.label)) {
    if (inventoryCount(h, 'rope') > 0) m.push({ label: 'Rope', value: 1 });
    if (base(armor(h))?.armorType === 'heavy') m.push({ label: 'Heavy armor', value: -2 });
  }
  if (s.type === 'trap' && h.inventory.some((i) => i.base === 'ten_foot_pole') && !/all|random/i.test(s.label)) m.push({ label: "10' pole", value: 1 });

  // Conditions
  if (hasCond(h, 'contaminated')) m.push({ label: 'Contaminated', value: -1 });
  if (hasCond(h, 'spore_sick')) m.push({ label: 'Spore sickness', value: -1 });
  if (hasCond(h, 'bear_trap') && (s.trapKind === 'trapdoor' || /bear trap/i.test(s.label))) m.push({ label: 'Hurt foot', value: -2 });
  const env = g.s.dungeon?.tiles[g.s.dungeon.currentTile]?.env;
  const sb = g.s.dungeon?.saveBonusEnv?.find((x) => x.env === env);
  if (sb) m.push({ label: 'Scout warning', value: sb.value });
  if (!hasLight(g) && h.classId !== 'kukla') m.push({ label: 'Darkness', value: -2 });
  void hasShieldInHand;
  return { mods: m.filter((x) => x.value !== 0), reroll };
}

/** Group stealth uses the WORST modifier in the group. */
export function stealthMods(g: Game, h: Hero): Mod[] {
  const m: Mod[] = [];
  const cls = CLASSES[h.classId];
  const L = h.level;
  const T = tierOf(L);
  const env = g.s.dungeon?.tiles[g.s.dungeon.currentTile]?.env ?? 'dungeon';
  let cb = cls.stealth === 'L' ? L : cls.stealth === 'half' ? Math.floor(L / 2) : cls.stealth === 'one' ? 1 : 0;
  if (h.classId === 'ranger') cb = Math.floor(L / 2); // indoors
  if (h.secrets.includes('stealth_training')) cb = Math.max(cb, Math.floor(L / 2));
  m.push({ label: cls.name, value: cb });
  if (hasShieldInHand(h)) m.push({ label: 'Shield', value: -1 });
  if (base(armor(h))?.armorType === 'heavy') m.push({ label: 'Heavy armor', value: -1 });
  if (h.traits.includes('silent_step')) m.push({ label: 'Silent Step', value: T });
  if (h.traits.includes('shadow_walker')) m.push({ label: 'Shadow-walker', value: T });
  const tile = g.s.dungeon?.tiles[g.s.dungeon.currentTile];
  if (tile?.cavernFeature === 'boulders') m.push({ label: 'Boulders', value: 1 });
  if (tile?.echo) m.push({ label: 'Echo', value: -1 });
  void env;
  if (!hasLight(g) && h.classId !== 'kukla') m.push({ label: 'Darkness', value: -2 });
  return m.filter((x) => x.value !== 0);
}
