import type { Game } from '../game';
import type { Connector, Env, Tile } from '../types';
import { rollFoe, wanderingCheck, wanderingMonsters } from './wandering';
import { fightFoe } from './fight';
import { trap } from './traps';
import { rollTreasure } from './treasure';
import { specialEvent } from './events';
import { specialFeature, rollCavernFeature, describeContent } from './features';
import { addRegion, pregenerate, contentRoll } from './generate';
import { openDoor } from './doors';
import { FOES } from '../../data/foes';
import { foeAlive } from '../foe';
import { hasLight } from '../effects';

export { fightFoe };

/** Move through a connector into a neighboring tile. */
export async function moveThrough(g: Game, conn: Connector) {
  const d = g.s.dungeon!;
  const from = d.tiles[d.currentTile];
  if (conn.exit) {
    const { leaveDungeon } = await import('./leave');
    return leaveDungeon(g);
  }
  if (!conn.to || conn.blocked) return;
  const to = d.tiles[conn.to];
  // Doors
  if (conn.door && !to.visited && g.s.settings.doorTable && d.adventureKey === 'random') {
    const ok = await openDoor(g, from, conn);
    if (!ok) return;
  }
  if (!hasLight(g)) g.log('bad', 'You stumble on in darkness (−2 to everything)!');
  d.previousTile = from.id;
  d.currentTile = to.id;
  tickTiles(g);
  if (to.visited) {
    await reenter(g, to);
  } else {
    await enterNew(g, to);
  }
  g.io.checkpoint(`tile:${to.id}`);
}

/** Torches, temporary conditions measured in tiles. */
function tickTiles(g: Game) {
  for (const h of g.party()) {
    for (const c of h.conditions) if (c.tilesLeft !== undefined && c.id !== 'bear_form') c.tilesLeft--;
    const expired = h.conditions.filter((c) => c.tilesLeft !== undefined && c.tilesLeft <= 0 && c.id !== 'bear_form');
    if (expired.length) {
      h.conditions = h.conditions.filter((c) => !expired.includes(c));
      for (const e of expired) {
        if (e.id === 'phoenix') g.damage(h, 1, 'phoenix mushroom fades', { noReduce: true });
        g.log('info', `${h.name}: ${e.label} wears off.`);
      }
    }
  }
  const d = g.s.dungeon!;
  if (g.s.settings.torchDuration && d.lanternBearer) {
    const h = g.hero(d.lanternBearer);
    const torch = h.inventory.find((i) => i.uid === h.equip.main || i.uid === h.equip.off);
    if (torch?.base === 'torch_weapon') {
      torch.charges = (torch.charges ?? 6) - 1;
      if (torch.charges <= 0) {
        h.inventory = h.inventory.filter((i) => i !== torch);
        for (const k of ['main', 'off'] as const) if (h.equip[k] === torch.uid) h.equip[k] = undefined;
        d.lanternBearer = undefined;
        g.log('bad', 'The torch gutters out!');
      }
    }
  }
}

async function reenter(g: Game, t: Tile) {
  const d = g.s.dungeon!;
  if (t.foes?.some(foeAlive) && t.foeAttitude === 'hostile') {
    const f = t.foes.filter(foeAlive);
    t.foes = undefined;
    await fightFoe(g, f[0].defId, { foes: f, noBossCheck: true, intro: `The ${f[0].name} are still here!` });
    return;
  }
  if (t.foeAttitude === 'ignore' && t.foes?.length) {
    const { rollReaction } = await import('../combat/reactions');
    void rollReaction;
  }
  if (d.keywords.includes('call_wanderers_now')) {
    d.keywords = d.keywords.filter((k) => k !== 'call_wanderers_now');
    await wanderingMonsters(g, {});
    return;
  }
  await wanderingCheck(g, 1);
}

async function enterNew(g: Game, t: Tile) {
  const d = g.s.dungeon!;
  t.visited = true;
  t.explored = true;
  d.tilesEntered++;
  t.enteredOrder = d.tilesEntered;
  rollCavernFeature(g, t);
  if (d.adventureKey === 'witch') {
    const { witchRoom } = await import('./adventures');
    if (await witchRoom(g, t)) return finishTile(t);
  }
  const roll = contentRoll(t);
  const env = t.env;
  if (roll !== undefined) g.log('roll', `Tile content (2d6) ${roll}: ${describeContent(t)}${t.corridor ? ' (corridor)' : ''}.`);
  if (t.cavernFeature) await cavernFeatureIntro(g, t);
  // Pending wanderers from traps/shrieks
  if (d.keywords.includes('call_wanderers_now')) {
    d.keywords = d.keywords.filter((k) => k !== 'call_wanderers_now');
    await wanderingMonsters(g, {});
  }
  // Tile limit forces the Final Boss
  if (g.s.settings.tileLimit && d.tilesEntered >= g.s.settings.tileLimit && !d.finalBossFound && d.adventureKey === 'random') {
    const def = await rollFoe(g, env, 'boss', { fiendish: false });
    await fightFoe(g, def.id, { intro: 'The master of this dungeon awaits!' });
    return finishTile(t);
  }
  const c = t.content;
  switch (c.type) {
    case 'entrance':
      break;
    case 'treasure':
      await rollTreasure(g, { env, goldMult: t.treasureDouble ? 2 : 1, mod: t.treasureMod });
      break;
    case 'trap_treasure':
      await trap(g, env);
      if (g.party().length) await rollTreasure(g, { env, goldMult: t.treasureDouble ? 2 : 1, mod: t.treasureMod });
      break;
    case 'special_event':
      await specialEvent(g, env);
      break;
    case 'special_feature':
      if (env === 'dungeon') {
        const p = (g.s.settings.caverns || g.s.settings.fungal) ? await g.choose('Something unusual…', [{ value: 'feature', label: 'Investigate the room (Special Feature)' }, { value: 'passage', label: 'Look for a Secret Passage instead', desc: 'Leads to the caverns or fungal grottoes.' }]) : 'feature';
        if (p === 'feature') await specialFeature(g, t);
        else {
          const { search } = await import('./features');
          void search;
          await openPassagePrompt(g, t);
        }
      } else if ((g.s.settings.caverns || g.s.settings.fungal)) {
        if (await g.yesNo('A hidden way?', 'You notice drafts in this tile. Look for a Secret Passage to another environment?', 'Search for it', 'Ignore')) await openPassagePrompt(g, t);
      }
      break;
    case 'encounter': {
      const def = c.dragon ? FOES[env === 'dungeon' ? 'young_dragon' : env === 'caverns' ? 'cave_dragon' : 'fungal_dragon'] : await rollFoe(g, env, c.table);
      t.foeDefId = def.id;
      // Secret: The Prisoner
      await fightFoe(g, def.id, { partySurprise: !!t.secret });
      break;
    }
    case 'empty':
      if (c.clue) {
        const { gainClue } = await import('./features');
        await gainClue(g, 'The party');
      }
      if (contentRoll(t) === 9 && g.s.clues >= 2 && (g.s.settings.caverns || g.s.settings.fungal) && (await g.yesNo('A hidden passage?', 'Spend 2 Clues to find a Secret Passage to another environment?', 'Spend 2 Clues', 'No'))) {
        g.s.clues -= 2;
        await openPassagePrompt(g, t);
      }
      break;
  }
  finishTile(t);
}

function finishTile(t: Tile) {
  if (!t.foes?.some(foeAlive)) {
    t.resolved = true;
    t.cleared = true;
  }
}

async function cavernFeatureIntro(g: Game, t: Tile) {
  const text: Record<string, string> = {
    stalactites: 'Stalactites hang overhead. An exploding two-handed attack may bring one down.',
    stalagmites: 'A forest of stalagmites: no exploding Attack rolls here.',
    boulders: 'Boulders everywhere: +1 Defense vs ranged, −1 to your ranged attacks, +1 Stealth, Foes surprise more easily.',
    echo: 'Every sound echoes: −1 Stealth, 2-in-6 wandering monsters, spells may echo (6: cast again free).',
    water_pool: 'A still pool of water glimmers here.',
  };
  if (t.cavernFeature && text[t.cavernFeature]) await g.say(t.cavernFeature.replace('_', ' ').replace(/^./, (s) => s.toUpperCase()), text[t.cavernFeature], `features/${t.cavernFeature}`);
}

async function openPassagePrompt(g: Game, t: Tile) {
  const opts = [] as { value: Env; label: string }[];
  if (t.env !== 'caverns' && g.s.settings.caverns) opts.push({ value: 'caverns', label: 'The Caverns' });
  if (t.env !== 'fungal' && g.s.settings.fungal) opts.push({ value: 'fungal', label: 'The Fungal Grottoes' });
  if (t.env !== 'dungeon') opts.push({ value: 'dungeon', label: 'The Dungeon' });
  if (!opts.length) return;
  const env = opts.length === 1 ? opts[0].value : await g.choose('A secret passage leads to…', opts, { art: 'features/secret_passage' });
  await openPassage(g, t, env);
}

/** Create a new region in another environment, linked from this tile. */
export async function openPassage(g: Game, t: Tile, env: Env) {
  const d = g.s.dungeon!;
  const conn: Connector = { id: `${t.id}c${t.connectors.length}`, x: t.cells[0][0], y: t.cells[0][1], dx: 0, dy: -1, door: false };
  t.connectors.push(conn);
  const region = addRegion(g, env, { tile: t, conn });
  conn.to = region.start;
  pregenerate(g, region.id);
  d.tiles[region.start].explored = true;
  t.notes.push(`passage:${env}`);
  await g.say('Secret passage!', `A hidden way leads to ${env === 'caverns' ? 'the Caverns' : env === 'fungal' ? 'the Fungal Grottoes' : 'the Dungeon'}. It is marked on your map.`, 'features/secret_passage');
}

/** Actions available in the current tile when no combat is happening. */
export function tileActions(g: Game): { id: string; label: string; desc?: string; disabled?: string | false }[] {
  const d = g.s.dungeon!;
  const t = d.tiles[d.currentTile];
  const acts: { id: string; label: string; desc?: string; disabled?: string | false }[] = [];
  const emptyish = t.content.type === 'empty' || t.content.type === 'special_feature' || (t.cleared && t.content.type === 'encounter' && false);
  if (emptyish && !t.searched && t.content.type !== 'entrance') acts.push({ id: 'search', label: 'Search', desc: t.corridor ? 'Corridors: −1' : undefined, disabled: hasLight(g) ? false : 'Cannot search in darkness' });
  if (t.feature === 'water_pool') acts.push({ id: 'pool', label: 'Inspect the pool' });
  if (t.featureState?.armory) acts.push({ id: 'armory', label: 'Use the armory' });
  if (!d.restUsed) acts.push({ id: 'rest', label: 'Rest', desc: 'Once per adventure. Needs a cleared room with doors you can nail shut.' });
  if (g.s.clues >= 3) acts.push({ id: 'secret', label: 'Reveal a Secret (3 Clues)' });
  if (d.keywords.includes('kerrak_dar') && t.searched && g.s.clues >= 1) acts.push({ id: 'kerrak', label: 'Find the Gold of Kerrak Dar (1 Clue)' });
  if (t.notes.includes('weapons')) acts.push({ id: 'weapons', label: 'Take weapons from the fallen' });
  acts.push({ id: 'marching', label: 'Marching order & lantern' });
  acts.push({ id: 'inventory', label: 'Inventory, potions & bandages' });
  return acts;
}

export function exitsFrom(g: Game, t: Tile) {
  const d = g.s.dungeon!;
  return t.connectors.filter((c) => (c.to || c.exit) && !c.blocked && !(c.hiddenDoor && !d.tiles[c.to ?? '']?.explored)).map((c) => ({ conn: c, tile: c.to ? d.tiles[c.to] : undefined }));
}
