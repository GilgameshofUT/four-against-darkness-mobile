import type { Game } from '../game';
import type { Env } from '../types';
import { save, saveAll } from '../checks';
import { gainMadness } from '../effects';
import { maxLife, isAlive, inventoryCount } from '../hero';
import { trap } from './traps';
import { rareMushroom, fungalRareItem } from './treasure';
import { MUSHROOMS } from '../../data/mushrooms';

/** Special Events table for the current environment. */
export async function specialEvent(g: Game, env: Env) {
  if (g.s.dungeon?.adventureKey === 'witch') return witchEvent(g);
  const r = await g.tableRoll(`${env === 'dungeon' ? 'Dungeon' : env === 'caverns' ? 'Caverns' : 'Fungal'} Special Event`, 'd6');
  if (env === 'dungeon') return dungeonEvent(g, r);
  if (env === 'caverns') return caveEvent(g, r);
  return fungalEvent(g, r);
}

async function dungeonEvent(g: Game, r: number) {
  const d = g.s.dungeon!;
  switch (r) {
    case 1: {
      await g.say('A ghost!', 'A pale ghost drifts through the party, chilling you to the bone.', 'monsters/ghost');
      for (const h of g.party()) {
        if (h.classId === 'paladin') continue;
        const res = await save(g, h, { type: 'fear', target: 4, label: 'Save vs L4 fear', bonuses: { cleric: 'L' } });
        if (!res.success) {
          const pick = await g.choose(`${h.name} is terrified`, [{ value: 'life', label: 'Lose 1 Life' }, { value: 'mad', label: 'Gain 1 Madness' }], { who: h.id });
          if (pick === 'life') await g.damage(h, 1, 'ghostly terror', { noReduce: true });
          else await gainMadness(g, h, 1, 'ghost');
        }
      }
      return;
    }
    case 2: {
      const { wanderingMonsters } = await import('./wandering');
      await wanderingMonsters(g, { eventTable: true });
      return;
    }
    case 3: {
      if (d.ladyInWhite) return void g.log('info', 'A faint glow in the corner fades. Nothing happens.');
      const accept = await g.yesNo('The Lady in White', 'A glowing lady in white appears and asks you to complete a Quest. Accept?', 'Accept', 'Refuse', 'monsters/lady_in_white');
      d.ladyInWhite = accept ? 'met' : 'refused';
      if (accept) {
        const { startQuest } = await import('./quest');
        await startQuest(g, d.currentTile, true);
      }
      return;
    }
    case 4:
      return trap(g, 'dungeon');
    case 5:
      if (d.uniqueEvents.includes('healer')) return dungeonEvent(g, g.d6());
      d.uniqueEvents.push('healer');
      return healer(g);
    default:
      if (d.uniqueEvents.includes('alchemist')) return trap(g, 'dungeon');
      d.uniqueEvents.push('alchemist');
      return alchemist(g);
  }
}

export async function healer(g: Game, price = 10) {
  await g.say('A wandering healer', `"I can tend your wounds — ${price} gp per Life."`, 'monsters/wandering_healer');
  for (;;) {
    const hurt = g.party().filter((h) => h.life < maxLife(h) && h.classId !== 'kukla');
    if (!hurt.length || g.s.partyGold < price) break;
    const id = await g.choose(`Heal whom? (${g.s.partyGold} gp)`, [...hurt.map((h) => ({ value: h.id, label: `${h.name} (${h.life}/${maxLife(h)})`, icon: `portraits/${h.portrait}` })), { value: '', label: 'Done' }], { layout: 'heroes' });
    if (!id) break;
    g.spendGold(price);
    g.heal(g.hero(id), 1, 'healer');
  }
}

async function alchemist(g: Game) {
  await g.say('A wandering alchemist', 'Potions of healing (50 gp) and blade poison (30 gp). One of each per hero.', 'monsters/wandering_alchemist');
  for (const h of g.party()) {
    const opts = [
      { value: 'potion', label: 'Healing potion (50 gp)', disabled: g.s.partyGold >= 50 && h.classId !== 'barbarian' && h.classId !== 'kukla' ? false : 'Not available' },
      { value: 'poison', label: 'Blade poison (30 gp)', disabled: g.s.partyGold >= 30 ? false : 'Not enough gold' },
      { value: 'both', label: 'Both (80 gp)', disabled: g.s.partyGold >= 80 && h.classId !== 'barbarian' && h.classId !== 'kukla' ? false : 'Not available' },
      { value: '', label: 'Nothing' },
    ];
    const p = await g.choose(`${h.name} buys…`, opts, { who: h.id });
    if (p === 'potion' || p === 'both') g.spendGold(50), g.give(h, g.newItem('healing_potion'));
    if (p === 'poison' || p === 'both') g.spendGold(30), g.give(h, g.newItem('blade_poison'));
  }
}

async function caveEvent(g: Game, r: number) {
  const d = g.s.dungeon!;
  switch (r) {
    case 1: {
      const pay = await g.yesNo('A cave goblin scout', 'For 10 gp he will warn you of danger: no surprises and +1 to all Saves until you leave the caverns.', 'Pay 10 gp', 'No thanks', 'monsters/goblin_scout');
      if (pay && g.spendGold(10)) {
        d.noSurprise!.push({ env: 'caverns', reason: 'goblin scout' });
        d.saveBonusEnv!.push({ env: 'caverns', value: 1 });
      }
      return;
    }
    case 2: {
      const food = g.party().reduce((a, h) => a + inventoryCount(h, 'food'), 0);
      const give = food >= 2 && (await g.yesNo('Hungry cavemen', 'D6 cavemen explorers want food. Give 2 rations or fight.', 'Give 2 Food', 'Fight!', 'monsters/cavemen'));
      if (give) return void payFood(g, 2);
      const { fightFoe } = await import('./explore');
      await fightFoe(g, 'cavemen_event', { count: g.roll('d6') });
      return;
    }
    case 3: {
      const pay = await g.yesNo('A morlock spy', 'For 5 gp it betrays its kin: no surprise by morlocks in these caverns.', 'Pay 5 gp', 'No', 'monsters/morlock_spy');
      if (pay && g.spendGold(5)) d.keywords.push('no_morlock_surprise');
      return;
    }
    case 4:
      return trap(g, 'caverns');
    case 5: {
      if (!g.party().some((h) => h.classId === 'dwarf')) return void g.log('info', 'You pass through a quiet cavern.');
      const take = await g.yesNo('The dwarf spots a gem!', 'A gem worth d6×10 gp glints in the rock. Prying it out risks a 1-in-6 Wandering Monster check.', 'Dig it out', 'Leave it');
      if (!take) return;
      const v = g.roll('d6x10');
      await g.distribute(g.newItem('gem', { name: `Gem (${v} gp)`, value: v }));
      if (g.d6() === 1) {
        const { wanderingMonsters } = await import('./wandering');
        await wanderingMonsters(g, {});
      }
      return;
    }
    default:
      return dwarfMiner(g);
  }
}

async function dwarfMiner(g: Game) {
  await g.say('A dwarf miner', 'He buys gems and sells d6 gems worth 25 gp each. Trade with him and he will tell you what lies in the next tile.', 'monsters/dwarf_miner');
  let traded = false;
  const gems = g.party().flatMap((h) => h.inventory.filter((i) => i.base === 'gem' || i.base === 'jewelry').map((i) => ({ h, i })));
  for (const { h, i } of gems) {
    if (await g.yesNo(`Sell ${i.name}?`, `${i.value ?? 0} gp`)) {
      h.inventory = h.inventory.filter((x) => x !== i);
      g.s.partyGold += i.value ?? 0;
      traded = true;
    }
  }
  const stock = g.roll('d6');
  for (let k = 0; k < stock && g.s.partyGold >= 25; k++) {
    if (!(await g.yesNo(`Buy a gem for 25 gp? (${stock - k} left)`, `You have ${g.s.partyGold} gp.`))) break;
    g.spendGold(25);
    await g.distribute(g.newItem('gem', { name: 'Gem (25 gp)', value: 25 }));
    traded = true;
  }
  if (traded) g.s.dungeon!.keywords.push('peek_next');
}

async function fungalEvent(g: Game, r: number) {
  const d = g.s.dungeon!;
  switch (r) {
    case 1: {
      const pay = await g.yesNo('A halfling scout', 'For 10 gp: no surprises and +1 to all Saves until you leave the grottoes.', 'Pay 10 gp', 'No thanks', 'monsters/halfling_scout');
      if (pay && g.spendGold(10)) {
        d.noSurprise!.push({ env: 'fungal', reason: 'halfling scout' });
        d.saveBonusEnv!.push({ env: 'fungal', value: 1 });
      }
      return;
    }
    case 2: {
      const food = g.party().reduce((a, h) => a + inventoryCount(h, 'food'), 0);
      const mush = g.party().flatMap((h) => h.inventory.filter((i) => i.base === 'mushroom'));
      const p = await g.choose('Hungry cavemen', [
        { value: 'food', label: 'Give 4 Food rations', disabled: food >= 4 ? false : 'Not enough food' },
        { value: 'mush', label: 'Give a rare mushroom', disabled: mush.length ? false : 'None' },
        { value: 'fight', label: 'Fight!' },
      ], { art: 'monsters/cavemen', text: 'd6+2 cavemen looking for mushrooms. If fed, they show you a secret passage to the caves.' });
      if (p === 'fight') {
        const { fightFoe } = await import('./explore');
        await fightFoe(g, 'cavemen_event', { count: g.roll('d6+2') });
        return;
      }
      if (p === 'food') payFood(g, 4);
      else {
        const it = mush[0];
        for (const h of g.party()) h.inventory = h.inventory.filter((i) => i !== it);
      }
      d.keywords.push('passage_to_caves');
      g.log('good', 'The cavemen point out a hidden way to the caverns.');
      return;
    }
    case 3:
      await g.say('Spore cloud!', 'A cloud of toxic spores billows around you.', 'features/spore_trap');
      for (const o of await saveAll(g, { type: 'poison', target: g.hcl(), label: 'Save vs spores', bonuses: { mushroom_monk: 'immune', halfling: 'L', barbarian: 'L' } })) if (!o.success) await g.damage(o.hero, 2, 'spores');
      return;
    case 4:
      await trap(g, 'fungal');
      return fungalRareItem(g);
    case 5:
      if (g.party().some((h) => h.classId === 'mushroom_monk')) {
        d.keywords.push('mycelium_warning');
        await g.say('The mycelium whispers', 'Your mushroom monk senses danger: the next Trap or Wandering Monster in the grottoes is avoided.');
      } else g.log('info', 'The grotto is eerily quiet.');
      return;
    default:
      if (d.uniqueEvents.includes('fungal_merchant')) return fungalEvent(g, 4);
      d.uniqueEvents.push('fungal_merchant');
      const { merchant } = await import('./shopevents');
      return merchant(g, 1.2);
  }
}

async function witchEvent(g: Game) {
  const r = await g.tableRoll("Milethia's Cave event", 'd6', { context: '1-3 ghost · 4-6 healer' });
  if (r <= 3) {
    await g.say('A ghost!', 'A ghost drifts through the party.', 'monsters/ghost');
    for (const o of await saveAll(g, { type: 'magic', target: 4, label: 'Save vs L4 magic', bonuses: { cleric: 'L' } })) if (!o.success) await g.damage(o.hero, 1, 'ghost');
  } else await healer(g);
}

export function payFood(g: Game, n: number) {
  for (const h of g.party()) {
    const it = h.inventory.find((i) => i.base === 'food');
    if (!it || n <= 0) continue;
    const take = Math.min(n, it.qty ?? 1);
    it.qty = (it.qty ?? 1) - take;
    n -= take;
    if (!it.qty) h.inventory = h.inventory.filter((i) => i !== it);
  }
}

/** Halfling mushroom pickers trade reaction. */
export async function tradeWithPickers(g: Game) {
  const disc = g.party().some((h) => h.classId === 'halfling') ? 0.9 : 1;
  const n = g.roll('d6');
  const stock = Array.from({ length: n }, () => MUSHROOMS[g.d6() - 1]);
  await g.say('Mushroom pickers', `They offer ${n} rare mushrooms and food${disc < 1 ? ' (10% off for your halfling friend)' : ''}.`, 'monsters/halfling_pickers');
  for (const m of stock) {
    const price = Math.max(1, Math.ceil((m.resale || 20) * disc));
    if (g.s.partyGold < price) continue;
    if (await g.yesNo(`Buy ${m.name} for ${price} gp?`, m.desc)) {
      g.spendGold(price);
      await g.distribute(g.newItem('mushroom', { name: m.name, data: { kind: m.id }, value: m.resale, expires: m.id === 'healer_chanterelle' }));
    }
  }
  const food = g.roll('2d6');
  const buy = await g.choose(`Buy Food rations (1 gp each, ${food} available)`, [0, 2, 4, food].filter((x, i, a) => a.indexOf(x) === i && x <= food).map((x) => ({ value: x, label: x ? `${x} rations` : 'None' })));
  if (buy && g.spendGold(Math.ceil(buy * disc))) await g.distribute(g.newItem('food', { qty: buy }));
  void rareMushroom;
  void isAlive;
}
