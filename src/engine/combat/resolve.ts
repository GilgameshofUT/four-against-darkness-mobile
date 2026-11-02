import type { Game } from '../game';
import type { Foe, Hero, Item } from '../types';
import type { Mod, RollResult } from '../dice';
import { attackMods, rangerDieShift } from '../mods/attack';
import { checkHalfLife, foeLevel, fspecial, isMajor, isMinor, foeAlive, hasTag, isUnliving } from '../foe';
import { weaponInfo, mainHand, tierOf } from '../hero';
import { TIER_DIE } from '../dice';
import { cs, hc } from './util';
import { checkMorale } from './morale';

export interface AttackOpts {
  weapon?: Item;
  ranged: boolean;
  subdual?: boolean;
  label?: string;
  extraMods?: Mod[];
  /** damage multiplier on hit (rage ×2, assassin ×3) */
  mult?: number;
  extraDamage?: number;
  keepBestOf?: number;
  maxKills?: number; // double kick, stars
  maxDamage?: number;
  magical?: boolean;
  spell?: string;
  fire?: boolean;
  noExplode?: boolean;
  thrown?: 'axe' | 'knife';
  /** Divine smite: 3 dmg major / 3 minor kills on hit */
  smite?: boolean;
  /** Pure "attack roll" by a non-hero source (e.g. stalactite), handled elsewhere */
}

export interface AttackResult {
  hit: boolean;
  kills: number;
  damage: number;
  roll: RollResult;
}

/** The core Attack roll against a foe: hits, kills/damage, special reactions. */
export async function attackFoe(g: Game, h: Hero, f: Foe, o: AttackOpts): Promise<AttackResult> {
  const c = cs(g);
  const x = hc(g, h);
  const w = weaponInfo(o.weapon);
  const mods = [...attackMods(g, h, f, { weapon: o.weapon, ranged: o.ranged, subdual: o.subdual, thrown: o.thrown }), ...(o.extraMods ?? [])];
  const L = foeLevel(g, f);
  const shift = rangerDieShift(h, f);
  const die = TIER_DIE[Math.min(5, tierOf(h.level) + shift)];
  const stalag = g.s.dungeon?.tiles[g.s.dungeon.currentTile]?.cavernFeature === 'stalagmites';
  const noExplode = o.noExplode || x.noExplode || stalag;
  const roll = await g.heroRoll({
    hero: h,
    kind: 'attack',
    label: o.label ?? `${o.ranged ? 'Shoot' : 'Attack'} ${f.name}`,
    mods,
    target: L,
    die,
    explode: !noExplode,
    explodeBonus: o.weapon?.masterwork ? 1 : 0,
    keepBestOf: o.keepBestOf,
    melee: !o.ranged,
    ranged: o.ranged,
    context: `Hit on ${L}+${isMinor(f) ? ` · each multiple of ${L} slays one` : ''}`,
    noLuck: !!fspecial(f, 'no_luck'),
  });
  const res: AttackResult = { hit: !!roll.success, kills: 0, damage: 0, roll };

  // Natural 1 consequences
  if (roll.natural === 1) await onNaturalOne(g, h, f, o);
  if (!o.ranged) c.flags[`meleed_${f.uid}`] = true;
  if (o.ranged) f.state.hitByRanged = true;
  if (!res.hit) {
    g.log('combat', `${h.name} misses ${f.name}.`);
    return res;
  }
  c.hitThisTurn.push(f.uid);

  // Immunities to weapon types
  if (fspecial(f, 'ranged_immune') && o.ranged && !(w?.cls === 'handgun' || w?.cls === 'rifle') && !o.spell) {
    g.log('combat', `The arrow passes harmlessly through ${f.name}!`);
    return { ...res, hit: false };
  }
  if (f.defId === 'flesh_golem' && w?.damage === 'crushing' && !o.spell) {
    g.log('combat', `${f.name} is immune to crushing blows!`);
    return { ...res, hit: false };
  }
  let multiple = Math.max(1, Math.floor(roll.total / L));
  if (o.smite) multiple = 3;

  if (isMinor(f)) {
    let kills = multiple;
    if (o.maxKills) kills = Math.min(kills, o.maxKills);
    if (o.weapon?.base === 'throwing_stars') kills = 1;
    kills = await applyMinorKills(g, h, f, kills, { subdual: o.subdual, magical: o.magical || !!o.spell, fire: o.fire, ranged: o.ranged });
    res.kills = kills;
  } else {
    let dmg = multiple;
    if (o.weapon?.base === 'throwing_stars' || o.maxDamage) dmg = Math.min(dmg, o.maxDamage ?? 1);
    if (o.mult) dmg *= o.mult;
    dmg += o.extraDamage ?? 0;
    if (c.flags[`berserk_${h.id}`]) dmg += 1;
    // Power Strike (after the roll)
    if (h.traits.includes('power_strike') && !g.isSpent(h, 'adventure', 'power_strike') && !o.smite) {
      if (await g.yesNo(`${h.name}: Power Strike?`, `Add +1 damage to this hit (${dmg} → ${dmg + 1}). Once per adventure.`, 'Power Strike!', 'Not now')) {
        g.spend(h, 'adventure', 'power_strike');
        dmg += 1;
      }
    }
    res.damage = await applyMajorDamage(g, h, f, dmg, { magical: o.magical || !!o.spell || !!o.weapon?.magicAttack || o.smite, fire: o.fire, subdual: o.subdual, singleBlow: true, weapon: o.weapon });
  }
  return res;
}

async function onNaturalOne(g: Game, h: Hero, f: Foe, o: AttackOpts) {
  const c = cs(g);
  const w = weaponInfo(o.weapon);
  if (w && (w.cls === 'handgun' || w.cls === 'rifle') && o.weapon) {
    o.weapon.broken = true;
    g.log('bad', `${h.name}'s ${o.weapon.name} explodes!`);
    await g.damage(h, 1, 'firearm explosion');
  }
  if (o.weapon?.data?.thin) {
    h.inventory = h.inventory.filter((i) => i !== o.weapon);
    if (h.equip.main === o.weapon.uid) h.equip.main = undefined;
    g.log('bad', `The thin masterwork blade snaps!`);
  }
  if (o.weapon?.base === 'torch_weapon') {
    g.log('bad', 'The torch is extinguished.');
  }
  if (o.thrown === 'axe' && !o.weapon?.masterwork && !o.weapon?.magicAttack && o.weapon) {
    h.inventory = h.inventory.filter((i) => i !== o.weapon);
    g.log('bad', 'The thrown axe breaks.');
  }
  if (c.flags[`flipkick_${h.id}`] || c.flags[`doublekick_${h.id}`] || (h.traits.includes('high_kicks') && !o.weapon && h.classId === 'mushroom_monk')) {
    hc(g, h).skipTurns = 1;
    g.log('bad', `${h.name} loses balance and must skip the next turn.`);
  }
  if (fspecial(f, 'riposte_on_one') && !o.ranged && !o.spell && foeAlive(f)) {
    g.log('combat', `${f.name} punishes the mistake with a riposte!`);
    const { foeSingleAttack } = await import('./foeturn');
    await foeSingleAttack(g, f, h);
  }
  void tierOf;
}

export async function applyMinorKills(g: Game, h: Hero | undefined, f: Foe, kills: number, o: { subdual?: boolean; magical?: boolean; fire?: boolean; ranged?: boolean; spell?: boolean } = {}): Promise<number> {
  const c = cs(g);
  let n = Math.min(kills, f.count);
  // Toadstool knights: first hit only breaks the shield
  if (f.defId === 'toadstool_knights') {
    const shields = (f.state.shields as number) ?? f.count;
    const broken = Math.min(n, shields);
    f.state.shields = shields - broken;
    n -= broken;
    if (broken) g.log('combat', `${broken} toadstool cap-shield${broken > 1 ? 's' : ''} shatter${broken > 1 ? '' : 's'}.`);
    if (n <= 0) return 0;
  }
  if (o.subdual) f.subdued = (f.subdued ?? 0) + n;
  f.count -= n;
  g.log('combat', `${h ? h.name + ' ' : ''}${o.subdual ? 'subdues' : 'slays'} ${n} ${f.name}${f.count ? ` (${f.count} left)` : ''}.`);
  if (h) onKill(g, h, f, n);
  // Regenerating trolls
  const regen = fspecial(f, 'regenerate_minion');
  if (regen && !o.magical && !o.fire && !o.subdual) {
    f.state.pendingRegen = ((f.state.pendingRegen as number) ?? 0) + n;
  }
  const revive = fspecial(f, 'revive_once');
  if (revive && !o.subdual) {
    const already = (f.state.revived as number) ?? 0;
    let back = 0;
    for (let i = 0; i < n && already + back < f.initialCount; i++) if (g.d6() >= revive.on) back++;
    if (back) {
      f.state.revived = already + back;
      f.state.pendingRevive = back;
    }
  }
  if (f.defId === 'jackal_men' && n > 0) {
    for (let i = 0; i < n; i++) if (g.d6() === 1) f.state.reinforce = ((f.state.reinforce as number) ?? 0) + g.roll('d3');
  }
  if (fspecial(f, 'fear_magic') && o.spell && foeAlive(f)) {
    const half = f.count <= f.initialCount / 2;
    await checkMorale(g, f, { forced: true, mod: half ? -1 : 0, reason: 'fear of magic' });
  }
  if (fspecial(f, 'fire_morale') && o.fire && foeAlive(f) && !f.state.fireMorale) {
    f.state.fireMorale = true;
    await checkMorale(g, f, { forced: true, reason: 'terrified of fire' });
  }
  if (f.count <= 0) {
    c.minorDefeated = true;
  }
  return n;
}

export async function applyMajorDamage(g: Game, h: Hero | undefined, f: Foe, dmg: number, o: { magical?: boolean; fire?: boolean; subdual?: boolean; singleBlow?: boolean; acid?: boolean; weapon?: Item; holy?: boolean; silver?: boolean } = {}): Promise<number> {
  const c = cs(g);
  if (fspecial(f, 'magic_only') && !o.magical && !o.holy && !o.weapon?.silvered && dmg < 2) {
    g.log('combat', `The blow passes through ${f.name} without harm!`);
    return 0;
  }
  if (fspecial(f, 'bounce') && !o.magical && g.chance(2)) {
    g.log('combat', `The blow bounces off ${f.name}'s fungal armor!`);
    return 0;
  }
  if (f.defId === 'cornucopia_of_chaos' && !o.magical && c.foes.some((x) => x.defId === 'azure_gremlins' && foeAlive(x))) {
    g.log('combat', 'The gremlins swarm in the way!');
    return 0;
  }
  f.life -= dmg;
  g.log('combat', `${h ? h.name + ' deals ' : ''}${dmg} damage to ${f.name} (${Math.max(0, f.life)}/${f.maxLife}).`);
  if (f.defId === 'fungus_hydra') {
    f.state.heads = Math.max(0, ((f.state.heads as number) ?? f.attacks) - dmg);
    if (!o.fire) f.state.regrow = [...(((f.state.regrow as unknown) as number[]) ?? []), ...Array(dmg).fill(c.turn + 2)] as unknown as string;
    else f.state.burned = true;
  }
  if (o.fire) f.state.burnedThisTurn = c.turn;
  if (o.acid) f.state.acidThisTurn = c.turn;
  if (o.fire && f.defId === 'fire_bear') f.state.breatheNext = true;
  if (f.life <= 0) {
    f.life = 0;
    if (o.subdual && !isUnliving(f)) f.subdued = 1;
    g.log('good', `${f.name} ${o.subdual ? 'is subdued' : 'is defeated'}!`);
    if (h) onKill(g, h, f, 1);
    c.majorDefeated.push(f.uid);
  } else {
    checkHalfLife(g, f);
    if (f.life < f.maxLife / 2 && !f.noMorale && !f.moraleChecked && !f.finalBoss) await checkMorale(g, f, {});
  }
  return dmg;
}

function onKill(g: Game, h: Hero, f: Foe, n: number) {
  if (h.classId === 'swashbuckler') {
    const before = h.resources.panache ?? 0;
    h.resources.panache = Math.min(h.level, before + n);
    if (h.resources.panache > before) g.log('good', `${h.name} gains Panache (${h.resources.panache}).`);
  }
  const lv = f.level * n;
  if (hasTag(f, 'goblin') && f.defId !== 'hobgoblins') h.milestones.goblinslayer = (h.milestones.goblinslayer ?? 0) + lv;
  if (hasTag(f, 'orc')) h.milestones.orcslayer = (h.milestones.orcslayer ?? 0) + lv;
  if (f.defId.includes('hobgoblin')) h.milestones.hobgoblins = (h.milestones.hobgoblins ?? 0) + lv;
  if (f.defId.includes('kobold')) h.milestones.kobolds = (h.milestones.kobolds ?? 0) + lv;
  if (f.category === 'vermin') h.milestones.vermin = (h.milestones.vermin ?? 0) + n;
  h.kills.total += n;
  void isMajor;
}

export function mainWeapon(h: Hero) {
  return mainHand(h);
}
