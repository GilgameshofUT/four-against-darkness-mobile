import type { Game } from '../game';
import type { Hero } from '../types';
import type { Action } from './actions';
import { pickFoe } from './actions';
import { attackFoe, applyMinorKills, applyMajorDamage } from './resolve';
import { cs, hc, liveFoes, meleeEligible } from './util';
import { mainHand, offHand, tierOf, maxLife, isAlive, weaponInfo } from '../hero';
import { isMinor, foeLevel, isUnliving, hasTag, fspecial, isMajor } from '../foe';
import { applyBlessing, blessTargets, addCondition } from '../effects';
import { groupStealth } from '../checks';
import { traitActions } from './traitactions';

export function abilityActions(g: Game, h: Hero): Action[] {
  const a: Action[] = [];
  const c = cs(g);
  const L = h.level;
  const T = tierOf(L);
  const r = h.resources;
  const melee = meleeEligible(g, h);

  // Cleric prayers
  if (h.classId === 'cleric') {
    a.push({ id: 'heal', label: `Prayer: Healing (${r.healing ?? 0})`, group: 'magic', icon: 'icons/prayer', disabled: (r.healing ?? 0) > 0 ? false : 'No Healing prayers left', desc: `Heal d6+${L}${h.inventory.some((i) => i.base === 'holy_symbol_healing') ? '+2' : ''} Life.`, run: async () => clericHeal(g, h) });
    a.push({ id: 'bless', label: `Prayer: Blessing (${r.blessing ?? 0})`, group: 'magic', icon: 'icons/prayer', disabled: (r.blessing ?? 0) > 0 ? (blessTargets(g).length ? false : 'No one needs it') : 'No Blessings left', run: async () => {
      const t = await g.pickHero('Bless whom?', blessTargets(g), undefined, true);
      if (!t) return false;
      await prayerBeads(g, h, 'blessing');
      await applyBlessing(g, t);
      return true;
    } });
  }
  // Paladin prayer points
  if (h.classId === 'paladin' && (r.prayer ?? 0) > 0) {
    a.push({ id: 'lay_hands', label: `Prayer: Heal (${r.prayer} pts)`, group: 'magic', icon: 'icons/prayer', run: async () => {
      const t = await g.pickHero('Heal whom?', g.party().filter((x) => x.life < maxLife(x)), undefined, true);
      if (!t) return false;
      const n = await g.choose('Spend how many prayer points?', Array.from({ length: Math.min(r.prayer, maxLife(t) - t.life) }, (_, i) => ({ value: i + 1, label: `${i + 1} (+${i + 1} Life)` })));
      r.prayer -= n;
      g.heal(t, n, 'paladin prayer');
      return true;
    } });
  }
  // Barbarian rage
  if (h.classId === 'barbarian' && (r.rage ?? 0) > 0 && melee)
    a.push({ id: 'rage', label: `Rage Attack (${r.rage})`, group: 'attack', icon: 'icons/rage', desc: 'Roll 3 dice, keep the best; double damage on a hit.', run: async () => {
      const f = await pickFoe(g, 'Rage against…');
      if (!f) return false;
      r.rage--;
      await attackFoe(g, h, f, { weapon: mainHand(h), ranged: false, keepBestOf: 3, mult: 2, label: 'RAGE ATTACK' });
      return true;
    } });
  // Assassin
  if (h.classId === 'assassin') {
    const x = hc(g, h);
    if (x.marked && liveFoes(g).some((f) => f.uid === x.marked))
      a.push({ id: 'strike_mark', label: 'Strike from the shadows (×3)', group: 'attack', desc: 'Triple damage on your marked target.', run: async () => {
        const f = liveFoes(g).find((ff) => ff.uid === x.marked)!;
        const living = !isUnliving(f) && !hasTag(f, 'slime') || (L >= 4 && h.choices.assassin_unliving === 'yes');
        await attackFoe(g, h, f, { weapon: mainHand(h), ranged: !!weaponInfo(mainHand(h))?.ranged, mult: living ? 3 : 1, label: 'Assassinate' });
        x.marked = undefined;
        x.hidden = false;
        return true;
      } });
    else if (!g.party().some((p) => p !== h && c.heroes[p.id]?.hidden))
      a.push({ id: 'hide', label: 'Hide in Shadows', group: 'ability', icon: 'icons/stealth', desc: 'Stealth Save vs the target: next turn, a hit deals triple damage. On a failure the target gets a free attack.', run: async () => {
        const f = await pickFoe(g, 'Mark which target?');
        if (!f) return false;
        const { stealthMods } = await import('../mods/save');
        const res = await g.heroRoll({ hero: h, kind: 'stealth', label: 'Hide in Shadows', mods: stealthMods(g, h), target: foeLevel(g, f) });
        if (res.success) {
          x.marked = f.uid;
          x.hidden = true;
          g.log('good', `${h.name} melts into the shadows, marking ${f.name}.`);
        } else {
          g.log('bad', `${h.name} is spotted!`);
          const { foeSingleAttack } = await import('./foeturn');
          await foeSingleAttack(g, f, h);
        }
        return true;
      } });
  }
  // Acrobat tricks
  if (h.classId === 'acrobat' && (r.trick ?? 0) > 0) {
    const spend = () => (r.trick -= 1);
    a.push({ id: 'distract', label: `Trick: Distract (${r.trick})`, group: 'ability', icon: 'icons/trick', desc: `Reduce a foe's L by ${T} for the encounter (not Weird Monsters or Vermin).`, run: async () => {
      const f = await pickFoe(g, 'Distract whom?', (f) => f.category !== 'weird' && f.category !== 'vermin');
      if (!f) return false;
      spend();
      f.levelMods.push({ label: 'Distract', value: -T });
      g.log('good', `${h.name}'s antics distract ${f.name} (−${T} L).`);
      return true;
    } });
    if (melee) a.push({ id: 'flip', label: 'Trick: Flip Kick', group: 'attack', desc: 'Unarmed attack ignoring the −2. On a 1, skip your next turn.', run: async () => {
      const f = await pickFoe(g, 'Flip kick…');
      if (!f) return false;
      spend();
      c.flags[`flipkick_${h.id}`] = true;
      await attackFoe(g, h, f, { weapon: undefined, ranged: false, label: 'Flip Kick' });
      c.flags[`flipkick_${h.id}`] = false;
      return true;
    } });
    if (melee && liveFoes(g).some(isMinor)) a.push({ id: 'double_kick', label: 'Trick: Double Kick', group: 'attack', desc: 'Two unarmed attacks at −1 vs Minor Foes (1 kill each).', run: async () => {
      spend();
      c.flags[`doublekick_${h.id}`] = true;
      for (let i = 0; i < 2; i++) {
        const f = await pickFoe(g, `Double kick ${i + 1}/2`, isMinor);
        if (f) await attackFoe(g, h, f, { weapon: undefined, ranged: false, maxKills: 1, label: 'Double Kick' });
      }
      c.flags[`doublekick_${h.id}`] = false;
      return true;
    } });
    a.push({ id: 'knife_throw', label: 'Trick: Knife Throw', group: 'attack', desc: `Throw a blade at +${T}, ignoring the light weapon −1.`, run: async () => {
      const f = await pickFoe(g, 'Throw at…');
      if (!f) return false;
      spend();
      await attackFoe(g, h, f, { weapon: mainHand(h), ranged: true, thrown: 'knife', extraMods: [{ label: 'Knife Throw', value: T }], label: 'Knife Throw' });
      return true;
    } });
    if (c.turn === 1 && !c.foesFirstSurprise && melee && !g.isSpent(h, 'combat', 'vault'))
      a.push({ id: 'vault', label: 'Trick: Vaulting Strike', group: 'attack', desc: `+${L} to this attack. On a 1: −2 Defense this foe turn and you must be attacked.`, run: async () => {
        const f = await pickFoe(g, 'Vault onto…');
        if (!f) return false;
        spend();
        g.spend(h, 'combat', 'vault');
        const res = await attackFoe(g, h, f, { weapon: mainHand(h), ranged: false, extraMods: [{ label: 'Vaulting Strike', value: L }], label: 'Vaulting Strike' });
        if (res.roll.natural === 1) c.flags[`vault_fail_${h.id}`] = c.turn;
        return true;
      } });
    a.push({ id: 'shift', label: 'Trick: Shift Position', group: 'ability', desc: 'Swap places in the Marching Order with an ally.', run: async () => {
      const t = await g.pickHero('Swap with…', g.party().filter((x) => x !== h), undefined, true);
      if (!t || !g.s.dungeon) return false;
      spend();
      const mo = g.s.dungeon.marchingOrder;
      const i = mo.indexOf(h.id), j = mo.indexOf(t.id);
      [mo[i], mo[j]] = [mo[j], mo[i]];
      g.log('info', `${h.name} flips past ${t.name}.`);
      return false; // free-ish: does not consume the action in our implementation? Book: it's a trick (1 turn). Keep as action.
    } });
  }
  // Illusionist distracting lights & knife
  if (h.classId === 'illusionist') {
    if (!c.flags[`lights_failed_${h.id}`])
      a.push({ id: 'lights', label: 'Distracting Lights', group: 'magic', icon: 'icons/magic', desc: `Spellcasting vs L: reduce the foe's L by ${T} (all Minor Foes in the group). No slot used.`, run: async () => {
        const f = await pickFoe(g, 'Distract which foe?', (f) => !isUnliving(f));
        if (!f) return false;
        const { spellRoll } = await import('./spelleffects');
        const rr = await spellRoll(g, h, 'illusionary_fog', L, foeLevel(g, f), ' (Distracting Lights)');
        if (rr.ok) f.levelMods.push({ label: 'Distract', value: -T }), g.log('good', `${f.name} is dazzled (−${T} L).`);
        else c.flags[`lights_failed_${h.id}`] = true;
        return true;
      } });
    const slots = h.spells.filter((s) => !s.used);
    if (slots.length)
      a.push({ id: 'ill_knife', label: 'Illusionary Knife Throw', group: 'attack', desc: `Spend a slot: attack at +${T}+${L}; may be Subdual.`, run: async () => {
        const f = await pickFoe(g, 'Throw the phantom knife at…');
        if (!f) return false;
        const pick = await g.choose('Spend which prepared spell?', slots.map((s, i) => ({ value: i, label: s.id.replace(/_/g, ' ') })));
        slots[pick].used = true;
        await attackFoe(g, h, f, { weapon: undefined, ranged: true, magical: true, extraMods: [{ label: 'Illusionary Knife', value: T + L + 2 }], label: 'Illusionary Knife' });
        return true;
      } });
  }
  // Mushroom monk spores
  if (h.classId === 'mushroom_monk' && (r.spores ?? 0) > 0 && !c.flags.spores)
    a.push({ id: 'spores', label: `Spray Spores (${r.spores})`, group: 'ability', desc: 'All living Minor Foes (not fungi) get −1 L.', run: async () => {
      r.spores--;
      c.flags.spores = true;
      for (const f of liveFoes(g)) if (isMinor(f) && !isUnliving(f) && !hasTag(f, 'fungus')) f.levelMods.push({ label: 'Spores', value: -1 });
      g.log('good', 'A choking spore cloud engulfs the foes!');
      return true;
    } });
  // Paladin Divine Smite (expert skill; available only if learned)
  if (h.secrets.includes('divine_smite') && !g.isSpent(h, 'adventure', 'divine_smite') && melee)
    a.push({ id: 'smite', label: 'Divine Smite', group: 'attack', run: async () => {
      const f = await pickFoe(g, 'Smite…');
      if (!f) return false;
      g.spend(h, 'adventure', 'divine_smite');
      await attackFoe(g, h, f, { weapon: mainHand(h), ranged: false, smite: true, noExplode: true, magical: true });
      return true;
    } });
  // Kukla green ring: revive a dead kukla
  const deadKukla = g.partyAll().find((x) => x.classId === 'kukla' && x.status === 'dead' && x.inventory.some((i) => i.base === 'green_ring'));
  if (deadKukla && ['wizard'].includes(h.classId))
    a.push({ id: 'green_ring', label: `Pour the green ring into ${deadKukla.name}`, group: 'item', run: async () => {
      deadKukla.inventory = deadKukla.inventory.filter((i) => i.base !== 'green_ring');
      c.flags.kuklaRevive = `${deadKukla.id}:${c.turn + g.roll('d6')}`;
      g.log('good', `The reviving fluid seeps into ${deadKukla.name}…`);
      return true;
    } });
  // Gnome gadgets
  if (h.classId === 'gnome' && (r.gadget ?? 0) > 0) a.push(...gadgetActions(g, h));
  a.push(...traitActions(g, h));
  // Companion attacks are handled by allies; nothing here.
  void offHand;
  void isAlive;
  void addCondition;
  void groupStealth;
  void applyMinorKills;
  void applyMajorDamage;
  void fspecial;
  void isMajor;
  return a;
}

async function prayerBeads(g: Game, h: Hero, prayer: 'healing' | 'blessing') {
  const beads = h.inventory.find((i) => i.base === 'prayer_beads' && (i.charges ?? 0) > 0);
  let spent = true;
  if (beads && (await g.yesNo('Use a prayer bead?', '4–6: the Prayer is not spent. The bead is destroyed either way.'))) {
    beads.charges!--;
    const r = await g.tableRoll('Prayer bead', 'd6', { context: '4–6: prayer kept' });
    if (r >= 4) spent = false;
  }
  if (spent) h.resources[prayer]--;
}

async function clericHeal(g: Game, h: Hero): Promise<boolean> {
  const hurt = g.party().filter((x) => x.life < maxLife(x) && x.classId !== 'kukla');
  // Bulwark: heal last unless at 1 Life
  const bulwarkOk = (x: Hero) => x.classId !== 'bulwark' || x.life <= 1 || hurt.every((y) => y === x || y.classId === 'bulwark');
  const t = await g.pickHero('Heal whom?', hurt.filter(bulwarkOk), undefined, true);
  if (!t) return false;
  await prayerBeads(g, h, 'healing');
  const sym = h.inventory.some((i) => i.base === 'holy_symbol_healing') ? 2 : 0;
  const roll = await g.tableRoll('Healing prayer', 'd6', { mods: [{ label: 'Level', value: h.level }, ...(sym ? [{ label: 'Holy symbol', value: 2 }] : [])] });
  g.heal(t, roll, 'Healing prayer');
  t.conditions = t.conditions.filter((k) => !['paralyzed_arm', 'paralyzed_leg', 'cordyceps'].includes(k.id));
  return true;
}

function gadgetActions(g: Game, h: Hero): Action[] {
  const c = cs(g);
  const r = h.resources;
  const L = h.level;
  const a: Action[] = [];
  const g1 = r.gadget >= 1;
  if (g1 && !c.flags.oneShotBroken)
    a.push({ id: 'gadget_shot', label: `Gadget: One-shot weapon (${r.gadget})`, group: 'attack', icon: 'items/gadget', desc: `Ranged attack at +${L}. Disabled until repaired.`, run: async () => {
      const f = await pickFoe(g, 'Fire the contraption at…');
      if (!f) return false;
      r.gadget--;
      await attackFoe(g, h, f, { weapon: undefined, ranged: true, extraMods: [{ label: 'Unarmed offset', value: 2 }, { label: 'One-shot gadget', value: L }], label: 'Clockwork shot' });
      c.flags.oneShotBroken = true;
      return true;
    } });
  if (r.gadget >= 2)
    a.push({ id: 'grenade', label: 'Gadget: Grenade', group: 'attack', icon: 'items/grenade', desc: c.turn === 1 && !c.foesFirstSurprise ? 'Thrown before melee: no friendly fire.' : 'In melee it hits the party too!', run: async () => {
      const max = Math.min(r.gadget, 5);
      const pts = await g.choose('Spend how many gadget points?', Array.from({ length: max - 1 }, (_, i) => ({ value: i + 2, label: `${i + 2} points → ${Math.min(4, i + 1)} damage` })));
      const f = await pickFoe(g, 'Throw at…');
      if (!f) return false;
      r.gadget -= pts;
      const dmg = Math.min(4, pts - 1);
      if (isMinor(f)) await applyMinorKills(g, h, f, dmg, { magical: true });
      else await applyMajorDamage(g, h, f, dmg, {});
      if (!(c.turn === 1 && !c.foesFirstSurprise)) for (const x of g.party()) await g.damage(x, Math.min(dmg, g.d6()), 'grenade blast');
      return true;
    } });
  if (g1)
    a.push({ id: 'smoke', label: 'Gadget: Smokescreen', group: 'ability', icon: 'items/smokebomb', desc: 'The whole party flees without being attacked.', disabled: liveFoes(g).some((f) => hasTag(f, 'fire')) ? 'Fire creatures dispel smoke' : false, run: async () => {
      r.gadget--;
      c.flags.smokeFlee = true;
      g.log('good', 'Smoke billows from the bomb!');
      return true;
    } });
  if (g1 && !h.conditions.some((k) => k.id === 'gadget_weapon'))
    a.push({ id: 'gadget_weapon', label: 'Gadget: Enhanced weapon', group: 'ability', desc: `+${L} to all melee attacks this encounter.`, run: async () => {
      r.gadget--;
      addCondition(h, { id: 'gadget_weapon', label: 'Gadget weapon', until: 'combat' });
      g.log('good', `${h.name}'s weapon sprouts spinning blades!`);
      return false;
    } });
  if (g1 && h.inventory.find((i) => i.uid === h.equip.armor)?.base === 'clockwork_armor' && !h.conditions.some((k) => k.id === 'clockwork_active'))
    a.push({ id: 'clockwork', label: 'Gadget: Activate clockwork armor', group: 'ability', desc: 'Armor becomes +3 Defense this encounter.', run: async () => {
      r.gadget--;
      addCondition(h, { id: 'clockwork_active', label: 'Clockwork armor active', until: 'combat' });
      return false;
    } });
  const captives = g.party().filter((x) => hc(g, x).engulfed || hc(g, x).webbed || hc(g, x).bound);
  if (g1 && captives.length)
    a.push({ id: 'free', label: 'Gadget: Free an ally', group: 'ability', run: async () => {
      const t = await g.pickHero('Free whom?', captives.filter((x) => x !== h));
      if (!t) return false;
      r.gadget--;
      const res = await g.heroRoll({ hero: h, kind: 'save', label: 'Free from restraints', mods: [{ label: 'Gnome', value: L }], target: 6 });
      if (res.success) Object.assign(hc(g, t), { engulfed: false, webbed: false, bound: false }), g.log('good', `${t.name} is freed!`);
      return true;
    } });
  return a;
}
