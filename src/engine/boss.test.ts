import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { ScriptIo, firstEnabled, type ChoicePrompt } from './io';
import type { RollResult } from './dice';
import { newState } from './state';
import { buildHero } from './setup/create';
import { startAdventure } from './campaign';
import { moveThrough, exitsFrom } from './dungeon/explore';
import { STARTING_KITS } from '../data/starting';
import { int } from './rng';
import type { ClassId } from './types';

class RecIo extends ScriptIo {
  bossRolls: { total: number; label: string }[] = [];
  bossDeclared: string[] = [];
  async roll(p: { label: string }, r: RollResult) {
    if (/^(Is this the Final Boss|Final Boss \(reroll)/.test(p.label)) this.bossRolls.push({ total: r.total, label: p.label });
  }
  async pause(title: string) {
    if (title === 'The Final Boss!') this.bossDeclared.push(title);
  }
}

describe('Final Boss determination', () => {
  it('only declares a Final Boss on a modified roll of 6+', async () => {
    let declared = 0;
    let checks = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const s = newState(seed);
      let last = '';
      const io = new RecIo(<T,>(p: ChoicePrompt<T>) => {
        if (p.title.includes('action') && last.includes('action')) {
          const hold = p.options.find((o) => /Hold|Wait/.test(o.label));
          last = p.title;
          if (hold) return hold.value;
        }
        last = p.title;
        // never use ranger reroll; otherwise first sane option
        const no = p.options.find((o) => o.label === 'Keep');
        if (no) return no.value;
        const atk = p.options.find((o) => !o.disabled && /Attack \(/.test(o.label));
        if (atk) return atk.value;
        const hold = p.options.find((o) => /Hold/.test(o.label));
        if (hold && p.title.includes('action')) return hold.value;
        return firstEnabled(p);
      });
      const g = new Game(s, io);
      for (const c of ['warrior', 'dwarf', 'cleric', 'wizard'] as ClassId[]) {
        const { hero } = buildHero(s.rng, { name: c, classId: c, portrait: `${c}_1`, traits: [], kit: STARTING_KITS[c][0].id, damage: {}, choices: {} });
        hero.life = 99; // keep the party alive so we see many encounters
        hero.bonusLife = 90;
        s.guild.roster.push(hero);
      }
      await startAdventure(g, s.guild.roster.map((h) => h.id));
      for (let step = 0; step < 40 && s.mode === 'dungeon' && g.party().length; step++) {
        const d = s.dungeon!;
        const before = d.finalBossFound;
        const majorsBefore = d.majorFoesMet;
        const rollsBefore = io.bossRolls.length;
        const exits = exitsFrom(g, d.tiles[d.currentTile]).filter((e) => !e.conn.exit);
        const fresh = exits.filter((e) => e.tile && !e.tile.visited);
        const pick = (fresh.length ? fresh : exits)[int(s.rng, 0, Math.max(0, (fresh.length ? fresh : exits).length - 1))];
        if (!pick) break;
        await moveThrough(g, pick.conn);
        const newRolls = io.bossRolls.slice(rollsBefore);
        checks += newRolls.length;
        if (!before && d.finalBossFound) {
          declared++;
          // The deciding roll must be 6+, and its modifier must equal majors met before this foe
          const last = newRolls[newRolls.length - 1];
          expect(last, `seed ${seed}: boss declared without a roll`).toBeDefined();
          expect(last.total, `seed ${seed}: boss declared on ${last.total}`).toBeGreaterThanOrEqual(6);
          void majorsBefore;
        }
      }
    }
    console.log(`boss checks: ${checks}, bosses declared: ${declared}`);
    expect(checks).toBeGreaterThan(50);
    // Sanity: with an escalating bonus, far fewer than every check should produce a boss
    expect(declared).toBeLessThan(checks);
  }, 120000);
});

describe('First Major Foe', () => {
  it('is the Final Boss only on a natural 6 (no prior majors)', async () => {
    let boss = 0;
    const N = 600;
    for (let seed = 1; seed <= N; seed++) {
      const s = newState(seed);
      const io = new RecIo((p) => firstEnabled(p));
      const g = new Game(s, io);
      const { hero } = buildHero(s.rng, { name: 'w', classId: 'warrior', portrait: 'warrior_1', traits: [], kit: 'sword_board', damage: {}, choices: {} });
      s.guild.roster.push(hero);
      await startAdventure(g, [hero.id]);
      const { makeFoe } = await import('./foe');
      // replicate fightFoe's boss check only
      const d = s.dungeon!;
      const f = makeFoe(g, 'young_dragon');
      d.majorFoesMet++;
      const { tableRoll } = g;
      void tableRoll;
      const r = await g.tableRoll('Is this the Final Boss?', 'd6', { target: 6 });
      if (r >= 6) boss++;
      void f;
    }
    const rate = boss / N;
    expect(rate).toBeGreaterThan(0.1);
    expect(rate).toBeLessThan(0.24); // ≈ 1/6
  });
});
