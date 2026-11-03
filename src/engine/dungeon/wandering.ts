import type { Game } from '../game';
import type { Env, FoeCategory } from '../types';
import { foeTable, FOES, type FoeDef } from '../../data/foes';

/** Which foe table to use (fiendish setting may swap). */
export function useFiendish(g: Game): boolean {
  const s = g.s.settings.fiendishFoes;
  if (s === 'replace') return true;
  if (s === 'mixed') return g.d6() >= 4;
  return false;
}

/** Display names for a foe table, aligned 1:1 with d6 roll values.
 * Dungeon minions entry 1 is "Skeletons (1-3) or Zombies (4-6)": two defs share
 * slot 1, so slots 2-6 are table[2..6]. Everywhere else slot i is table[i-1]. */
export function tableEntryNames(env: Env, cat: FoeCategory, fiendish: boolean): string[] {
  const table = foeTable(env, cat, fiendish);
  if (!fiendish && env === 'dungeon' && cat === 'minion')
    return [`1 ${table[0].name} (1-3) or ${table[1].name} (4-6)`, ...table.slice(2).map((f, i) => `${i + 2} ${f.name}`)];
  return table.map((f, i) => `${i + 1} ${f.name}`);
}

/** Roll a foe on the environment table. Dungeon minion 1 = skeletons (1-3) or zombies (4-6). */
export async function rollFoe(g: Game, env: Env, cat: FoeCategory, opts: { wandering?: boolean; fiendish?: boolean } = {}): Promise<FoeDef> {
  const fiendish = opts.fiendish ?? useFiendish(g);
  for (let guard = 0; guard < 20; guard++) {
    const table = foeTable(env, cat, fiendish);
    const names = tableEntryNames(env, cat, fiendish).join(' · ');
    const r = await g.tableRoll(`${fiendish ? 'Fiendish ' : ''}${catName(cat)} table`, 'd6', { context: names });
    let def: FoeDef;
    if (!fiendish && env === 'dungeon' && cat === 'minion') {
      if (r === 1) def = g.d6() <= 3 ? FOES.skeletons : FOES.zombies;
      else def = table[r]; // table has skeletons & zombies as separate entries at 0,1
    } else def = table[r - 1];
    if (opts.wandering && (def.event || def.noWandering)) {
      g.log('info', `${def.name} — rerolled (never met as Wandering Monsters).`);
      continue;
    }
    return def;
  }
  return FOES.rats;
}

export function catName(c: FoeCategory) {
  return { vermin: 'Vermin', minion: 'Minions', weird: 'Weird Monster', boss: 'Boss Monster' }[c];
}

/** Wandering Monsters: roll d6 for the category then the foe. They ambush. */
export async function wanderingMonsters(g: Game, o: { eventTable?: boolean; resting?: boolean }) {
  const d = g.s.dungeon!;
  // Ways to ignore the arrival
  const ign = g.party().find((h) => h.traits.includes('survival_instinct') && !g.isSpent(h, 'adventure', 'survival_instinct'));
  const oint = g.party().find((h) => h.inventory.some((i) => i.base === 'miners_ointment'));
  const env = d.tiles[d.currentTile].env;
  if (env === 'fungal' && d.keywords.includes('mycelium_warning')) {
    d.keywords = d.keywords.filter((k) => k !== 'mycelium_warning');
    return void g.log('good', 'The mycelium warned you; you avoid the wandering monsters.');
  }
  const opts = [] as { value: string; label: string }[];
  if (ign) opts.push({ value: 'instinct', label: `${ign.name}: Survival Instinct` });
  if (oint) opts.push({ value: 'ointment', label: "Use Miners' Ointment" });
  if (opts.length) {
    const p = await g.choose('Something is coming!', [...opts, { value: '', label: 'Face them' }]);
    if (p === 'instinct') return void (g.spend(ign!, 'adventure', 'survival_instinct'), g.log('good', 'You slip out of sight in time.'));
    if (p === 'ointment') {
      oint!.inventory = oint!.inventory.filter((i) => i.base !== 'miners_ointment');
      return void g.log('good', 'The ointment masks your scent. They pass you by.');
    }
  }
  const r = await g.tableRoll('Wandering Monsters', 'd6', { context: o.eventTable ? '1–3 vermin · 4 minions · 5 weird · 6 boss' : '1–2 vermin · 3–4 minions · 5 weird · 6 boss' });
  const cat: FoeCategory = o.eventTable ? (r <= 3 ? 'vermin' : r === 4 ? 'minion' : r === 5 ? 'weird' : 'boss') : r <= 2 ? 'vermin' : r <= 4 ? 'minion' : r === 5 ? 'weird' : 'boss';
  const def = await rollFoe(g, env, cat, { wandering: true });
  const { fightFoe } = await import('./explore');
  await fightFoe(g, def.id, { wandering: true, ambush: !o.resting, resting: o.resting });
}

/** 1-in-6 (or more) chance of wandering monsters when retracing steps etc. */
export async function wanderingCheck(g: Game, chance = 1, why = 'Retracing your steps') {
  const d = g.s.dungeon!;
  const tile = d.tiles[d.currentTile];
  if (tile.foeAttitude === 'bribed') return false;
  let c = chance + d.wanderingBonus + (tile.echo ? 1 : 0);
  d.wanderingBonus = 0;
  const r = await g.tableRoll(`${why}: Wandering Monsters?`, 'd6', { context: `${c}-in-6` });
  if (r <= c) {
    await wanderingMonsters(g, {});
    return true;
  }
  return false;
}
