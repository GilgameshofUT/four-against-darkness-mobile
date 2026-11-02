import { CLASSES, type Bonus } from '../data/classes';
import { ITEM_BASES, type ItemBase } from '../data/items';
import type { ClassId, Hero, Item } from './types';

export function tierOf(level: number): number {
  return level <= 4 ? 1 : level <= 9 ? 2 : level <= 14 ? 3 : level <= 19 ? 4 : 5;
}

export function bonusValue(b: Bonus, h: Hero): number {
  switch (b) {
    case 'L':
      return h.level;
    case 'half':
      return Math.floor(h.level / 2);
    case 'tier':
      return tierOf(h.level);
    case 'one':
      return 1;
    default:
      return 0;
  }
}

export function maxLife(h: Hero): number {
  let extra = h.bonusLife;
  if (h.traits.includes('holy_resilience')) extra += h.level >= 10 ? 2 : 1;
  if (h.traits.includes('iron_stomach')) extra += 1;
  if (h.traits.includes('street_thug')) extra += 1;
  if (h.conditions.some((c) => c.id === 'secret_diet')) extra += 1;
  return CLASSES[h.classId].lifeBase + h.level + extra;
}

export function isAlive(h: Hero): boolean {
  return h.status === 'ok';
}

export function base(it: Item | undefined): ItemBase | undefined {
  return it ? ITEM_BASES[it.base] : undefined;
}

export function itemByUid(h: Hero, uid?: string): Item | undefined {
  return uid ? h.inventory.find((i) => i.uid === uid) : undefined;
}

export function mainHand(h: Hero) {
  return itemByUid(h, h.equip.main);
}
export function offHand(h: Hero) {
  return itemByUid(h, h.equip.off);
}
export function armor(h: Hero) {
  return itemByUid(h, h.equip.armor);
}

export function isWeapon(it?: Item): boolean {
  const b = base(it);
  return !!b && (b.kind === 'weapon' || it?.base === 'fireball_staff');
}

export function weaponInfo(it?: Item) {
  const b = base(it);
  if (!b?.weapon && it?.base !== 'magic_weapon') return undefined;
  if (it?.base === 'magic_weapon') {
    const inner = ITEM_BASES[(it.data?.kind as string) ?? 'hand_weapon'];
    return { ...inner.weapon!, damage: it.damage ?? inner.weapon!.damage };
  }
  return { ...b!.weapon!, damage: it?.damage ?? b!.weapon!.damage };
}

export function hasShieldInHand(h: Hero): Item | undefined {
  for (const it of [mainHand(h), offHand(h)]) if (it && base(it)?.kind === 'shield' && !it.broken) return it;
}

export function heldLight(h: Hero): boolean {
  if (h.classId === 'illusionist' && isAlive(h)) return true;
  const neck = itemByUid(h, h.equip.neck);
  if (neck?.base === 'glittering_crystal') return true;
  for (const it of [mainHand(h), offHand(h)]) if (it && (it.base === 'lantern' || it.base === 'torch_weapon')) return true;
  const sh = hasShieldInHand(h);
  if (sh?.lanternHook && h.inventory.some((i) => i.base === 'lantern' && i.data?.onHook)) return true;
  return false;
}

/** Free hand available for spellcasting. */
export function freeHand(h: Hero): boolean {
  const m = mainHand(h);
  const o = offHand(h);
  const w = weaponInfo(m);
  if (w && w.hands === 2) return false;
  const casterOk = (it?: Item) => !it || ['wand_of_sleep', 'wand_of_power', 'fireball_staff', 'holy_symbol_healing'].includes(it.base);
  return casterOk(m) || casterOk(o);
}

export function inventoryCount(h: Hero, baseId: string): number {
  return h.inventory.filter((i) => i.base === baseId && !i.used).reduce((a, i) => a + (i.qty ?? 1), 0);
}

export function weaponSlotsUsed(h: Hero): number {
  return h.inventory.reduce((a, i) => a + (isWeapon(i) ? (weaponInfo(i)?.cls === 'two' ? 2 : 1) * (i.base === 'throwing_stars' ? 0 : 1) : 0), 0);
}

export function shieldsCarried(h: Hero): number {
  return h.inventory.filter((i) => base(i)?.kind === 'shield').length;
}

export function overloaded(h: Hero): boolean {
  return weaponSlotsUsed(h) > 3 || shieldsCarried(h) > 2;
}

export function canUseItem(h: Hero, it: Item): string | undefined {
  const cls = CLASSES[h.classId];
  const b = base(it);
  if (!b) return;
  if (b.magic && !cls.canUseMagicItems) return 'Barbarians refuse magic items';
  if (b.magic && it.base.includes('potion') && h.classId === 'kukla') return 'Kuklas cannot drink potions';
  if (b.kind === 'armor') {
    const t = b.armorType ?? (it.data?.armorType as string);
    if (t === 'heavy' && !cls.armor.heavy) return `${cls.name}s cannot wear heavy armor`;
    if (t !== 'heavy' && !cls.armor.light) return `${cls.name}s cannot wear armor`;
    if (t === 'clockwork' && h.classId !== 'gnome' && !cls.armor.light) return 'Cannot wear armor';
  }
  if (b.kind === 'shield' && !cls.armor.shield) return `${cls.name}s cannot use shields`;
  const w = weaponInfo(it);
  if (w) {
    const cat = w.cls === 'handgun' || w.cls === 'rifle' ? 'firearm' : w.cls;
    if (!cls.weapons.includes(cat as never)) return `${cls.name}s cannot use this weapon`;
    if (h.classId === 'light_gladiator' && w.ranged) return 'Light gladiators use light hand weapons only';
  }
  if (it.base === 'wand_of_sleep' && !['wizard', 'illusionist', 'elf'].includes(h.classId)) return 'Only wizards, illusionists and elves';
  if (['fireball_staff', 'wand_of_power'].includes(it.base) && h.classId !== 'wizard') return 'Only wizards';
}

export function className(id: ClassId) {
  return CLASSES[id].name;
}
