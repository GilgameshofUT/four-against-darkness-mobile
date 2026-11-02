import type { ShapeDef, Side } from '../../data/tiles';
import type { Connector, Tile } from '../types';

export const DIRS: Record<Side, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

export interface Variant {
  cells: [number, number][];
  conns: { x: number; y: number; dx: number; dy: number; door: boolean; entrance: boolean }[];
}

function baseVariant(s: ShapeDef): Variant {
  const cells: [number, number][] = [];
  s.rows.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && cells.push([x, y])));
  const conns = s.conns.map((c) => {
    const [dx, dy] = DIRS[c[2]];
    return { x: c[0], y: c[1], dx, dy, door: c[3], entrance: c[4] === 'X' };
  });
  return { cells, conns };
}

function rot(v: Variant): Variant {
  // rotate 90° clockwise: (x,y) -> (-y, x)
  return {
    cells: v.cells.map(([x, y]) => [-y, x] as [number, number]),
    conns: v.conns.map((c) => ({ ...c, x: -c.y, y: c.x, dx: -c.dy, dy: c.dx })),
  };
}
function mirror(v: Variant): Variant {
  return { cells: v.cells.map(([x, y]) => [-x, y] as [number, number]), conns: v.conns.map((c) => ({ ...c, x: -c.x, dx: -c.dx })) };
}

export function variants(s: ShapeDef): Variant[] {
  const out: Variant[] = [];
  let v = baseVariant(s);
  for (let m = 0; m < 2; m++) {
    for (let r = 0; r < 4; r++) {
      out.push(v);
      v = rot(v);
    }
    v = mirror(baseVariant(s));
  }
  return out;
}

export function translate(v: Variant, ox: number, oy: number): Variant {
  return { cells: v.cells.map(([x, y]) => [x + ox, y + oy]), conns: v.conns.map((c) => ({ ...c, x: c.x + ox, y: c.y + oy })) };
}

export class Grid {
  occ: (string | undefined)[][];
  constructor(public w: number, public h: number) {
    this.occ = Array.from({ length: h }, () => Array<string | undefined>(w).fill(undefined));
  }
  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  free(x: number, y: number) {
    return this.inside(x, y) && !this.occ[y][x];
  }
  at(x: number, y: number) {
    return this.inside(x, y) ? this.occ[y][x] : undefined;
  }
  mark(tile: Tile) {
    for (const [x, y] of tile.cells) this.occ[y][x] = tile.id;
  }
  static from(tiles: Tile[], w: number, h: number) {
    const g = new Grid(w, h);
    for (const t of tiles) g.mark(t);
    return g;
  }
}

/** Keep only free cells connected (4-way) to the anchor cell. */
export function truncate(v: Variant, grid: Grid, anchor: [number, number]): Variant {
  const set = new Set(v.cells.filter(([x, y]) => grid.free(x, y)).map(([x, y]) => `${x},${y}`));
  const key = `${anchor[0]},${anchor[1]}`;
  if (!set.has(key)) return { cells: [], conns: [] };
  const keep = new Set<string>([key]);
  const stack = [anchor];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    for (const [dx, dy] of Object.values(DIRS)) {
      const k = `${x + dx},${y + dy}`;
      if (set.has(k) && !keep.has(k)) {
        keep.add(k);
        stack.push([x + dx, y + dy]);
      }
    }
  }
  return {
    cells: v.cells.filter(([x, y]) => keep.has(`${x},${y}`)),
    conns: v.conns.filter((c) => keep.has(`${c.x},${c.y}`)),
  };
}

export function connOut(c: Connector | Variant['conns'][number]): [number, number] {
  return [c.x + c.dx, c.y + c.dy];
}
