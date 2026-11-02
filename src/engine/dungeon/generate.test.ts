import { describe, it, expect } from 'vitest';
import { newDungeon, GRID_W, GRID_H } from './generate';
import { Game } from '../game';
import { ScriptIo } from '../io';
import { newState } from '../state';

function ascii(g: Game) {
  const d = g.s.dungeon!;
  const grid = Array.from({ length: GRID_H }, () => Array(GRID_W).fill('.'));
  for (const t of Object.values(d.tiles)) {
    if (t.region !== 'r0') continue;
    const ch = t.corridor ? '=' : String.fromCharCode(65 + (t.index % 26));
    for (const [x, y] of t.cells) grid[y][x] = ch;
  }
  return grid.map((r) => r.join('')).join('\n');
}

describe('dungeon generation', () => {
  it('fills the grid with connected tiles', () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = newState(seed);
      s.party = [];
      const g = new Game(s, new ScriptIo());
      const d = newDungeon(g);
      const tiles = Object.values(d.tiles);
      expect(tiles.length).toBeGreaterThan(8);
      // no overlaps
      const seen = new Set<string>();
      for (const t of tiles) for (const [x, y] of t.cells) {
        const k = `${x},${y}`;
        expect(seen.has(k)).toBe(false);
        seen.add(k);
        expect(x >= 0 && y >= 0 && x < GRID_W && y < GRID_H).toBe(true);
      }
      // reachability from start
      const reach = new Set([d.currentTile]);
      const q = [d.currentTile];
      while (q.length) for (const c of d.tiles[q.shift()!].connectors) if (c.to && !reach.has(c.to)) (reach.add(c.to), q.push(c.to));
      expect(reach.size).toBe(tiles.length);
      if (seed === 3) console.log(`${tiles.length} tiles\n` + ascii(g));
    }
  });
});
