import type { Game } from './game';
import type { Hero, Item } from './types';
import { base, weaponInfo, canUseItem } from './hero';

/** Equip an item into the right slot(s), handling hands. */
export function equipItem(g: Game | undefined, h: Hero, it: Item) {
  const b = base(it);
  if (!b) return;
  if (b.kind === 'armor') {
    h.equip.armor = it.uid;
    return;
  }
  if (it.base === 'glittering_crystal' || it.base === 'amulet' || it.base === 'miners_amulet') {
    h.equip.neck = it.uid;
    return;
  }
  const w = weaponInfo(it);
  if (b.kind === 'shield') {
    if (weaponInfo(mainOf(h))?.hands === 2) h.equip.main = undefined;
    h.equip.off = it.uid;
    return;
  }
  if (it.base === 'lantern') {
    // goes in off hand (or main if off is a shield and main is free)
    if (!h.equip.off || base(h.inventory.find((i) => i.uid === h.equip.off))?.kind !== 'shield') h.equip.off = it.uid;
    else h.equip.main = it.uid;
    if (g?.s.dungeon) g.s.dungeon.lanternBearer = h.id;
    return;
  }
  if (w) {
    h.equip.main = it.uid;
    if (w.hands === 2) h.equip.off = undefined;
  }
}

function mainOf(h: Hero) {
  return h.inventory.find((i) => i.uid === h.equip.main);
}

export function unequip(h: Hero, uid: string) {
  for (const k of ['main', 'off', 'armor', 'neck', 'backShield'] as const) if (h.equip[k] === uid) h.equip[k] = undefined;
}

export function removeItem(h: Hero, uid: string): Item | undefined {
  const it = h.inventory.find((i) => i.uid === uid);
  if (!it) return;
  h.inventory = h.inventory.filter((i) => i !== it);
  unequip(h, uid);
  return it;
}

export function transfer(from: Hero, to: Hero, uid: string): string | undefined {
  if (from.madness > 0 || to.madness > 0) return 'Paranoid heroes will not exchange equipment';
  const it = from.inventory.find((i) => i.uid === uid);
  if (!it) return 'Missing item';
  const b = base(it);
  if (b?.kind === 'armor') {
    const odd = (h: Hero) => ['dwarf', 'elf', 'kukla', 'halfling', 'gnome'].includes(h.classId);
    if ((odd(from) || odd(to)) && from.classId !== to.classId) return 'Armor only fits the same build';
  }
  removeItem(from, uid);
  to.inventory.push(it);
  return;
}

/** Best equipment layout automatically (used after character creation and shop). */
export function autoEquip(h: Hero) {
  const usable = h.inventory.filter((i) => !canUseItem(h, i));
  const armorIt = usable.filter((i) => base(i)?.kind === 'armor').sort((a, b) => (base(b)?.defense ?? 0) - (base(a)?.defense ?? 0))[0];
  if (armorIt && !h.equip.armor) h.equip.armor = armorIt.uid;
}

export function lanternHolders(g: Game): Hero[] {
  return g.party().filter((h) => h.inventory.some((i) => i.base === 'lantern'));
}
