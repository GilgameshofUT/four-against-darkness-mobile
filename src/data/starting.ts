import type { ClassId } from '../engine/types';

/** A starting kit entry: base item id, optional damage choice and quantity. */
export interface KitItem {
  base: string;
  damage?: 'crushing' | 'slashing' | 'choose';
  qty?: number;
  equip?: 'main' | 'off' | 'armor';
  name?: string;
  /** dice expression for qty */
  qtyExpr?: string;
}

export interface KitOption {
  id: string;
  label: string;
  items: KitItem[];
}

const LW = (equip: KitItem['equip'] = 'main', damage: KitItem['damage'] = 'choose'): KitItem => ({ base: 'light_weapon', damage, equip });
const HW = (equip: KitItem['equip'] = 'main', damage: KitItem['damage'] = 'choose'): KitItem => ({ base: 'hand_weapon', damage, equip });
const TW: KitItem = { base: 'two_handed', damage: 'choose', equip: 'main' };
const SH: KitItem = { base: 'shield', equip: 'off' };
const LA: KitItem = { base: 'light_armor', equip: 'armor' };
const HA: KitItem = { base: 'heavy_armor', equip: 'armor' };

export const STARTING_KITS: Record<ClassId, KitOption[]> = {
  acrobat: [{ id: 'std', label: 'Light weapon, rope, loose clothes', items: [LW(), { base: 'rope' }] }],
  assassin: [
    { id: 'sword_bow', label: 'Hand weapon + bow, light armor, lockpicks', items: [HW(), { base: 'bow' }, LA, { base: 'lockpicks' }] },
    { id: 'two_daggers', label: 'Two daggers, light armor, lockpicks', items: [LW('main', 'slashing'), LW('off', 'slashing'), LA, { base: 'lockpicks' }] },
    { id: 'sword_xbow', label: 'Hand weapon + crossbow, light armor, lockpicks', items: [HW(), { base: 'crossbow' }, LA, { base: 'lockpicks' }] },
    { id: 'great_dagger', label: 'Two-handed weapon + dagger, light armor, lockpicks', items: [TW, LW('off', 'slashing'), LA, { base: 'lockpicks' }] },
  ],
  barbarian: [
    { id: 'std', label: 'Light armor, shield, hand weapon', items: [LA, SH, HW()] },
    { id: 'two', label: 'Light armor, two-handed weapon', items: [LA, TW] },
    { id: 'bow', label: 'Light armor, bow, light weapon', items: [LA, { base: 'bow' }, LW('off')] },
  ],
  bulwark: [{ id: 'std', label: 'Heavy armor, shield, hand weapon', items: [HA, SH, HW()] }],
  cleric: [
    { id: 'std', label: 'Light armor, shield, hand weapon', items: [LA, SH, HW('main', 'crushing')] },
    { id: 'two', label: 'Light armor, two-handed weapon', items: [LA, TW] },
  ],
  dwarf: [
    { id: 'std', label: 'Light armor, shield, hand weapon', items: [LA, SH, HW()] },
    { id: 'two', label: 'Heavy armor, two-handed weapon', items: [HA, TW] },
  ],
  druid: [{ id: 'std', label: 'Light weapon (staff, sickle, club or dagger)', items: [LW()] }],
  elf: [{ id: 'std', label: 'Light armor, bow, hand weapon', items: [LA, HW(), { base: 'bow' }] }],
  gnome: [{ id: 'std', label: 'Light weapon, contraption, lockpicks & precision tools', items: [LW(), { base: 'contraption' }, { base: 'lockpicks' }] }],
  halfling: [{ id: 'std', label: 'd6+3 Food, sling, light weapon', items: [{ base: 'sling' }, LW('main'), { base: 'food', qtyExpr: 'd6+3' }] }],
  illusionist: [{ id: 'std', label: 'Knife or walking stick, clothes', items: [LW()] }],
  kukla: [{ id: 'std', label: 'Dagger, doll clothes, red & green rings', items: [LW('main', 'slashing'), { base: 'red_ring' }, { base: 'green_ring' }] }],
  light_gladiator: [{ id: 'std', label: 'Two light weapons, rope, lantern', items: [LW('main'), LW('off'), { base: 'rope' }, { base: 'lantern' }] }],
  mushroom_monk: [
    { id: 'nunchaku', label: 'Sash and nunchaku', items: [{ base: 'nunchaku', equip: 'main' }] },
    { id: 'bo', label: 'Sash and bo staff', items: [{ base: 'bo_staff', equip: 'main' }] },
    { id: 'stars', label: 'Sash and 12 throwing stars', items: [{ base: 'throwing_stars', qty: 12, equip: 'main' }] },
  ],
  paladin: [
    { id: 'std', label: 'Heavy armor, shield, hand weapon', items: [HA, SH, HW()] },
    { id: 'two', label: 'Heavy armor, two-handed weapon', items: [HA, TW] },
  ],
  ranger: [
    { id: 'slash', label: '2 slashing hand weapons, light weapon, bow, light armor, d3 Food', items: [HW('main', 'slashing'), HW('off', 'slashing'), LW('off', 'slashing'), { base: 'bow' }, LA, { base: 'food', qtyExpr: 'd3' }] },
    { id: 'crush', label: '2 crushing hand weapons, light weapon, bow, light armor, d3 Food', items: [HW('main', 'crushing'), HW('off', 'crushing'), LW('off', 'crushing'), { base: 'bow' }, LA, { base: 'food', qtyExpr: 'd3' }] },
  ],
  rogue: [{ id: 'std', label: 'Light armor, light weapon, rope, lockpicks', items: [LA, LW('main', 'slashing'), { base: 'rope' }, { base: 'lockpicks' }] }],
  swashbuckler: [{ id: 'std', label: 'Hand weapon, light hand weapon, plumed hat, half-cape', items: [HW('main', 'slashing'), LW('off', 'slashing')] }],
  warrior: [
    { id: 'sword_board', label: 'Light armor, shield, hand weapon', items: [LA, SH, HW()] },
    { id: 'two', label: 'Light armor, two-handed weapon', items: [LA, TW] },
    { id: 'bow', label: 'Light armor, bow', items: [LA, { base: 'bow', equip: 'main' }] },
  ],
  wizard: [{ id: 'std', label: 'Light weapon, spellbook, writing implements', items: [LW(), { base: 'spellbook' }] }],
};
