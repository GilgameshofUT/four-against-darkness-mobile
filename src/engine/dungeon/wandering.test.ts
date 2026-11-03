import { describe, it, expect } from 'vitest';
import { foeTable } from '../../data/foes';
import { tableEntryNames } from './wandering';
import { Game } from '../game';
import { ScriptIo, type RollPrompt } from '../io';
import type { RollResult } from '../dice';
import { newState } from '../state';

class CapIo extends ScriptIo {
  last: RollResult | null = null;
  override async roll(_p?: RollPrompt, r?: RollResult) {
    if (r) this.last = r;
  }
}

describe('foe table display alignment', () => {
  it('dungeon minions: 6 book entries, roll r matches the named foe', () => {
    const names = tableEntryNames('dungeon', 'minion', false);
    expect(names).toEqual([
      '1 Skeletons (1-3) or Zombies (4-6)',
      '2 Goblins',
      '3 Hobgoblins',
      '4 Orcs',
      '5 Trolls',
      '6 Mushroom Men',
    ]);
    const table = foeTable('dungeon', 'minion', false);
    // rollFoe picks table[r] for r >= 2; the name shown for slot r must be that foe
    for (let r = 2; r <= 6; r++) expect(names[r - 1]).toContain(table[r].name);
  });

  it('all other tables: slot i names table[i-1]', () => {
    for (const env of ['dungeon', 'caverns', 'fungal'] as const)
      for (const cat of ['vermin', 'minion', 'weird', 'boss'] as const) {
        if (env === 'dungeon' && cat === 'minion') continue;
        const table = foeTable(env, cat, false);
        expect(table).toHaveLength(6);
        expect(tableEntryNames(env, cat, false)).toEqual(table.map((f, i) => `${i + 1} ${f.name}`));
      }
    const ftable = foeTable('dungeon', 'minion', true);
    expect(tableEntryNames('dungeon', 'minion', true)).toEqual(ftable.map((f, i) => `${i + 1} ${f.name}`));
  });
});

describe('table rolls never display as explosions', () => {
  it('2d6 and d66 lookups have exploded=false', async () => {
    const io = new CapIo();
    const g = new Game(newState(42), io);
    const total = await g.tableRoll('Doors', '2d6', { context: 'test' });
    expect(total).toBeGreaterThanOrEqual(2);
    expect(total).toBeLessThanOrEqual(12);
    expect(io.last).not.toBeNull();
    expect(io.last!.faces).toHaveLength(2);
    expect(io.last!.exploded).toBe(false);
    await g.d66Roll('d66 test');
    expect(io.last!.faces).toHaveLength(2);
    expect(io.last!.exploded).toBe(false);
  });
});
