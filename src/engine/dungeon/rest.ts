import type { Game } from '../game';
import { maxLife, inventoryCount, tierOf } from '../hero';
import { neighbors } from './generate';
import { foeAlive } from '../foe';
import { payFood } from './events';

export function canRest(g: Game): string | undefined {
  const d = g.s.dungeon!;
  const t = d.tiles[d.currentTile];
  if (d.restUsed) return 'You have already rested this adventure.';
  if (t.corridor) return 'You must rest in a room.';
  if (t.foes?.some(foeAlive)) return 'Foes are present.';
  const adj = neighbors(d, t);
  if (adj.some((n) => !n.visited || n.foes?.some(foeAlive))) return 'All adjacent tiles must be explored and cleared first.';
  return;
}

export async function rest(g: Game) {
  const d = g.s.dungeon!;
  const t = d.tiles[d.currentTile];
  const block = canRest(g);
  if (block) return void (await g.say('Cannot rest', block));
  d.restUsed = true;
  // Nail doors shut
  const doors = t.connectors.filter((c) => c.door && c.to && !c.doorState?.destroyed);
  const nails = g.party().reduce((a, h) => a + inventoryCount(h, 'bag_of_nails'), 0);
  let nailed = 0;
  if (doors.length && nails) {
    for (const dr of doors) {
      if (nailed >= nails) break;
      const h = g.party().find((x) => inventoryCount(x, 'bag_of_nails') > 0)!;
      const it = h.inventory.find((i) => i.base === 'bag_of_nails')!;
      it.qty = (it.qty ?? 1) - 1;
      if (!it.qty) h.inventory = h.inventory.filter((i) => i !== it);
      dr.doorState = { ...(dr.doorState ?? { kind: 'normal', level: 0, rolled: true, open: true }), nailed: true };
      nailed++;
    }
  }
  const allNailed = doors.length > 0 && nailed >= doors.length;
  await g.say('Rest', `The party rests${allNailed ? ' behind nailed doors' : doors.length ? ` (${nailed}/${doors.length} doors nailed shut)` : ' (no doors to secure!)'}. Each hero recovers 1 Life or 1 spent ability.`, 'scenes/camp_rest');
  // Nourishing meal
  const halfling = g.party().find((h) => h.classId === 'halfling' && !g.isSpent(h, 'adventure', 'meal'));
  const food = g.party().reduce((a, h) => a + inventoryCount(h, 'food'), 0);
  if (halfling && food > 0) {
    const n = Math.min(food, g.party().length);
    if (await g.yesNo(`${halfling.name} cooks a Nourishing Meal`, `Use ${n} Food rations: everyone who eats heals 1 extra Life; halflings recover 1 Madness.`, 'Cook!', 'Not now')) {
      g.spend(halfling, 'adventure', 'meal');
      payFood(g, n);
      for (const h of g.party().filter((x) => x.classId !== 'kukla').slice(0, n)) {
        g.heal(h, 1, 'Nourishing Meal');
        if (h.classId === 'halfling' && h.madness > 0) h.madness--;
      }
    }
  }
  const cook = g.party().find((h) => h.traits.includes('comforting_cook'));
  if (cook && g.party().reduce((a, h) => a + inventoryCount(h, 'food'), 0) > 0 && (await g.yesNo('Comforting Cook', `${cook.name} uses 1 Food: they and one ally recover 1 extra Life.`))) {
    payFood(g, 1);
    g.heal(cook, 1, 'Comforting Cook');
    const ally = await g.pickHero('Which ally?', g.party().filter((h) => h !== cook && h.life < maxLife(h)));
    if (ally) g.heal(ally, 1, 'Comforting Cook');
  }
  for (const h of g.party()) {
    const opts: { value: string; label: string; disabled?: string | false }[] = [{ value: 'life', label: 'Recover 1 Life', disabled: h.life < maxLife(h) && h.classId !== 'kukla' ? false : 'Not wounded' }];
    const spent = h.spells.filter((s) => s.used);
    if (spent.length && (h.classId === 'wizard' || h.classId === 'elf' || h.classId === 'illusionist' || h.classId === 'druid' || h.classId === 'gnome')) opts.push({ value: 'spell', label: 'Recover a spell' });
    if (h.classId === 'cleric') opts.push({ value: 'healing', label: 'Recover a Healing prayer' }, { value: 'blessing', label: 'Recover a Blessing prayer' });
    if (h.classId === 'halfling') opts.push({ value: 'luck', label: 'Recover 1 Luck' });
    if (h.classId === 'barbarian') opts.push({ value: 'rage', label: 'Recover 1 Rage attack' });
    if (h.classId === 'paladin') opts.push({ value: 'prayer', label: 'Recover 1 prayer point' });
    if (h.classId === 'mushroom_monk') opts.push({ value: 'spores', label: 'Recover 1 use of Spores' });
    if (h.classId === 'gnome') opts.push({ value: 'gadget', label: 'Recover 1 gadget point' });
    if (h.classId === 'kukla') opts.push({ value: 'repair', label: 'Repair with spare parts (4 Life)', disabled: g.party().some((x) => x !== h && inventoryCount(x, 'spare_parts') > 0) ? false : 'No spare parts' });
    if (opts.every((o) => o.disabled)) continue;
    const p = await g.choose(`${h.name} rests and…`, opts, { who: h.id });
    if (p === 'life') g.heal(h, 1, 'rest');
    if (p === 'spell') {
      const id = await g.choose('Recover which spell?', spent.map((s, i) => ({ value: i, label: s.id.replace(/_/g, ' ') })));
      spent[id].used = false;
    }
    if (['healing', 'blessing', 'luck', 'rage', 'prayer', 'spores', 'gadget'].includes(p)) h.resources[p] = (h.resources[p] ?? 0) + 1;
    if (p === 'repair') {
      const giver = g.party().find((x) => x !== h && inventoryCount(x, 'spare_parts') > 0)!;
      const it = giver.inventory.find((i) => i.base === 'spare_parts')!;
      it.qty = (it.qty ?? 1) - 1;
      if (!it.qty) giver.inventory = giver.inventory.filter((i) => i !== it);
      g.heal(h, 4, 'repair');
    }
    if (h.classId === 'acrobat') h.resources.trick = (h.resources.trick ?? 0) + tierOf(h.level);
    h.conditions = h.conditions.filter((c) => !['berserk_tired', 'poisoned_food'].includes(c.id));
  }
  // Wandering monsters (1-in-6), arriving after recovery
  const r = await g.tableRoll('Disturbed while resting?', 'd6', { context: '1: wandering monsters' });
  if (r === 1) {
    g.log('bad', allNailed ? 'Something forces a nailed door — you are ready for it!' : 'Something bursts in!');
    const { wanderingMonsters } = await import('./wandering');
    await wanderingMonsters(g, { resting: allNailed });
  }
}
