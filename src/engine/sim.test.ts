import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { ScriptIo, type ChoicePrompt } from './io';
import { newState } from './state';
import { buildHero } from './setup/create';
import { startAdventure } from './campaign';
import { moveThrough, tileActions, exitsFrom } from './dungeon/explore';
import { search } from './dungeon/features';
import { CLASS_ORDER } from '../data/classes';
import { STARTING_KITS } from '../data/starting';
import { TRAITS } from '../data/traits';
import { int, makeRng } from './rng';
import type { ClassId } from './types';

/** A random-but-sane auto-player for smoke testing the whole engine. */
function randomPicker(seed: number) {
  const r = makeRng(seed);
  return <T,>(p: ChoicePrompt<T>): T => {
    const en = p.options.filter((o) => !o.disabled);
    if (!en.length) throw new Error('no options: ' + p.title);
    // Avoid infinite menus: prefer non-back/cancel, and End turn sometimes
    const back = en.filter((o) => /^(Back|Never mind|Done|Nothing|Leave it|Accept the result|No|Take it|Keep|Refuse)/.test(o.label));
    if (p.title.includes('action')) {
      const att = en.filter((o) => /Attack|Cast|Shoot|Rage|Prayer|Trick|Gadget/.test(o.label));
      if (att.length && int(r, 1, 10) > 2) return att[int(r, 0, att.length - 1)].value;
    }
    if (p.title.startsWith('Round') || p.title.startsWith('Ranged attacks')) {
      const heroes = en.filter((o) => !String(o.value).startsWith('__'));
      if (heroes.length && int(r, 1, 20) > 1) return heroes[0].value;
      const end = en.find((o) => o.value === ('__end' as unknown as T));
      if (end) return end.value;
    }
    if (back.length && int(r, 1, 3) === 1) return back[0].value;
    return en[int(r, 0, en.length - 1)].value;
  };
}

async function playOne(seed: number, classes: ClassId[]) {
  const s = newState(seed);
  const io = new ScriptIo(randomPicker(seed * 7 + 1));
  const g = new Game(s, io);
  for (const c of classes) {
    const kit = STARTING_KITS[c][0];
    const { hero, gold } = buildHero(s.rng, { name: c, classId: c, portrait: `${c}_1`, traits: [TRAITS[c][int(s.rng, 0, 5)].id], kit: kit.id, damage: {}, choices: { companion: 'warhound' }, swornEnemy: 'orc' });
    s.guild.roster.push(hero);
    s.guild.gold += gold;
  }
  // Give someone a lantern
  s.guild.roster[0].inventory.push({ uid: 'lan', base: 'lantern', name: 'Lantern' });
  s.guild.roster[0].equip.off = 'lan';
  await startAdventure(g, s.guild.roster.map((h) => h.id));
  let steps = 0;
  while (s.mode === 'dungeon' && steps++ < 120) {
    if (!g.party().length) break;
    const d = s.dungeon!;
    const t = d.tiles[d.currentTile];
    if (tileActions(g).some((a) => a.id === 'search') && int(s.rng, 1, 2) === 1) await search(g, t);
    if (s.mode !== 'dungeon' || !g.party().length) break;
    const exits = exitsFrom(g, d.tiles[d.currentTile]).filter((e) => !e.conn.exit);
    const unvisited = exits.filter((e) => e.tile && !e.tile.visited);
    const pick = unvisited.length ? unvisited[int(s.rng, 0, unvisited.length - 1)] : exits[int(s.rng, 0, Math.max(0, exits.length - 1))];
    if (!pick) break;
    await moveThrough(g, pick.conn);
    if (d.finalBossSlain) break;
  }
  return { g, steps, alive: g.party().length, tiles: s.dungeon ? Object.values(s.dungeon.tiles).filter((t) => t.visited).length : 0 };
}

describe('full adventure simulation', () => {
  it('runs many random adventures without crashing', async () => {
    const results = [];
    for (let seed = 1; seed <= 60; seed++) {
      const r = makeRng(seed * 13);
      const classes = Array.from({ length: 4 }, () => CLASS_ORDER[int(r, 0, CLASS_ORDER.length - 1)]);
      try {
        const res = await playOne(seed, classes);
        results.push(`${seed} ${classes.join(',')}: steps ${res.steps} tiles ${res.tiles} alive ${res.alive}`);
      } catch (e) {
        throw new Error(`seed ${seed} [${classes.join(',')}]: ${(e as Error).stack}`);
      }
    }
    console.log(results.slice(0, 15).join('\n'));
    expect(results.length).toBe(60);
  }, 120000);
});
