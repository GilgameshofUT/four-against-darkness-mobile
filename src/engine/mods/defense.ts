import type { Mod } from '../dice';
import type { Game } from '../game';
import type { Foe, Hero } from '../types';
import { CLASSES } from '../../data/classes';
import { armor, base, bonusValue, hasShieldInHand, heldLight, tierOf } from '../hero';
import { fspecial, hasTag, isUndead, isUnliving } from '../foe';
import { hasCond, hasLight } from '../effects';

export interface DefenseCtx {
  ranged?: boolean;
  melee?: boolean;
  fleeing?: boolean;
  withdrawing?: boolean;
  /** ignore armor (electric shock, goblin spider grab) */
  noArmor?: boolean;
  noShield?: boolean;
  trap?: boolean;
  area?: boolean;
}

export function defenseMods(g: Game, h: Hero, f: Foe | undefined, ctx: DefenseCtx = {}): Mod[] {
  const m: Mod[] = [];
  const cls = CLASSES[h.classId];
  const L = h.level;
  const T = tierOf(L);
  const c = g.s.combat;
  const hc = c?.heroes[h.id];
  const fid = f?.defId ?? '';

  m.push({ label: cls.name, value: bonusValue(cls.defense, h) });

  // Armor
  const arm = armor(h);
  const ab = base(arm);
  if (arm && ab && !ctx.noArmor) {
    let v = arm.magicDefense ? (ab.defense ?? 0) + arm.magicDefense : ab.defense ?? 0;
    if (arm.base === 'magic_armor') v = (arm.data?.def as number) ?? 1;
    const metal = ab.metallic || arm.data?.armorType === 'heavy';
    if (f && fspecial(f, 'iron_eater') && metal && (arm.data?.armorType === 'heavy' || ab.armorType === 'heavy')) v = 0;
    if (fid === 'cave_locusts') v *= 2;
    if (arm.base === 'clockwork_armor' && hasCond(h, 'clockwork_active')) v = 3;
    m.push({ label: arm.name, value: v });
    if (ab.armorType === 'leafsteel' && h.traits.includes('leafsteel_familiarity')) m.push({ label: 'Leafsteel Familiarity', value: 1 });
    if (f && fspecial(f, 'heavy_armor_bonus') && ab.armorType === 'heavy') {
      const hb = fspecial(f, 'heavy_armor_bonus')!;
      if (!hb.fromTurn || (c?.turn ?? 1) >= hb.fromTurn) m.push({ label: 'Poor foe weapons', value: hb.value });
    }
  }
  // Shield
  const sh = hasShieldInHand(h);
  if (sh) {
    const warning = sh.base === 'shield_of_warning';
    let blocked = !!ctx.noShield;
    if (!warning) {
      if (ctx.fleeing) blocked = true;
      if (c?.ambush && c.turn === 1) blocked = true;
      if (f && fspecial(f, 'flail')) blocked = true;
    }
    if (!blocked) {
      let v = 1 + (sh.magicDefense ?? 0);
      if (fid === 'cave_locusts') v *= 1; // only armor doubled
      m.push({ label: sh.name, value: v });
    }
  }
  const ring = h.inventory.find((i) => i.base === 'ring_protection');
  if (ring) m.push({ label: 'Ring of Protection', value: (ring.magicDefense ?? 1) });

  if (ctx.withdrawing) m.push({ label: 'Withdrawing', value: 1 });
  if ((ctx.fleeing || ctx.withdrawing) && c?.flags.illusionary_fog) m.push({ label: 'Illusionary Fog', value: 2 });
  if (ctx.fleeing && g.s.dungeon?.tiles[g.s.dungeon.currentTile]?.env === 'fungal' && !['ranger', 'rogue', 'acrobat', 'halfling', 'mushroom_monk'].includes(h.classId))
    m.push({ label: 'Slippery grotto', value: -1 });

  // Racial
  if (f) {
    const giantish = hasTag(f, 'giant') || hasTag(f, 'troll') || hasTag(f, 'ogre');
    if (h.classId === 'dwarf' && giantish) m.push({ label: 'Dwarf vs giants', value: 1 });
    if (h.classId === 'halfling' && giantish) m.push({ label: 'Halfling vs giants', value: L });
  }
  // Spells/effects
  if (hasCond(h, 'protection')) m.push({ label: 'Protection', value: 1 });
  if (hasCond(h, 'barkskin')) m.push({ label: 'Barkskin', value: f && (hasTag(f, 'fire') || ctx.area) ? -2 : 2 });
  const illusionImmune = f && (f.category === 'vermin' || isUnliving(f));
  if (hasCond(h, 'illusionary_armor') && !illusionImmune) m.push({ label: 'Illusionary Armor', value: T });
  if (hasCond(h, 'hazy_veil')) m.push({ label: 'Hazy Veil', value: T });
  if (hasCond(h, 'divine_protection')) m.push({ label: 'Divine Protection', value: 1 });
  if (hc?.wildform) m.push({ label: 'Wildform', value: Math.floor(L / 2) });
  if (hc?.parry && !ctx.ranged) m.push({ label: 'Parry', value: 1 });
  if (hasCond(h, 'gadget_weapon') && false) m.push({ label: '', value: 0 });

  // Traits
  const t = h.traits;
  if (t.includes('sacred_defense') && f && (isUndead(f) || hasTag(f, 'demon'))) m.push({ label: 'Sacred Defense', value: 1 });
  if (t.includes('nimble_dodge')) m.push({ label: 'Nimble Dodge', value: 1 });
  if (t.includes('tough_cap')) m.push({ label: 'Tough Cap', value: 1 });
  if (t.includes('scrapper')) m.push({ label: 'Scrapper', value: 1 });
  if (hc && !hc.firstAttackReceived && f) {
    if (t.includes('tight_guard')) m.push({ label: 'Tight Guard', value: 1 });
    if (t.includes('clockwork_specialist') && arm?.base === 'clockwork_armor') m.push({ label: 'Clockwork Specialist', value: 1 });
  }
  if (c?.flags[`shieldwall_${h.id}`] && !ctx.ranged) m.push({ label: 'Shieldwall', value: 1 });
  if (sh && !ctx.ranged && shieldWallAdjacent(g, h)) m.push({ label: 'Shield Wall', value: 1 });

  // Conditions
  if (hasCond(h, 'cursed')) m.push({ label: 'Cursed', value: -1 });
  if (hasCond(h, 'bear_trap')) m.push({ label: 'Bear trap wound', value: -1 });
  if (hasCond(h, 'evil_eye')) m.push({ label: 'Evil Eye', value: -1 });
  if (hasCond(h, 'hallucinating')) m.push({ label: 'Hallucinating', value: -1 });
  if (hasCond(h, 'blinded')) m.push({ label: 'Blinded', value: -1 });
  if (hasCond(h, 'tar_eyes')) m.push({ label: 'Tar in eyes', value: -1 });
  if (hasCond(h, 'trained_bats')) m.push({ label: 'Harried by bats', value: -1 });
  if (hc?.knockedDown) m.push({ label: 'Knocked down', value: -2 });
  if (c?.flags[`vault_fail_${h.id}`] === c?.turn) m.push({ label: 'Bad landing', value: -2 });

  // Foe-specific
  if (f) {
    if (fspecial(f, 'charge') && c?.turn === 1 && !c.flags[`charged_${h.id}`]) m.push({ label: 'Charge!', value: fspecial(f, 'charge')!.value });
    if (fspecial(f, 'light_defense') && heldLight(h)) m.push({ label: 'Light vs morlocks', value: 2 });
    if (fid === 'kelak') m.push({ label: 'Masterwork scimitar', value: -1 });
  }
  if (hc) for (const dm of hc.defenseMods) if (!dm.vsMelee || !ctx.ranged) m.push({ label: dm.label, value: dm.value });
  if (!hasLight(g) && h.classId !== 'kukla') m.push({ label: 'Darkness', value: -2 });
  if (ctx.ranged && g.s.dungeon?.tiles[g.s.dungeon.currentTile]?.cavernFeature === 'boulders') m.push({ label: 'Boulders', value: 1 });
  if (overloadedPenalty(h)) m.push({ label: 'Overloaded', value: -1 });
  return m.filter((x) => x.value !== 0);
}

function overloadedPenalty(h: Hero) {
  return h.inventory.filter((i) => base(i)?.kind === 'shield').length > 2;
}

/** Paladin "Shield Wall" trait: adjacent pairs are positions 1-2 and 3-4. */
function shieldWallAdjacent(g: Game, h: Hero): boolean {
  const order = g.s.dungeon?.marchingOrder ?? [];
  const i = order.indexOf(h.id);
  if (i < 0) return false;
  const partner = order[i % 2 === 0 ? i + 1 : i - 1];
  if (!partner) return false;
  const p = g.hero(partner);
  const has = (x: Hero) => x.traits.includes('paladin_shield_wall');
  if (!has(h) && !has(p)) return false;
  return !!hasShieldInHand(p) && p.status === 'ok';
}
