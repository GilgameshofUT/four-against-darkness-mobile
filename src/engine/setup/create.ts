import type { ClassId, Hero, Item } from '../types';
import type { RngState } from '../rng';
import { blankHero } from '../state';
import { CLASSES } from '../../data/classes';
import { STARTING_KITS } from '../../data/starting';
import { ITEM_BASES } from '../../data/items';
import { rollExpr } from '../dice';
import { maxLife } from '../hero';
import { equipItem } from '../inventory';

export interface HeroDraft {
  name: string;
  classId: ClassId;
  portrait: string;
  traits: string[];
  kit: string;
  damage: Record<number, 'crushing' | 'slashing'>; // per kit item index
  choices: Record<string, string>;
  swornEnemy?: string;
}

let uidN = 0;
function uid(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${(uidN++).toString(36)}`;
}

/** Build the hero from a completed draft. Returns hero + rolled starting gold. */
export function buildHero(rng: RngState, d: HeroDraft): { hero: Hero; gold: number; rolls: string[] } {
  const h = blankHero(uid('h'), d.name.trim() || CLASSES[d.classId].name, d.classId, d.portrait);
  h.traits = [...d.traits];
  h.choices = { ...d.choices };
  if (d.swornEnemy) h.swornEnemies = [d.swornEnemy];
  const rolls: string[] = [];
  const kit = STARTING_KITS[d.classId].find((k) => k.id === d.kit) ?? STARTING_KITS[d.classId][0];
  kit.items.forEach((ki, idx) => {
    const b = ITEM_BASES[ki.base];
    let qty = ki.qty;
    if (ki.qtyExpr) {
      qty = rollExpr(rng, ki.qtyExpr);
      rolls.push(`${b.name}: ${ki.qtyExpr} = ${qty}`);
    }
    const dmg = ki.damage === 'choose' ? d.damage[idx] ?? 'slashing' : ki.damage;
    const it: Item = { uid: uid('i'), base: ki.base, name: itemName(ki.base, dmg), qty, damage: dmg };
    if (ki.base === 'hand_weapon' && dmg === 'slashing' && d.classId === 'dwarf') it.data = { axe: true }, (it.name = 'Axe');
    h.inventory.push(it);
    if (ki.equip === 'armor') h.equip.armor = it.uid;
    if (ki.equip === 'main' && !h.equip.main) equipItem(undefined, h, it);
    else if (ki.equip === 'off' && !h.equip.off) {
      if (b.kind === 'shield' || !h.equip.off) h.equip.off = it.uid;
    }
  });
  // Rogue Street Thug: free hand weapon
  if (h.traits.includes('street_thug')) h.inventory.push({ uid: uid('i'), base: 'hand_weapon', name: itemName('hand_weapon', (h.choices.street_thug as 'slashing') ?? 'slashing'), damage: (h.choices.street_thug as 'slashing') ?? 'slashing' });
  // Druid free animal companion
  if (d.classId === 'druid' && h.choices.companion) h.companion = companion(h.choices.companion, true);
  initResources(h);
  h.life = maxLife(h);
  const w = CLASSES[d.classId].wealth;
  const gold = rollExpr(rng, w);
  rolls.push(`Starting wealth ${w} = ${gold} gp`);
  return { hero: h, gold, rolls };
}

export function itemName(base: string, dmg?: string) {
  const b = ITEM_BASES[base];
  if (base === 'light_weapon') return dmg === 'crushing' ? 'Club' : 'Dagger';
  if (base === 'hand_weapon') return dmg === 'crushing' ? 'Mace' : 'Sword';
  if (base === 'two_handed') return dmg === 'crushing' ? 'Warhammer' : 'Greatsword';
  return b.name;
}

/** Per-adventure resources at full. */
export function initResources(h: Hero) {
  const L = h.level;
  const r = h.resources;
  if (h.classId === 'cleric') (r.healing = 3), (r.blessing = 3);
  if (h.classId === 'cleric' && h.choices.power_increase) r[h.choices.power_increase] = (r[h.choices.power_increase] ?? 3) + 1;
  if (h.classId === 'halfling') r.luck = L + 1;
  if (h.classId === 'barbarian') r.rage = 1 + Math.floor(L / 2);
  if (h.classId === 'acrobat') r.trick = L + 3;
  if (h.classId === 'paladin') r.prayer = L + 1;
  if (h.classId === 'gnome') r.gadget = L + (h.traits.includes('fixer') ? 8 : 6);
  if (h.classId === 'mushroom_monk') r.spores = 1 + (h.traits.includes('abundant_spores') ? 1 : 0);
  if (h.classId === 'swashbuckler') r.panache = 0;
  r.arrows = 12;
}

export const COMPANIONS: Record<string, { name: string; level: number; life: number; cost: number; desc: string }> = {
  hawk: { name: 'Hawk', level: 1, life: 1, cost: 20, desc: 'Attack −1, Defense +2. Reduces surprise outdoors. Cannot attack in corridors.' },
  owl: { name: 'Owl', level: 1, life: 1, cost: 20, desc: '+1 to its master\u2019s spellcasting, or attack at −1. Kills d6 rats.' },
  peacock: { name: 'Peacock', level: 0, life: 1, cost: 10, desc: '+1 to wooing Saves. Mostly decorative.' },
  warhound: { name: 'Warhound', level: 1, life: 2, cost: 20, desc: 'Attack +1. On 5–6 takes a hit for its master. Reduces surprise by 1.' },
  wildcat: { name: 'Wildcat', level: 1, life: 2, cost: 20, desc: 'Attack +0, Defense +1. Kills d6 rats. Sulks on a 1.' },
  crow: { name: 'Crow', level: 1, life: 1, cost: 15, desc: '+1 to disarm traps or solve puzzles.' },
};

export function companion(id: string, free = false) {
  const c = COMPANIONS[id];
  return { id, name: c.name, life: c.life, maxLife: c.life, free };
}

export const SWORN_ENEMIES = ['kobold', 'orc', 'goblin', 'vampire', 'were', 'hyena', 'troll', 'ogre', 'chaos', 'catfolk', 'dragon', 'lizardman', 'serpent', 'fungus'];
