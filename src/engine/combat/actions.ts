import type { Game } from '../game';
import type { Foe, Hero, Item } from '../types';
import type { ChoiceOption } from '../io';
import { foeAlive, isMinor, foeLabel, fspecial, isMajor } from '../foe';
import { base, mainHand, offHand, weaponInfo, freeHand, inventoryCount, tierOf, isWeapon, canUseItem } from '../hero';
import { attackFoe } from './resolve';
import { cs, hc, liveFoes, meleeEligible } from './util';
import { spellActions } from './spells';
import { abilityActions } from './abilities';

export interface Action {
  id: string;
  label: string;
  desc?: string;
  group: 'attack' | 'magic' | 'ability' | 'item' | 'other';
  disabled?: string | false;
  icon?: string;
  run: () => Promise<boolean | void>; // false = cancelled, no turn used
}

export async function pickFoe(g: Game, title: string, filter: (f: Foe) => boolean = () => true): Promise<Foe | undefined> {
  const foes = liveFoes(g).filter(filter);
  if (!foes.length) return;
  if (foes.length === 1) return foes[0];
  const opts: ChoiceOption<string>[] = foes.map((f) => ({ value: f.uid, label: foeLabel(f), desc: isMinor(f) ? `L${f.level} · ${f.count} left` : `L${f.level} · ${f.life}/${f.maxLife} Life`, icon: `monsters/${f.defId}` }));
  opts.push({ value: '', label: 'Back', tone: 'quiet' });
  const id = await g.choose(title, opts, { layout: 'list' });
  return foes.find((f) => f.uid === id);
}

function rangedReady(g: Game, h: Hero): Item | undefined {
  const c = cs(g);
  for (const it of [mainHand(h), offHand(h)]) {
    const w = weaponInfo(it);
    if (!w?.ranged || it!.broken) continue;
    if (hc(g, h).reload > 0) return;
    // In rooms, ranged weapons are usable only before melee (turn 1) unless in the corridor rear
    if (!c.corridor && c.turn > 1 && !c.flags[`ranged_ok_${h.id}`]) return;
    if (c.corridor && meleeEligible(g, h) && c.turn > 1) return;
    if (c.flags.illusionary_fog) return;
    return it;
  }
}

function meleeWeapon(h: Hero): Item | undefined {
  for (const it of [mainHand(h), offHand(h)]) {
    const w = weaponInfo(it);
    if (w && !w.ranged && !it!.broken) return it;
  }
}

export function heroActions(g: Game, h: Hero): Action[] {
  const c = cs(g);
  const x = hc(g, h);
  const acts: Action[] = [];
  const canMelee = meleeEligible(g, h);
  const mw = meleeWeapon(h);
  const rw = rangedReady(g, h);

  if (x.confused) {
    acts.push({ id: 'confused', label: 'Shake off confusion', group: 'other', desc: 'Confused — cannot attack this turn.', run: async () => true });
    return acts;
  }
  if (x.knockedDown) {
    acts.push({ id: 'stand', label: 'Stand up', group: 'other', run: async () => ((x.knockedDown = false), g.log('info', `${h.name} gets back up.`), true) });
    return acts;
  }
  // Melee
  if (c.trial && c.trial.heroId !== h.id) return [{ id: 'watch', label: 'Watch the duel', group: 'other', run: async () => true }];
  const mwLabel = mw ? mw.name : 'Unarmed';
  acts.push({
    id: 'melee', label: `Attack (${mwLabel})`, group: 'attack', icon: 'icons/attack',
    disabled: !canMelee ? 'Not in the front rank' : liveFoes(g).every((f) => f.state.onCeiling) ? 'Out of reach' : false,
    desc: meleeDesc(h, mw),
    run: async () => meleeAction(g, h, mw, false),
  });
  if (canMelee && liveFoes(g).some((f) => !f.tags.includes('undead') && !f.tags.includes('artificial')))
    acts.push({ id: 'subdue', label: 'Subdue (−1)', group: 'attack', desc: 'Strike to knock out instead of kill.', run: async () => meleeAction(g, h, mw, true) });
  if (rw) acts.push({ id: 'ranged', label: `Shoot (${rw.name})`, group: 'attack', icon: 'items/bow', run: async () => rangedAction(g, h, rw) });
  // Spells / prayers / abilities
  acts.push(...spellActions(g, h));
  acts.push(...abilityActions(g, h));
  // Items
  acts.push(...itemActions(g, h));
  // Swap weapons
  acts.push({ id: 'swap', label: 'Change weapon', group: 'other', desc: h.traits.includes('quick_draw') ? 'Quick Draw: free, then act.' : 'Takes the turn.', run: async () => swapWeapon(g, h) });
  if (!g.s.dungeon?.lanternBearer && g.s.dungeon && !h.classId.includes('illusionist'))
    acts.push({ id: 'lantern', label: 'Pick up the lantern', group: 'other', run: async () => ((g.s.dungeon!.lanternBearer = h.id), g.log('info', `${h.name} picks up the lantern.`), true) });
  if (h.classId === 'light_gladiator' && canMelee) acts.push({ id: 'parry', label: 'Attack once + Parry', group: 'attack', desc: 'Forgo one attack: +1 Defense vs melee this turn.', run: async () => ((x.parry = true), meleeAction(g, h, mw, false, 1)) });
  acts.push({ id: 'wait', label: 'Hold / do nothing', group: 'other', run: async () => true });
  return acts;
}

function meleeDesc(h: Hero, mw?: Item) {
  const w = weaponInfo(mw);
  const parts: string[] = [];
  if (!mw) parts.push('−2 unarmed');
  else if (w?.mod) parts.push(`${w.mod > 0 ? '+' : ''}${w.mod} weapon`);
  return parts.join(', ');
}

/** Number of melee attacks this hero makes this turn. */
function meleeAttacks(g: Game, h: Hero, mw?: Item): { n: number; explode: boolean; dual?: boolean } {
  const off = offHand(h);
  const ow = weaponInfo(off);
  const mwI = weaponInfo(mw);
  if (h.classId === 'light_gladiator' && mwI?.cls === 'light' && ow?.cls === 'light' && !ow.ranged) return { n: 2, explode: true };
  if (h.classId === 'swashbuckler' && mwI && ow && !ow.ranged && (mwI.cls === 'hand' || mwI.cls === 'light') && ow.cls === 'light') return { n: 2, explode: true };
  if (h.classId === 'ranger' && mwI && ow && !ow.ranged && !mwI.ranged && mwI.damage === ow.damage && ['hand', 'light'].includes(ow.cls)) return { n: 2, explode: false, dual: true };
  if (h.classId === 'mushroom_monk' && (!mw || ['nunchaku'].includes(mw.base))) return { n: tierOf(h.level), explode: true };
  return { n: 1, explode: true };
}

async function meleeAction(g: Game, h: Hero, mw: Item | undefined, subdual: boolean, forceN?: number): Promise<boolean> {
  const c = cs(g);
  const x = hc(g, h);
  // Drawing after ranged in a room
  const main = mainHand(h);
  if (weaponInfo(main)?.ranged && !mw) {
    const melee = h.inventory.find((i) => isWeapon(i) && !weaponInfo(i)?.ranged && !canUseItem(h, i));
    if (melee && !h.traits.includes('quick_draw')) {
      const draw = await g.choose(`${h.name} holds a ranged weapon`, [
        { value: 'draw', label: `Draw ${melee.name} (uses the turn)` },
        { value: 'fist', label: 'Fight unarmed (−2)' },
        { value: '', label: 'Back', tone: 'quiet' },
      ]);
      if (!draw) return false;
      if (draw === 'draw') {
        h.equip.main = melee.uid;
        if (weaponInfo(melee)?.hands === 2) h.equip.off = undefined;
        g.log('info', `${h.name} draws ${melee.name}.`);
        return true;
      }
    } else if (melee) {
      h.equip.main = melee.uid;
      mw = melee;
    }
  }
  const f = await pickFoe(g, `${h.name} attacks…`, (f) => !f.state.onCeiling || x.webbed === true);
  if (!f) return false;
  const { n, explode, dual } = meleeAttacks(g, h, mw);
  const count = forceN ?? n;
  if (dual) c.flags[`dual_${h.id}`] = true;
  let target: Foe | undefined = f;
  let hitsOnFirst = 0;
  for (let i = 0; i < count; i++) {
    if (!target || !foeAlive(target)) target = await pickFoe(g, `${h.name}: next attack…`);
    if (!target) break;
    const weapon = i === 1 && (h.classId === 'swashbuckler' || h.classId === 'light_gladiator' || dual) ? offHand(h) : mw;
    const r = await attackFoe(g, h, target, { weapon, ranged: false, subdual, noExplode: !explode, extraDamage: 0 });
    if (r.hit && target === f) hitsOnFirst++;
    if (r.hit && i === 0 && h.traits.includes('flourishing_strike') && !g.isSpent(h, 'combat', 'flourishing_strike') && liveFoes(g).length) {
      if (await g.yesNo('Flourishing Strike?', 'Make another off-hand attack right now.', 'Strike!', 'No')) {
        g.spend(h, 'combat', 'flourishing_strike');
        const t2 = foeAlive(target) ? target : await pickFoe(g, 'Flourishing Strike target');
        if (t2) await attackFoe(g, h, t2, { weapon: offHand(h) ?? mw, ranged: false, label: 'Flourishing Strike' });
      }
    }
  }
  if (h.traits.includes('twin_strike_precision') && hitsOnFirst >= 2 && foeAlive(f) && isMajor(f)) {
    const { applyMajorDamage } = await import('./resolve');
    await applyMajorDamage(g, h, f, 1, {});
  }
  c.flags[`dual_${h.id}`] = false;
  if (x.counterBonus && x.counterBonus.foe === f.uid) x.counterBonus = undefined;
  // Remove one-shot attack mods
  x.attackMods = x.attackMods.filter((m) => m.until === 'combat');
  return true;
}

async function rangedAction(g: Game, h: Hero, rw: Item): Promise<boolean> {
  const c = cs(g);
  const w = weaponInfo(rw)!;
  const f = await pickFoe(g, `${h.name} shoots at…`);
  if (!f) return false;
  // Ammo tracking
  if (g.s.settings.arrowTracking && (w.cls === 'bow' || w.cls === 'crossbow')) {
    const left = (h.resources.arrows ?? 12);
    if (left <= 0) {
      g.log('bad', `${h.name} is out of arrows!`);
      return false;
    }
    h.resources.arrows = left - 1;
  }
  let shots = 1;
  if (w.cls === 'stars') shots = 2;
  for (let i = 0; i < shots; i++) {
    const t = i === 0 ? f : foeAlive(f) ? f : await pickFoe(g, 'Second star…');
    if (!t) break;
    const r = await attackFoe(g, h, t, { weapon: rw, ranged: true });
    if (g.s.settings.arrowTracking && r.kills > 1) h.resources.arrows = Math.max(0, (h.resources.arrows ?? 0) - (r.kills - 1));
  }
  if (w.cls === 'crossbow') hc(g, h).reload = 1;
  if (w.cls === 'handgun' || w.cls === 'rifle') {
    hc(g, h).reload = 2;
    c.wanderingBonus = 1;
  }
  if (w.cls === 'stars') {
    const st = h.inventory.find((i) => i.base === 'throwing_stars');
    if (st) st.qty = Math.max(0, (st.qty ?? 1) - shots);
  }
  return true;
}

async function swapWeapon(g: Game, h: Hero): Promise<boolean> {
  const opts = h.inventory.filter((i) => (isWeapon(i) || base(i)?.kind === 'shield' || i.base === 'lantern') && !canUseItem(h, i));
  const pick = await g.choose<string>(`${h.name}: ready which item?`, [
    ...opts.map((i) => ({ value: i.uid, label: i.name, desc: base(i)?.kind === 'shield' ? 'Off hand' : weaponInfo(i)?.hands === 2 ? 'Both hands' : 'Main hand' })),
    { value: '', label: 'Back', tone: 'quiet' as const },
  ]);
  if (!pick) return false;
  const it = h.inventory.find((i) => i.uid === pick)!;
  const { equipItem } = await import('../inventory');
  equipItem(g, h, it);
  g.log('info', `${h.name} readies ${it.name}.`);
  return !h.traits.includes('quick_draw');
}

function itemActions(g: Game, h: Hero): Action[] {
  const acts: Action[] = [];
  const c = cs(g);
  const undeadOrDemon = liveFoes(g).some((f) => f.tags.includes('undead') || f.tags.includes('demon'));
  if (inventoryCount(h, 'holy_water') > 0)
    acts.push({ id: 'holy_water', label: 'Throw Holy Water', group: 'item', icon: 'items/holy_water', disabled: undeadOrDemon ? false : 'No undead or demons', run: async () => holyWater(g, h) });
  if (inventoryCount(h, 'oil_flask') > 0)
    acts.push({ id: 'oil', label: 'Throw Flask of Oil', group: 'item', icon: 'items/oil_flask', run: async () => {
      const f = await pickFoe(g, 'Douse which foe in oil?');
      if (!f) return false;
      consume(h, 'oil_flask');
      f.state.flammable = true;
      g.log('combat', `${f.name} is soaked in oil — fire and torches now hit at +2!`);
      return true;
    } });
  if (inventoryCount(h, 'acid_vial') > 0)
    acts.push({ id: 'acid', label: 'Throw Acid', group: 'item', icon: 'items/acid_vial', run: async () => {
      const f = await pickFoe(g, 'Throw acid at…');
      if (!f) return false;
      consume(h, 'acid_vial');
      const r = g.d6();
      if (r === 1) await g.damage(h, 1, 'acid splash');
      else if (f.tags.includes('undead') || f.tags.includes('artificial')) g.log('combat', 'The acid has no effect.');
      else {
        const { applyMinorKills, applyMajorDamage } = await import('./resolve');
        if (isMinor(f)) await applyMinorKills(g, h, f, 1, { magical: true });
        else await applyMajorDamage(g, h, f, 1, { acid: true });
      }
      return true;
    } });
  if (inventoryCount(h, 'wolfsbane') > 0 && liveFoes(g).some((f) => f.tags.includes('were')))
    acts.push({ id: 'wolfsbane', label: 'Throw Wolfsbane', group: 'item', run: async () => {
      const f = liveFoes(g).find((x) => x.tags.includes('were'))!;
      consume(h, 'wolfsbane');
      const { checkMorale } = await import('./morale');
      await checkMorale(g, f, { forced: true, reason: 'wolfsbane' });
      return true;
    } });
  if (inventoryCount(h, 'salt') > 0 && liveFoes(g).some((f) => f.defId === 'fungus_leeches'))
    acts.push({ id: 'salt', label: 'Throw Salt', group: 'item', run: async () => {
      const f = liveFoes(g).find((x) => x.defId === 'fungus_leeches')!;
      consume(h, 'salt');
      const { applyMinorKills } = await import('./resolve');
      await applyMinorKills(g, h, f, 2, {});
      return true;
    } });
  const arrow = h.inventory.find((i) => i.base === 'arrow_slaying');
  if (arrow && weaponInfo(mainHand(h))?.cls === 'bow') {
    const tgt = liveFoes(g).find((f) => f.defId === arrow.data?.target);
    if (tgt) acts.push({ id: 'slaying', label: 'Arrow of Slaying', group: 'item', run: async () => {
      h.inventory = h.inventory.filter((i) => i !== arrow);
      const { applyMajorDamage } = await import('./resolve');
      await applyMajorDamage(g, h, tgt, 3, { magical: true });
      return true;
    } });
  }
  for (const id of ['xichtul_cap', 'red_death']) {
    const m = h.inventory.find((i) => i.base === 'mushroom' && i.data?.kind === id);
    if (m) acts.push({ id, label: `Throw ${m.name}`, group: 'item', run: async () => {
      const f = await pickFoe(g, `Throw ${m.name} at…`);
      if (!f) return false;
      h.inventory = h.inventory.filter((i) => i !== m);
      const { applyMinorKills, applyMajorDamage } = await import('./resolve');
      if (id === 'xichtul_cap') {
        const dmg = g.roll('d3');
        if (isMinor(f)) await applyMinorKills(g, h, f, dmg, { magical: true });
        else await applyMajorDamage(g, h, f, dmg, { magical: true });
        await g.damage(h, 1, "Xichtul's Cap");
      } else if (m.data?.effect === 'level') f.levelMods.push({ label: 'Red Death', value: -1 });
      else if (isMinor(f)) await applyMinorKills(g, h, f, 1, {});
      else await applyMajorDamage(g, h, f, 1, {});
      return true;
    } });
  }
  const morel = h.inventory.find((i) => i.base === 'mushroom' && i.data?.kind === 'morel_crusher');
  if (morel) acts.push({ id: 'morel', label: 'Break Morel Crusher', group: 'item', run: async () => {
    const f = await pickFoe(g, 'Frighten which foe?');
    if (!f) return false;
    h.inventory = h.inventory.filter((i) => i !== morel);
    const { checkMorale } = await import('./morale');
    await checkMorale(g, f, { forced: true, mod: -1, reason: 'hallucinations' });
    return true;
  } });
  const herbal = h.inventory.find((i) => i.base === 'herbal_tonic');
  const paralyzed = g.party().filter((p) => p.conditions.some((k) => k.id === 'paralyzed') || hc(g, p).skipTurns > 0);
  if (herbal && paralyzed.length) acts.push({ id: 'tonic', label: 'Give Herbal Tonic', group: 'item', run: async () => {
    const t = await g.pickHero('Cure paralysis on…', paralyzed);
    if (!t) return false;
    h.inventory = h.inventory.filter((i) => i !== herbal);
    t.conditions = t.conditions.filter((k) => k.id !== 'paralyzed');
    hc(g, t).skipTurns = 0;
    g.log('good', `${t.name} can move again.`);
    return true;
  } });
  // Wake sleeping ally (siren)
  const sleepers = g.party().filter((p) => hc(g, p).asleep && p !== h);
  if (sleepers.length) acts.push({ id: 'wake', label: 'Wake a sleeping ally', group: 'other', run: async () => {
    const t = await g.pickHero('Wake whom?', sleepers);
    if (!t) return false;
    hc(g, t).asleep = false;
    hc(g, t).attackMods.push({ label: 'Groggy', value: -1, until: 'combat' });
    const siren = liveFoes(g).find((f) => f.defId === 'land_siren');
    if (siren) siren.state.sleepers = Math.max(0, ((siren.state.sleepers as number) ?? 1) - 1);
    return true;
  } });
  // Cut free / hack trolls
  const pending = liveFoes(g).concat(c.foes).find((f) => f.state.pendingRegen);
  if (pending && weaponInfo(mainHand(h))?.damage === 'slashing') acts.push({ id: 'hack', label: 'Hack the fallen trolls', group: 'other', desc: 'Prevents them regenerating.', run: async () => ((pending.state.pendingRegen = 0), g.log('good', `${h.name} hacks the trolls to pieces.`), true) });
  void freeHand;
  void fspecial;
  return acts;
}

export function consume(h: Hero, baseId: string) {
  const it = h.inventory.find((i) => i.base === baseId && !i.used);
  if (!it) return;
  if ((it.qty ?? 1) > 1) it.qty!--;
  else h.inventory = h.inventory.filter((i) => i !== it);
}

async function holyWater(g: Game, h: Hero): Promise<boolean> {
  const f = await pickFoe(g, 'Throw holy water at…', (f) => f.tags.includes('undead') || f.tags.includes('demon') || !!fspecial(f, 'holy_morale'));
  if (!f) return false;
  consume(h, 'holy_water');
  const { applyMinorKills, applyMajorDamage } = await import('./resolve');
  if (fspecial(f, 'holy_morale')) {
    const { checkMorale } = await import('./morale');
    await checkMorale(g, f, { forced: true, reason: 'holy water' });
    return true;
  }
  const kills = fspecial(f, 'holy_water_kills')?.n ?? 1;
  const dmg = fspecial(f, 'holy_water_damage')?.n ?? 1;
  if (isMinor(f)) await applyMinorKills(g, h, f, kills, { magical: true });
  else await applyMajorDamage(g, h, f, dmg, { holy: true, magical: true });
  return true;
}
