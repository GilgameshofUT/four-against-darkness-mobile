import type { Game } from './game';
import type { Hero, Condition } from './types';
import { isAlive, maxLife, hasShieldInHand, armor, base } from './hero';

/** Damage reduction traits (once per combat/adventure) offered to the player. */
async function offerReduction(g: Game, h: Hero, n: number, physical: boolean): Promise<number> {
  if (!physical || n <= 0 || !g.s.combat) return n;
  const opts: { id: string; label: string; scope: 'combat' | 'adventure' }[] = [];
  const t = h.traits;
  if (t.includes('graceful_dodge') && !g.isSpent(h, 'combat', 'graceful_dodge')) opts.push({ id: 'graceful_dodge', label: 'Graceful Dodge (-1)', scope: 'combat' });
  if (t.includes('tough_skinned') && !g.isSpent(h, 'combat', 'tough_skinned')) opts.push({ id: 'tough_skinned', label: 'Tough Skinned (-1)', scope: 'combat' });
  if (t.includes('brace_for_impact') && !g.isSpent(h, 'combat', 'brace_for_impact')) opts.push({ id: 'brace_for_impact', label: 'Brace for Impact (-1)', scope: 'combat' });
  if (t.includes('fey_grace') && !g.isSpent(h, 'combat', 'fey_grace')) opts.push({ id: 'fey_grace', label: 'Fey Grace (-1)', scope: 'combat' });
  if (t.includes('armor_mastery') && armor(h)?.base === 'heavy_armor' && !g.isSpent(h, 'combat', 'armor_mastery')) opts.push({ id: 'armor_mastery', label: 'Armor Mastery (-1)', scope: 'combat' });
  if (t.includes('shield_expert') && hasShieldInHand(h) && !g.isSpent(h, 'adventure', 'shield_expert')) opts.push({ id: 'shield_expert', label: 'Shield Expert (-1)', scope: 'adventure' });
  if (t.includes('unyielding_form') && !g.isSpent(h, 'adventure', 'unyielding_form')) opts.push({ id: 'unyielding_form', label: 'Unyielding Form (ignore up to 2)', scope: 'adventure' });
  // Tough as Stone is automatic on the first physical attack received each combat
  if (t.includes('tough_as_stone') && !g.isSpent(h, 'combat', 'tough_as_stone')) {
    g.spend(h, 'combat', 'tough_as_stone');
    g.log('good', `${h.name} is Tough as Stone: -1 damage.`);
    n -= 1;
    if (n <= 0) return 0;
  }
  if (!opts.length) return n;
  const pick = await g.choose<string>(`${h.name} takes ${n} damage`, [
    ...opts.map((o) => ({ value: o.id, label: o.label, tone: 'primary' as const })),
    { value: '', label: 'Take it', tone: 'quiet' },
  ], { who: h.id });
  if (!pick) return n;
  const o = opts.find((x) => x.id === pick)!;
  g.spend(h, o.scope, o.id);
  const red = pick === 'unyielding_form' ? 2 : 1;
  g.log('good', `${h.name}: ${o.label.replace(/ \(.+\)/, '')} reduces damage by ${Math.min(red, n)}.`);
  return Math.max(0, n - red);
}

export async function applyDamage(g: Game, h: Hero, n: number, source: string, opts: { physical?: boolean; noReduce?: boolean } = {}): Promise<boolean> {
  if (!opts.noReduce) n = await offerReduction(g, h, n, !!opts.physical);
  // Green slime infection: +1 whenever wounded
  if (n > 0 && h.conditions.some((c) => c.id === 'green_slime')) n += 1;
  if (n <= 0) return false;
  // Bear form absorbs damage
  const bear = h.conditions.find((c) => c.id === 'bear_form');
  if (bear) {
    bear.value = (bear.value ?? 8) - n;
    bear.tilesLeft = (bear.tilesLeft ?? 0) + n; // damage taken in bear form
    g.log('bad', `${h.name} (bear) takes ${n} damage (${Math.max(0, bear.value)} bear Life left).`);
    if (bear.value <= 0) {
      h.conditions = h.conditions.filter((c) => c !== bear);
      g.log('bad', `${h.name} is forced out of bear form!`);
    }
    g.io.changed();
    return false;
  }
  const before = h.life;
  h.life -= n;
  g.log('bad', `${h.name} loses ${n} Life (${source}). ${Math.max(0, h.life)}/${maxLife(h)}`);
  // Trait-based survival
  if (h.life <= 1 && before > 1 && h.life >= 0 && h.traits.includes('stubborn_endurance') && !g.isSpent(h, 'adventure', 'stubborn_endurance')) {
    if (await g.yesNo(`${h.name}: Stubborn Endurance?`, 'Stay at 2 Life instead.', 'Endure!', 'No')) {
      g.spend(h, 'adventure', 'stubborn_endurance');
      h.life = 2;
    }
  }
  if (h.life <= 0 && h.traits.includes('strength_of_spirit') && !g.isSpent(h, 'adventure', 'strength_of_spirit')) {
    if (await g.yesNo(`${h.name}: Strength of Spirit?`, 'Remain at 1 Life (once per adventure).', 'Hold on!', 'No')) {
      g.spend(h, 'adventure', 'strength_of_spirit');
      h.life = 1;
    }
  }
  if (h.life <= 0) {
    h.life = 0;
    await kill(g, h, source);
    return true;
  }
  g.io.changed();
  return false;
}

export async function kill(g: Game, h: Hero, source: string) {
  h.status = 'dead';
  h.conditions = h.conditions.filter((c) => c.id === 'no_resurrect' || c.id === 'digested');
  if (/boneworm/i.test(source)) h.conditions.push({ id: 'no_resurrect', label: 'Bones devoured' });
  if (/colossus/i.test(source)) h.conditions.push({ id: 'no_resurrect', label: 'Digested into spores' });
  g.log('bad', `☠ ${h.name} has fallen! (${source})`);
  // Druid companion bond
  const dung = g.s.dungeon;
  if (dung?.lanternBearer === h.id) {
    dung.lanternBearer = undefined;
    g.log('bad', 'The lantern clatters to the floor!');
  }
  if (dung) dung.marchingOrder = dung.marchingOrder.filter((id) => id !== h.id).concat(h.id);
  g.io.changed();
}

export function addCondition(h: Hero, c: Condition) {
  if (h.conditions.some((x) => x.id === c.id)) return;
  h.conditions.push(c);
}

export function hasCond(h: Hero, id: string) {
  return h.conditions.some((c) => c.id === id);
}

export function removeCond(h: Hero, id: string) {
  h.conditions = h.conditions.filter((c) => c.id !== id);
}

/** Conditions cured by a Blessing. */
export const BLESSABLE = ['cursed', 'petrified', 'contaminated', 'bewitched', 'green_slime', 'energy_drain', 'paralyzed_arm', 'paralyzed_leg', 'cordyceps', 'poisoned_food', 'claw_curse', 'witch_curse'];

export function blessTargets(g: Game): Hero[] {
  return g.partyAll().filter((h) => h.status === 'petrified' || (isAlive(h) && (h.conditions.some((c) => BLESSABLE.includes(c.id)) || h.madness > 0)));
}

export async function applyBlessing(g: Game, h: Hero) {
  if (h.status === 'petrified') {
    h.status = 'ok';
    g.log('good', `${h.name} is restored from stone!`);
    return;
  }
  const conds = h.conditions.filter((c) => BLESSABLE.includes(c.id));
  const opts = conds.map((c) => ({ value: c.id, label: `Remove: ${c.label}` }));
  if (h.madness > 0) opts.push({ value: 'madness', label: 'Heal 1 Madness' });
  if (!opts.length) {
    g.log('info', 'The Blessing has nothing to cure.');
    return;
  }
  const pick = opts.length === 1 ? opts[0].value : await g.choose('Blessing removes…', opts, { who: h.id });
  if (pick === 'madness') {
    h.madness--;
    g.log('good', `${h.name} recovers 1 Madness.`);
    return;
  }
  const c = conds.find((x) => x.id === pick)!;
  if (c.id === 'energy_drain') {
    h.level += c.value ?? 1;
    h.life += c.value ?? 1;
    g.log('good', `${h.name} regains ${c.value ?? 1} lost level(s).`);
  }
  if (c.id === 'witch_curse') {
    c.turnsLeft = 3;
    g.log('good', `The curse is slowed for 3 turns.`);
    return;
  }
  removeCond(h, c.id);
  g.log('good', `${h.name}: ${c.label} removed.`);
}

export async function gainMadness(g: Game, h: Hero, n = 1, source = '') {
  if (!isAlive(h)) return;
  if (h.traits.includes('iron_will') && !g.isSpent(h, 'adventure', 'iron_will_ignore')) {
    g.spend(h, 'adventure', 'iron_will_ignore');
    g.log('good', `${h.name}'s Iron Will ignores the first Madness.`);
    n--;
    if (n <= 0) return;
  }
  if (h.traits.includes('stubborn_resolve') && !g.isSpent(h, 'adventure', 'stubborn_resolve')) {
    if (await g.yesNo(`${h.name}: Stubborn Resolve?`, 'Avoid gaining 1 Madness.', 'Resist', 'No')) {
      g.spend(h, 'adventure', 'stubborn_resolve');
      n--;
      if (n <= 0) return;
    }
  }
  if (h.level <= 4 && h.classId !== 'kukla') {
    const choice = await g.choose(`${h.name} gains ${n} Madness${source ? ' (' + source + ')' : ''}`, [
      { value: 'mad', label: `Gain ${n} Madness`, desc: `Now ${h.madness}; insane above ${madnessLimit(h)}` },
      { value: 'dmg', label: `Take ${2 * n} damage instead`, desc: `${h.life} Life` },
    ], { who: h.id });
    if (choice === 'dmg') {
      await applyDamage(g, h, 2 * n, 'shock', { noReduce: true });
      return;
    }
  }
  h.madness += n;
  g.log('bad', `${h.name} gains ${n} Madness (${h.madness}).`);
  if (h.madness > madnessLimit(h)) {
    if (h.classId === 'kukla') {
      h.status = 'dead';
      g.log('bad', `${h.name}'s soul departs. The doll slumps lifeless.`);
    } else {
      h.status = 'insane';
      g.log('bad', `${h.name} goes insane and runs cackling into the dark, never to be seen again!`);
    }
    if (g.s.dungeon?.lanternBearer === h.id) g.s.dungeon.lanternBearer = undefined;
  }
  g.io.changed();
}

export function madnessLimit(h: Hero) {
  return h.classId === 'wizard' ? h.level + 1 : h.level;
}

export function hasLight(g: Game): boolean {
  const d = g.s.dungeon;
  if (!d) return true;
  if (g.party().some((h) => h.classId === 'illusionist')) return true;
  const tile = d.tiles[d.currentTile];
  if (tile?.featureState?.glow) return true;
  if (d.lanternBearer) {
    const h = g.party().find((x) => x.id === d.lanternBearer);
    if (h && h.status === 'ok') return true;
  }
  return g.party().some((h) => {
    const neck = h.inventory.find((i) => i.uid === h.equip.neck);
    return neck?.base === 'glittering_crystal';
  });
}

export function isMetal(itBase: string): boolean {
  const b = base({ base: itBase } as never);
  return !!b?.metallic || ['hand_weapon', 'two_handed', 'light_weapon', 'magic_weapon', 'crossbow', 'handgun', 'rifle', 'heavy_armor', 'clockwork_armor', 'lantern'].includes(itBase);
}
