import type { Game } from '../game';
import type { Foe, Item } from '../types';
import type { Reaction } from '../../data/foes';
import { fdef, isMinor, foeLevel, foeLabel } from '../foe';
import { base, inventoryCount, weaponInfo, isAlive } from '../hero';
import { maxExpr } from '../dice';

export type ReactionOutcome = 'fight' | 'fight_first' | 'pass' | 'fled' | 'won' | 'quest' | 'trial' | 'puzzle_fail' | 'magic_lost' | 'capture' | 'sleeping';

/** Roll the foe's Reaction table (with Beast Friend / Creepy Charm / Elidra rerolls). */
export async function rollReaction(g: Game, f: Foe): Promise<Reaction> {
  const def = fdef(f);
  const table = def.reactions;
  if (table.length === 1 && table[0].from === 1 && table[0].to === 6) {
    g.log('combat', `${foeLabel(f)}: ${reactionName(table[0])}.`);
    return table[0];
  }
  const ctx = table.map((r) => `${r.from}${r.to !== r.from ? '–' + r.to : ''} ${reactionName(r)}`).join(' · ');
  let roll = await g.tableRoll(`Reaction: ${f.name}`, 'd6', { context: ctx });
  // Alter rolls for animals
  const animal = f.tags.includes('animal');
  const shifters = g.party().filter((h) => animal && (h.traits.includes('beast_friend') || h.traits.includes('beast_whisperer')));
  if (shifters.length) {
    const amt = shifters.some((h) => h.traits.includes('beast_whisperer')) ? 2 : 1;
    const opts = [];
    for (let d = -amt; d <= amt; d++) {
      const v = Math.min(6, Math.max(1, roll + d));
      opts.push({ value: v, label: `${d >= 0 ? '+' : ''}${d} → ${v}: ${reactionName(find(table, v))}` });
    }
    roll = await g.choose('Calm the animal?', opts, { text: 'Your way with beasts lets you adjust the Reaction roll.' });
  }
  let r = find(table, roll);
  const rerollers = g.party().filter((h) => (h.traits.includes('creepy_charm') && !f.tags.some((t) => ['undead', 'artificial', 'elemental'].includes(t))) || (h.traits.includes('elidras_melody') && !g.isSpent(h, 'adventure', 'elidras_melody')));
  const glamour = g.party().find((h) => h.spells.some((s) => s.id === 'glamour_mask' && !s.used));
  if ((rerollers.length || glamour) && ['fight', 'fight_death', 'capture'].includes(r.type) && table.some((x) => !['fight', 'fight_death'].includes(x.type))) {
    const who = rerollers[0] ?? glamour!;
    const how = rerollers[0] ? (who.traits.includes('creepy_charm') ? 'Creepy Charm' : "Elidra's Melody") : 'Glamour Mask';
    if (await g.yesNo(`${f.name} look hostile`, `${who.name} can reroll the Reaction with ${how}.`, 'Reroll', 'Keep')) {
      if (how === "Elidra's Melody") g.spend(who, 'adventure', 'elidras_melody');
      if (how === 'Glamour Mask') who.spells.find((s) => s.id === 'glamour_mask' && !s.used)!.used = true;
      roll = await g.tableRoll(`Reaction reroll: ${f.name}`, 'd6', { context: ctx });
      r = find(table, roll);
    }
  }
  g.log('combat', `${foeLabel(f)}: ${reactionName(r)}.`);
  return r;
}

function find(table: Reaction[], roll: number): Reaction {
  return table.find((r) => roll >= r.from && roll <= r.to) ?? table[table.length - 1];
}

export function reactionName(r: Reaction): string {
  const names: Record<string, string> = {
    flee: 'Flee', flee_outnumbered: 'Flee if outnumbered', bribe: 'Bribe', fight: 'Fight', fight_death: 'Fight to the death', peaceful: 'Peaceful', ignore: 'Ignore',
    puzzle: 'Puzzle', quest: 'Quest', magic_challenge: 'Magic Challenge', trade_info: 'Trade information', capture: 'Capture', blood_offering: 'Blood offering',
    trial: 'Trial of Champions', offer_food: 'Offer food and rest', sleeping: 'Asleep!', trade: 'Trade', buy_weapons: 'Buy weapons', info: 'Offer information', ignore_or_fight: 'Ignore',
  };
  return names[r.type] + (r.bribe ? ` (${bribeText(r.bribe)})` : '');
}

export function bribeText(spec: string): string {
  return spec.split('|').map((s) => {
    if (s.endsWith('ea')) return s.startsWith('food') ? `${s.replace('food', '').replace('ea', '')} Food each` : `${s.replace('ea', '')}gp each`;
    if (s === 'all') return 'all your gold';
    if (s === 'all100') return 'all gold (min 100) or a magic item';
    if (s.startsWith('food')) return `${s.slice(4)} Food`;
    if (s === 'magic') return 'a magic item';
    if (s === 'scrolls2') return '2 scrolls or potions';
    if (s.startsWith('gem')) return s === 'gem' ? 'a gem' : `a ${s.slice(3)}gp gem`;
    if (s === 'weapon2h') return 'a two-handed weapon';
    if (s === 'weapon1ea') return '1 weapon each';
    if (/d/.test(s)) return `${s}gp`;
    return `${s}gp`;
  }).join(' or ');
}

/** Offer to pay a bribe. Returns true if paid. */
export async function payBribe(g: Game, f: Foe, spec: string): Promise<boolean> {
  const dwarves = g.party().filter((h) => h.classId === 'dwarf').length;
  if (dwarves >= 2) {
    g.log('bad', 'The dwarves refuse to part with any gold! (2+ dwarves cannot Bribe.)');
    return false;
  }
  const n = isMinor(f) ? f.count : 1;
  const opts: { value: string; label: string; disabled?: string | false; desc?: string }[] = [];
  const fools = g.party().flatMap((h) => h.inventory.filter((i) => i.base === 'fools_gold').map((i) => ({ h, i })))[0];
  for (const s of spec.split('|')) {
    if (/^\d+ea$/.test(s)) {
      const amt = Number(s.replace('ea', '')) * n;
      opts.push({ value: `gp:${amt}`, label: `Pay ${amt} gp`, disabled: g.s.partyGold >= amt ? false : `You have ${g.s.partyGold} gp` });
    } else if (/^\d+$/.test(s)) {
      const amt = Number(s);
      opts.push({ value: `gp:${amt}`, label: `Pay ${amt} gp`, disabled: g.s.partyGold >= amt ? false : `You have ${g.s.partyGold} gp` });
    } else if (/d/.test(s) && !s.startsWith('food')) {
      const amt = g.roll(s);
      opts.push({ value: `gp:${amt}`, label: `Pay ${amt} gp (rolled ${s})`, disabled: g.s.partyGold >= amt ? false : `You have ${g.s.partyGold} gp` });
      void maxExpr;
    } else if (s === 'all') opts.push({ value: `gp:${g.s.partyGold}`, label: `Hand over all ${g.s.partyGold} gp` });
    else if (s === 'all100') {
      opts.push({ value: `gp:${g.s.partyGold}`, label: `All ${g.s.partyGold} gp`, disabled: g.s.partyGold >= 100 ? false : 'Needs at least 100 gp' });
      opts.push({ value: 'magic', label: 'Give a magic item', disabled: magicItems(g).length ? false : 'No magic items' });
    } else if (s.startsWith('food')) {
      const amt = s.endsWith('ea') ? n * Number(s.slice(4, -2)) : Number(s.slice(4));
      const have = g.party().reduce((a, h) => a + inventoryCount(h, 'food'), 0);
      opts.push({ value: `food:${amt}`, label: `Give ${amt} Food rations`, disabled: have >= amt ? false : `You have ${have}` });
    } else if (s === 'magic') opts.push({ value: 'magic', label: 'Give a magic item', disabled: magicItems(g).length ? false : 'No magic items' });
    else if (s === 'scrolls2') {
      const items = g.party().flatMap((h) => h.inventory.filter((i) => ['scroll', 'prism', 'bark', 'healing_potion', 'scroll_blessing'].includes(i.base)));
      opts.push({ value: 'scrolls2', label: 'Give 2 scrolls or potions', disabled: items.length >= 2 ? false : 'Not enough' });
    } else if (s.startsWith('gem')) {
      const min = Number(s.slice(3) || 0);
      const gems = g.party().flatMap((h) => h.inventory.filter((i) => (i.base === 'gem' || i.base === 'jewelry') && (i.value ?? 0) >= min));
      opts.push({ value: `gem:${min}`, label: `Give a gem${min ? ` worth ${min}+ gp` : ''}`, disabled: gems.length ? false : 'No suitable gem' });
    } else if (s === 'weapon2h') {
      const w = g.party().flatMap((h) => h.inventory.filter((i) => weaponInfo(i)?.cls === 'two'));
      opts.push({ value: 'weapon2h', label: 'Give a two-handed weapon', disabled: w.length ? false : 'None' });
    } else if (s === 'weapon1ea') {
      opts.push({ value: `weapons:${n}`, label: `Give ${n} weapons`, disabled: allWeapons(g).length >= n ? false : 'Not enough weapons' });
    }
  }
  if (fools && f.defId !== 'iron_eater') opts.unshift({ value: 'fools', label: "Use Fools' Gold", desc: 'Satisfies any bribe.' });
  if (g.party().some((h) => h.spells.some((s) => s.id === 'mirage_of_fortune' && !s.used))) opts.push({ value: 'mirage', label: 'Cast Mirage of Fortune', desc: 'Spellcasting roll vs their L.' });
  opts.push({ value: '', label: 'Refuse — fight!' });
  const pick = await g.choose(`${foeLabel(f)} demand a bribe`, opts, { art: `monsters/${fdef(f).art ?? f.defId}`, text: bribeText(spec) });
  if (!pick) return false;
  const [kind, val] = pick.split(':');
  if (kind === 'fools') {
    fools.h.inventory = fools.h.inventory.filter((i) => i !== fools.i);
  } else if (kind === 'gp') g.s.partyGold -= Number(val);
  else if (kind === 'food') {
    let need = Number(val);
    for (const h of g.party()) {
      const it = h.inventory.find((i) => i.base === 'food');
      if (!it || need <= 0) continue;
      const take = Math.min(need, it.qty ?? 1);
      it.qty = (it.qty ?? 1) - take;
      need -= take;
      if (it.qty <= 0) h.inventory = h.inventory.filter((i) => i !== it);
    }
  } else if (kind === 'magic') {
    const items = magicItems(g);
    const uid = await g.choose('Which magic item?', items.map(({ i }) => ({ value: i.uid, label: i.name })));
    removeAnywhere(g, uid);
  } else if (kind === 'scrolls2') {
    for (let k = 0; k < 2; k++) {
      const items = g.party().flatMap((h) => h.inventory.filter((i) => ['scroll', 'prism', 'bark', 'healing_potion', 'scroll_blessing'].includes(i.base)));
      const uid = await g.choose(`Give item ${k + 1}/2`, items.map((i) => ({ value: i.uid, label: i.name })));
      removeAnywhere(g, uid);
    }
  } else if (kind === 'gem') {
    const gems = g.party().flatMap((h) => h.inventory.filter((i) => (i.base === 'gem' || i.base === 'jewelry') && (i.value ?? 0) >= Number(val)));
    const uid = await g.choose('Which gem?', gems.map((i) => ({ value: i.uid, label: `${i.name} (${i.value} gp)` })));
    removeAnywhere(g, uid);
  } else if (kind === 'weapon2h' || kind === 'weapons') {
    const cnt = kind === 'weapons' ? Number(val) : 1;
    for (let k = 0; k < cnt; k++) {
      const ws = kind === 'weapons' ? allWeapons(g) : g.party().flatMap((h) => h.inventory.filter((i) => weaponInfo(i)?.cls === 'two'));
      const uid = await g.choose(`Give weapon ${k + 1}/${cnt}`, ws.map((i) => ({ value: i.uid, label: i.name })));
      removeAnywhere(g, uid);
    }
  } else if (kind === 'mirage') {
    const h = g.party().find((x) => x.spells.some((s) => s.id === 'mirage_of_fortune' && !s.used))!;
    h.spells.find((s) => s.id === 'mirage_of_fortune' && !s.used)!.used = true;
    const res = await g.heroRoll({ hero: h, kind: 'spell', label: 'Mirage of Fortune', mods: [{ label: 'Casting', value: h.level }], target: foeLevel(g, f) });
    if (!res.success) return false;
  }
  g.log('good', `The bribe is accepted.`);
  return true;
}

function magicItems(g: Game) {
  return g.party().flatMap((h) => h.inventory.filter((i) => base(i)?.magic).map((i) => ({ h, i })));
}
function allWeapons(g: Game): Item[] {
  return g.party().flatMap((h) => h.inventory.filter((i) => !!weaponInfo(i) && i.uid !== h.equip.main));
}
function removeAnywhere(g: Game, uid: string) {
  for (const h of g.party()) {
    if (h.inventory.some((i) => i.uid === uid)) {
      h.inventory = h.inventory.filter((i) => i.uid !== uid);
      for (const k of ['main', 'off', 'armor', 'neck'] as const) if (h.equip[k] === uid) h.equip[k] = undefined;
    }
  }
  void isAlive;
}
