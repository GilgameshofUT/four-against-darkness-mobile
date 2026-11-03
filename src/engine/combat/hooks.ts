import type { Game } from '../game';
import type { Foe, Hero } from '../types';
import type { DefenseCtx } from '../mods/defense';
import { fspecial, foeAlive, isMinor } from '../foe';
import { armor, hasShieldInHand, mainHand, isAlive, base } from '../hero';
import { save } from '../checks';
import { addCondition, gainMadness, isMetal } from '../effects';
import { cs, hc } from './util';
export { foeTurnStart, foeTurnEnd, combatStart } from './hooks2';

/** A foe's attack connected (failed Defense). */
export async function onHeroHit(g: Game, f: Foe, h: Hero, dmg: number, ctx: DefenseCtx) {
  const c = cs(g);
  const id = f.defId;
  if (fspecial(f, 'iron_eater')) return ironEater(g, h);
  if (id === 'green_slime') {
    const r = await save(g, h, { type: 'disease', target: 4, label: 'Save vs L4 disease (green slime)', bonuses: { halfling: 'half' } });
    if (!r.success) addCondition(h, { id: 'green_slime', label: 'Green slime infection' });
    return;
  }
  if (id === 'goblin_spider') {
    hc(g, h).webbed = true;
    c.flags.spiderVictim = h.id;
    g.log('bad', `${h.name} is snared and hauled up toward the ceiling!`);
  }
  const died = await g.damage(h, dmg, f.name, { physical: true });
  if (died) {
    if (fspecial(f, 'mummy_rise') && !h.conditions.some((x) => x.id === 'no_resurrect')) c.flags.mummyRise = h.id;
    if (id === 'cockatrices' || id === 'boneworms') h.conditions.push({ id: 'no_resurrect', label: 'Cannot be resurrected' });
    if (h.conditions.some((x) => x.id === 'green_slime')) c.flags.slimeRise = h.id;
    if (id === 'doppelganger' && c.flags.mimic === h.id) {
      f.fled = true;
      g.log('combat', 'Its task done, the doppelganger flees.');
    }
    return;
  }
  // Post-hit effects on living PCs
  const poison = fspecial(f, 'poison_hit');
  if (poison && h.classId !== 'kukla') {
    if (poison.endOfCombat) c.flags[`poisonEnd_${h.id}`] = true;
    else {
      const L = typeof poison.L === 'number' ? poison.L : g.hcl() + Number(poison.L.slice(2) || 0);
      const r = await save(g, h, { type: 'poison', target: L, label: `Save vs L${L} poison`, bonuses: poison.bonus });
      if (!r.success) await g.damage(h, poison.extraDamage ?? 1, `${f.name} venom`);
    }
  }
  if (fspecial(f, 'infection')) c.flags[`wounded_${h.id}`] = true;
  const cough = fspecial(f, 'cough');
  if (cough) {
    const r = await save(g, h, { type: 'poison', target: cough.L, label: 'Save vs L2 poison (spores)' });
    if (!r.success) addCondition(h, { id: 'coughing', label: 'Coughing', until: 'combat' });
  }
  const dis = fspecial(f, 'disease_end');
  if (dis) {
    const r = await save(g, h, { type: 'disease', target: dis.L, label: `Save vs L${dis.L} disease`, bonuses: dis.bonus });
    if (!r.success) c.flags[`diseaseEnd_${h.id}`] = true;
  }
  if (fspecial(f, 'paralyze_limb') && dmg >= 2) {
    const leg = g.d6() >= 4;
    addCondition(h, { id: leg ? 'paralyzed_leg' : 'paralyzed_arm', label: `Paralyzed ${leg ? 'leg' : 'arm'}` });
    g.log('bad', `${h.name}'s ${leg ? 'leg' : 'arm'} goes numb with venom!`);
  }
  const par = fspecial(f, 'paralyze_hit');
  if (par) {
    const r = await save(g, h, { type: 'poison', target: par.L, label: `Save vs L${par.L} paralysis`, bonuses: { halfling: 'reroll' } });
    if (!r.success) hc(g, h).skipTurns = Math.max(hc(g, h).skipTurns, 1);
  }
  const pet = fspecial(f, 'petrify_hit');
  if (pet) {
    const r = await save(g, h, { type: 'petrify', target: pet.L, label: `Save vs L${pet.L} petrification` });
    if (!r.success) petrify(g, h);
  }
  const drain = fspecial(f, 'level_drain_hit');
  if (drain) {
    const r = await save(g, h, { type: 'magic', target: drain.L, label: `Save vs L${drain.L} energy drain` });
    if (!r.success) levelDrain(g, h);
  }
  if (c.flags.chaosPower === 'energy_drain' && (id === 'chaos_lord' || id === 'chaos_lord_slaver')) {
    const r = await save(g, h, { type: 'magic', target: 4, label: 'Save vs L4 energy drain' });
    if (!r.success) levelDrain(g, h);
  }
  const claw = fspecial(f, 'claw_curse');
  if (claw) {
    const r = await save(g, h, { type: 'magic', target: claw.L, label: `Save vs L${claw.L} magic` });
    if (!r.success) addCondition(h, { id: 'claw_curse', label: 'Hag curse (-1 Attack)', until: 'combat' });
  }
  const rot = fspecial(f, 'end_turn_rot');
  if (rot) {
    const r = await save(g, h, { type: 'magic', target: rot.L, label: `Save vs L${rot.L} magic (spore rot)` });
    if (!r.success) c.flags[`rot_${h.id}`] = true;
  }
  if (id === 'stirges') hc(g, h).stirged = true;
  if (id === 'skeletal_demon') c.flags.summonSkeletons = ((c.flags.summonSkeletons as number) ?? 0) + dmg;
  // Poisonous flesh (mushroom monk trait) vs bites
  if (h.traits.includes('poisonous_flesh') && !g.isSpent(h, 'combat', 'poisonous_flesh') && !f.tags.includes('undead')) {
    g.spend(h, 'combat', 'poisonous_flesh');
    f.state.poisonedAt = c.turn + 2;
  }
  void ctx;
}

/** Defense succeeded: counters & ripostes. */
export async function onHeroMissed(g: Game, f: Foe, h: Hero, exploded: boolean, margin: number) {
  const c = cs(g);
  const { attackFoe } = await import('./resolve');
  const melee = !c.flags.rangedPhase;
  if (!foeAlive(f)) return;
  // Light gladiator Parry and Counter-strike (once per combat, explosive defense)
  if (exploded && h.classId === 'light_gladiator' && !g.isSpent(h, 'combat', 'counter_strike')) {
    g.spend(h, 'combat', 'counter_strike');
    hc(g, h).counterBonus = { foe: f.uid, value: margin };
    g.log('good', `${h.name} parries brilliantly: +${margin} to the next attack on ${f.name}!`);
  }
  if (exploded && h.traits.includes('lethal_dodge') && melee) {
    g.log('good', `${h.name}'s Lethal Dodge!`);
    await attackFoe(g, h, f, { weapon: mainHand(h), ranged: false, label: 'Lethal Dodge counter' });
  }
  if (!foeAlive(f)) return;
  const opts: { value: string; label: string; desc?: string }[] = [];
  if (h.traits.includes('shield_bash') && hasShieldInHand(h) && !g.isSpent(h, 'combat', 'shield_bash') && melee) opts.push({ value: 'shield_bash', label: 'Shield Bash (+L)' });
  if (h.traits.includes('opportunist') && !g.isSpent(h, 'combat', 'opportunist') && melee) opts.push({ value: 'opportunist', label: 'Opportunist (free off-hand attack)' });
  if (h.traits.includes('riposte') && !g.isSpent(h, 'combat', 'riposte') && melee) opts.push({ value: 'riposte', label: 'Riposte (off-hand counter)' });
  if (h.traits.includes('arena_reflexes') && !g.isSpent(h, 'combat', 'arena_reflexes')) opts.push({ value: 'arena_reflexes', label: 'Arena Reflexes (leave the fight)', desc: 'Slip out of the melee without being attacked.' });
  if (!opts.length) return;
  const pick = await g.choose<string>(`${h.name} dodges ${f.name}!`, [...opts, { value: '', label: 'No', tone: 'quiet' }], { who: h.id });
  if (!pick) return;
  g.spend(h, 'combat', pick);
  if (pick === 'arena_reflexes') {
    hc(g, h).fled = true;
    g.log('good', `${h.name} slips away from the melee.`);
    return;
  }
  const off = h.inventory.find((i) => i.uid === h.equip.off) ?? mainHand(h);
  if (pick === 'shield_bash') await attackFoe(g, h, f, { weapon: undefined, ranged: false, label: 'Shield Bash', extraMods: [{ label: 'Shield Bash', value: h.level + 2 }] });
  else await attackFoe(g, h, f, { weapon: off, ranged: false, label: pick === 'riposte' ? 'Riposte' : 'Opportunist strike' });
}

async function ironEater(g: Game, h: Hero) {
  const order = [armor(h), hasShieldInHand(h), mainHand(h)].filter((i) => i && (isMetal(i.base) || base(i)?.kind === 'shield'));
  const target = order.find((i) => i && !(base(i)?.kind === 'armor' && base(i)?.armorType === 'light'));
  if (target) {
    h.inventory = h.inventory.filter((i) => i !== target);
    for (const k of ['main', 'off', 'armor'] as const) if (h.equip[k] === target.uid) h.equip[k] = undefined;
    g.log('bad', `The iron eater devours ${h.name}'s ${target.name}!`);
    // Gear loss is easy to miss in the combat scroll: demand a tap.
    await g.say(`${target.name} devoured!`, `The iron eater eats ${h.name}'s ${target.name}. Check the hero sheet — Defense may have dropped.`, 'monsters/iron_eater');
  } else {
    const lost = Math.min(g.s.partyGold, g.roll('3d6'));
    g.s.partyGold -= lost;
    g.log('bad', `The iron eater gobbles ${lost} gp!`);
  }
}

export function petrify(g: Game, h: Hero) {
  h.status = 'petrified';
  g.log('bad', `${h.name} is turned to stone!`);
  if (g.s.dungeon?.lanternBearer === h.id) {
    g.s.dungeon.lanternBearer = undefined;
    g.log('bad', 'The lantern drops to the floor.');
  }
}

export function levelDrain(g: Game, h: Hero) {
  if (h.classId === 'kukla') return;
  h.level = Math.max(0, h.level - 1);
  h.life = Math.max(1, h.life - 1);
  const c = h.conditions.find((x) => x.id === 'energy_drain');
  if (c) c.value = (c.value ?? 1) + 1;
  else h.conditions.push({ id: 'energy_drain', label: 'Energy drained', value: 1 });
  g.log('bad', `${h.name} loses a level to energy drain! (L${h.level})`);
}

export async function madnessSave(g: Game, h: Hero, L: number, label: string) {
  const r = await save(g, h, { type: 'madness', target: L, label });
  if (!r.success) await gainMadness(g, h, 1, label);
}

export function minorOrMajor(f: Foe) {
  return isMinor(f) ? 'minor' : 'major';
}
export function living(h: Hero) {
  return isAlive(h) && h.classId !== 'kukla';
}
