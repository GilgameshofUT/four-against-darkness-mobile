import type { Game } from '../game';
import type { Tile } from '../types';
import { save } from '../checks';
import { addCondition, removeCond } from '../effects';
import { maxLife, isAlive } from '../hero';
import { rollTreasure, rareMushroom } from './treasure';

export const FEATURE_NAMES: Record<string, string> = {
  fountain: 'Fountain', shrine: 'Blessed Shrine', armory: 'Armory', cursed_altar: 'Cursed Altar', statue: 'Statue', puzzle_box: 'Puzzle Box',
  stalactites: 'Stalactites', stalagmites: 'Stalagmites', boulders: 'Boulders', echo: 'Echo', water_pool: 'Water Pool',
};

/** Dungeon Special Feature (d6) — rolled when entering an "empty + feature" tile. */
export async function specialFeature(g: Game, t: Tile) {
  const d = g.s.dungeon!;
  if (d.adventureKey === 'witch') {
    const r = await g.tableRoll('Special Feature', 'd6', { context: '1-3 fountain · 4-6 cursed altar' });
    return applyFeature(g, t, r <= 3 ? 'fountain' : 'cursed_altar');
  }
  if (t.env !== 'dungeon') {
    // Caverns/grottoes: the book's special feature for those envs is the cavern feature rule; offer a secret passage instead
    return;
  }
  const r = await g.tableRoll('Dungeon Special Feature', 'd6', { context: '1 fountain · 2 shrine · 3 armory · 4 cursed altar · 5 statue · 6 puzzle box' });
  const id = ['fountain', 'shrine', 'armory', 'cursed_altar', 'statue', 'puzzle_box'][r - 1];
  return applyFeature(g, t, id);
}

export async function applyFeature(g: Game, t: Tile, id: string) {
  const d = g.s.dungeon!;
  t.feature = id;
  t.featureState ??= {};
  switch (id) {
    case 'fountain': {
      if (d.keywords.includes('fountain_used')) return g.say('Fountain', 'Another fountain of clear water. It has no further effect.', 'features/fountain');
      d.keywords.push('fountain_used');
      await g.say('Fountain', 'Fresh, clean water. All wounded heroes drink and recover 1 Life.', 'features/fountain');
      for (const h of g.party()) if (h.life < maxLife(h)) g.heal(h, 1, 'fountain');
      return;
    }
    case 'shrine': {
      await g.say('Blessed Shrine', 'Holy light fills the shrine. One hero gains +1 to Attack vs undead and demons until they slay one.', 'features/shrine');
      const h = await g.pickHero('Who receives the blessing?', g.party());
      if (h) addCondition(h, { id: 'shrine_bonus', label: 'Shrine blessing (+1 vs undead/demons)' });
      for (const x of g.party()) if (x.conditions.some((c) => c.id === 'cursed')) (removeCond(x, 'cursed'), g.log('good', `${x.name}'s curse is lifted!`));
      return;
    }
    case 'armory': {
      await g.say('Armory', 'Racks of weapons and armor. Heroes may swap or replace weapons within the limits of their class.', 'features/armory');
      t.featureState.armory = true;
      const { armoryPick } = await import('./shopevents');
      await armoryPick(g);
      return;
    }
    case 'cursed_altar': {
      const victim = g.party()[Math.floor((g.d6() - 1) / 6 * g.party().length)];
      await g.say('Cursed Altar', `A sinister glow washes over ${victim.name}: −1 to Defense until the curse is broken (slay a Major Foe alone, visit a shrine, or receive a Blessing).`, 'features/cursed_altar');
      addCondition(victim, { id: 'cursed', label: 'Cursed (−1 Defense)' });
      return;
    }
    case 'statue': {
      const touch = await g.yesNo('A statue', 'A stone warrior stands on a plinth. Touch it?', 'Touch it', 'Leave it alone', 'features/statue');
      if (!touch) return;
      const r = await g.tableRoll('The statue…', 'd6', { context: '1–3 it awakens! · 4–6 it crumbles' });
      if (r >= 4) {
        g.log('good', 'The statue cracks open, revealing coins!');
        g.addGold(g.roll('3d6x10'), 'statue');
        return;
      }
      const { fightFoe } = await import('./explore');
      await fightFoe(g, 'living_statue', { major: true });
      return;
    }
    case 'puzzle_box': {
      const L = g.d6();
      await g.say('Puzzle box', `An intricate box (L${L}). Each failed attempt zaps the solver for 1 damage. Wizards and rogues add +L.`, 'features/puzzle_box');
      for (;;) {
        const h = await g.pickHero('Who tries to open it?', g.party(), undefined, true);
        if (!h) return;
        const res = await save(g, h, { type: 'puzzle', target: L, label: `Solve the puzzle box (L${L})`, bonuses: { wizard: 'L', rogue: 'L' } });
        if (res.success) {
          await rollTreasure(g, { env: t.env });
          return;
        }
        await g.damage(h, 1, 'puzzle box');
        if (!(await g.yesNo('Try again?', 'Each failure costs 1 Life.'))) return;
      }
    }
  }
}

/** Cavern Feature: roll on entering a cavern tile (1-2 in 6). Pre-rolled at generation for display. */
export function rollCavernFeature(g: Game, t: Tile) {
  if (t.env !== 'caverns' || t.cavernFeature !== undefined) return;
  if (g.d6() > 2) {
    t.cavernFeature = '';
    return;
  }
  const r = g.d6();
  t.cavernFeature = ['stalactites', 'stalagmites', 'boulders', 'echo', 'water_pool', 'water_pool'][r - 1];
  if (t.cavernFeature === 'echo') t.echo = true;
  if (t.cavernFeature === 'water_pool') t.feature = 'water_pool';
}

export async function waterPool(g: Game, t: Tile) {
  t.featureState ??= {};
  t.featureState.inspected = true;
  const who = g.party().filter((h) => h.classId !== 'kukla' && !t.featureState![`dipped_${h.id}`]);
  const h = await g.pickHero('Who dips into the pool?', who, 'Roll on the Water Pool table: contaminated, nothing, or healing.', true);
  if (!h) return;
  t.featureState[`dipped_${h.id}`] = true;
  const r = await g.tableRoll('Water Pool', 'd6', { context: '1 contaminated · 2–4 nothing · 5–6 heal 1' });
  if (r === 1) addCondition(h, { id: 'contaminated', label: 'Contaminated (−1 Saves)' });
  else if (r >= 5 && !g.isSpent(h, 'adventure', 'pool_heal')) {
    g.spend(h, 'adventure', 'pool_heal');
    g.heal(h, 1, 'cleansing water');
  } else g.log('info', 'Nothing happens.');
}

/** Search an empty tile (once). */
export async function search(g: Game, t: Tile) {
  if (t.searched) return;
  t.searched = true;
  const searcher = await g.pickHero('Who searches?', g.party(), 'Search modifiers: Keen Observer +1, Underground Explorer +1 (dungeons/caverns), corridors −1.');
  if (!searcher) return;
  const mods = [] as { label: string; value: number }[];
  if (t.corridor) mods.push({ label: 'Corridor', value: -1 });
  if (searcher.traits.includes('keen_observer')) mods.push({ label: 'Keen Observer', value: 1 });
  if (searcher.traits.includes('underground_explorer') && t.env !== 'fungal') mods.push({ label: 'Underground Explorer', value: 1 });
  const res = await g.heroRoll({ hero: searcher, kind: 'search', label: 'Search', mods, explode: false, context: '1 wandering monsters · 2–4 nothing · 5–6 discovery' });
  let r = res.total;
  const pole = g.party().some((h) => h.inventory.some((i) => i.base === 'ten_foot_pole'));
  if (pole && r >= 2 && r <= 4 && (await g.yesNo("Prod with the 10' pole?", 'Reroll this Search result.'))) {
    const r2 = await g.heroRoll({ hero: searcher, kind: 'search', label: 'Search (pole)', mods, explode: false, noReroll: true });
    r = r2.total;
  }
  // Mushroom monks/halflings count 4 as 5 in grottoes; listeners in caverns
  const listenBoost = t.env === 'caverns' && g.party().some((h) => ['elf', 'ranger', 'rogue', 'halfling', 'swashbuckler', 'acrobat', 'assassin', 'gnome', 'kukla'].includes(h.classId));
  const fungalBoost = t.env === 'fungal' && g.party().some((h) => h.classId === 'mushroom_monk' || h.classId === 'halfling');
  if (r <= 1) {
    g.log('bad', 'Your search attracts attention!');
    const { wanderingMonsters } = await import('./wandering');
    return wanderingMonsters(g, {});
  }
  if (r === 4 && fungalBoost) r = 5;
  if (r <= 4 && !(r === 4 && listenBoost)) return void g.log('info', 'The tile is really empty.');
  if (t.env === 'caverns') {
    const opts = [{ value: 'clue', label: 'Find 1 Clue' }, { value: 'listen', label: 'Listen at an opening', desc: 'Learn what is in a neighboring tile before entering.' }];
    const p = r === 4 ? 'listen' : await g.choose('You found something!', opts);
    if (p === 'clue') return gainClue(g, searcher.name);
    return listen(g, t);
  }
  if (t.env === 'fungal') {
    const p = await g.choose('You found something!', [{ value: 'clue', label: 'Find 1 Clue' }, { value: 'mush', label: 'Roll on the Rare Mushroom table' }]);
    if (p === 'clue') return gainClue(g, searcher.name);
    return rareMushroom(g);
  }
  const p = await g.choose('You found something! Choose:', [
    { value: 'treasure', label: 'Hidden treasure', desc: '(2d6+HCL)×(2d6+HCL) gp — but it may be protected.' },
    { value: 'door', label: 'Secret door', desc: 'Peek into a new tile first. Treasure behind it is doubled. 1-in-6 it is a safe exit.' },
    { value: 'passage', label: 'Secret passage', desc: 'Leads to the caverns or fungal grottoes.', disabled: g.s.settings.caverns || g.s.settings.fungal ? false : 'Disabled in settings' },
    { value: 'clue', label: '1 Clue' },
  ]);
  if (p === 'clue') return gainClue(g, searcher.name);
  if (p === 'treasure') return hiddenTreasure(g, t);
  if (p === 'door') return secretDoor(g, t);
  return secretPassage(g, t);
}

export async function gainClue(g: Game, who: string) {
  g.s.clues++;
  g.log('good', `${who} finds a Clue! (${g.s.clues} Clues)`);
  await g.say('A Clue!', `You now have ${g.s.clues} Clue${g.s.clues === 1 ? '' : 's'}. With 3 you can reveal a Secret.`, 'items/clue');
  if (g.s.dungeon?.adventureKey === 'witch' && g.s.clues >= 2 && !g.s.dungeon.keywords.includes('milethia_secret')) {
    const { milethiaSecret } = await import('./adventures');
    await milethiaSecret(g);
  }
}

async function hiddenTreasure(g: Game, t: Tile) {
  const H = g.hcl();
  const r = await g.tableRoll('Hidden treasure complication', 'd6', { context: '1–2 alarm · 3–5 trap · 6 ghost' });
  if (r <= 2) {
    g.log('bad', 'An alarm sounds!');
    const { wanderingMonsters } = await import('./wandering');
    await wanderingMonsters(g, {});
  } else if (r <= 5) {
    const rogue = g.party().find((h) => h.classId === 'rogue');
    if (rogue) {
      const res = await save(g, rogue, { type: 'trap', target: H + 1, label: `Disarm the trap (L${H + 1})` });
      if (!res.success) await g.damage(rogue, res.natural === 1 ? 2 : 1, 'trap');
    } else {
      const h = g.party()[Math.floor((g.d6() - 1) / 6 * g.party().length)];
      const res = await save(g, h, { type: 'trap', target: H + 1, label: `Save vs trap (L${H + 1})` });
      if (!res.success) await g.damage(h, res.natural === 1 ? 2 : 1, 'trap');
    }
  } else {
    const cleric = g.party().find((h) => h.classId === 'cleric');
    const res = cleric ? await save(g, cleric, { type: 'magic', target: H, label: 'Banish the ghost' }) : undefined;
    if (!res?.success) for (const h of g.party()) await g.damage(h, 1, 'ghost', { noReduce: true });
  }
  if (!g.party().length) return;
  const a = g.roll('2d6') + H;
  const b = g.roll('2d6') + H;
  g.addGold(a * b * (t.treasureDouble ? 2 : 1), 'hidden treasure');
}

export async function listen(g: Game, t: Tile) {
  const d = g.s.dungeon!;
  const opts = t.connectors.filter((c) => c.to && !d.tiles[c.to].visited).map((c) => ({ value: c.to!, label: `Opening ${directionName(c.dx, c.dy)}` }));
  if (!opts.length) return void g.log('info', 'There is nothing to hear.');
  const id = await g.choose('Listen at which opening?', opts);
  const n = d.tiles[id];
  n.notes.push('peeked');
  n.explored = true;
  g.log('good', 'You listen carefully and learn what lies beyond.');
}

export function directionName(dx: number, dy: number) {
  return dy < 0 ? 'north' : dy > 0 ? 'south' : dx > 0 ? 'east' : 'west';
}

async function secretDoor(g: Game, t: Tile) {
  const d = g.s.dungeon!;
  const region = d.regions.find((r) => r.id === t.region)!;
  const { attachTile } = await import('./generate');
  // Try each wall cell of this tile for a new door
  const dirs: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const cands: { x: number; y: number; dx: number; dy: number }[] = [];
  for (const [x, y] of t.cells) for (const [dx, dy] of dirs) if (!t.cells.some(([a, b]) => a === x + dx && b === y + dy)) cands.push({ x, y, dx, dy });
  for (let i = cands.length - 1; i > 0; i--) {
    const j = Math.floor((g.d6() - 1 + (g.d6() - 1) * 6) / 36 * (i + 1));
    [cands[i], cands[j]] = [cands[j], cands[i]];
  }
  for (const c of cands) {
    const conn: import('../types').Connector = { id: `${t.id}c${t.connectors.length}`, ...c, door: true, hiddenDoor: true };
    t.connectors.push(conn);
    const before = Object.keys(d.tiles).length;
    const nt = attachTile(g, region, t, conn, { secret: true });
    if (nt && Object.keys(d.tiles).length > before) {
      nt.treasureDouble = true;
      nt.explored = true;
      nt.notes.push('peeked', 'secret');
      const exit = g.d6() === 6 || (g.party().some((h) => h.classId === 'halfling' && (h.resources.luck ?? 0) > 0) && (await g.yesNo('Spend Luck?', 'Reroll the 1-in-6 safe-exit chance?')) && (g.party().find((h) => h.classId === 'halfling')!.resources.luck--, g.d6() === 6));
      if (exit) {
        conn.exit = true;
        nt.notes.push('safe_exit');
      }
      await g.say('Secret door!', `A hidden door swings open. You peek inside: ${describeContent(nt)}.${exit ? ' Fresh air — it is a safe way out of the dungeon!' : ''} Foes inside will be surprised. Treasure here is doubled.`, 'features/secret_door');
      return;
    }
    t.connectors = t.connectors.filter((x) => x !== conn);
  }
  g.log('info', 'You find a secret door — but it opens onto solid rock.');
}

async function secretPassage(g: Game, t: Tile) {
  const opts = [] as { value: string; label: string }[];
  if (t.env !== 'caverns' && g.s.settings.caverns) opts.push({ value: 'caverns', label: 'The Caverns' });
  if (t.env !== 'fungal' && g.s.settings.fungal) opts.push({ value: 'fungal', label: 'The Fungal Grottoes' });
  if (t.env !== 'dungeon') opts.push({ value: 'dungeon', label: 'Back to the Dungeon' });
  const env = await g.choose('A secret passage leads to…', opts, { art: 'features/secret_passage' });
  const { openPassage } = await import('./explore');
  await openPassage(g, t, env as never);
}

export function describeContent(t: Tile): string {
  const c = t.content;
  switch (c.type) {
    case 'empty': return 'it looks empty';
    case 'treasure': return 'something glitters';
    case 'trap_treasure': return 'treasure — suspiciously unguarded';
    case 'special_event': return 'something strange';
    case 'special_feature': return 'an unusual feature';
    case 'encounter': return t.foeDefId ? `${t.foeDefId.replace(/_/g, ' ')}` : `${c.table === 'boss' ? 'a powerful creature' : c.table === 'weird' ? 'a weird monster' : c.table === 'minion' ? 'a band of creatures' : 'vermin'}`;
    default: return 'darkness';
  }
}

void isAlive;
