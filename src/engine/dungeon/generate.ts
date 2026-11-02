import type { Game } from '../game';
import type { Connector, Dungeon, Env, Region, Tile, TileContent } from '../types';
import { START_TILES, TILE_SHAPES, CAVE_TILES, type ShapeDef } from '../../data/tiles';
import { variants, translate, truncate, Grid, connOut } from './geometry';
import { d, d66 } from '../dice';
import { int, shuffle } from '../rng';

export const GRID_W = 20;
export const GRID_H = 28;
export const MAX_TILES = 70;

export function newDungeon(g: Game, adventureKey = 'random'): Dungeon {
  const dung: Dungeon = {
    regions: [], tiles: {}, currentTile: '', tilesEntered: 0, majorFoesMet: 0, finalBossFound: false, finalBossSlain: false,
    minorEncounters: 0, uniqueEvents: [], marchingOrder: [...g.s.party], restUsed: false, wanderingBonus: 0, adventureKey, keywords: [], noSurprise: [], saveBonusEnv: [],
  };
  g.s.dungeon = dung;
  const env: Env = adventureKey === 'witch' ? 'caverns' : 'dungeon';
  const region = addRegion(g, env);
  dung.currentTile = region.start;
  pregenerate(g, region.id);
  return dung;
}

export function addRegion(g: Game, env: Env, parent?: { tile: Tile; conn: Connector }): Region {
  const dung = g.s.dungeon!;
  const id = `r${dung.regions.length}`;
  const region: Region = { id, env, width: GRID_W, height: GRID_H, start: '', parentTile: parent?.tile.id };
  dung.regions.push(region);
  const grid = new Grid(GRID_W, GRID_H);
  // Starting tile: the room entrance is at the bottom edge
  const shape = parent ? TILE_SHAPES[rollShapeKey(g)] : dung.adventureKey === 'witch' ? CAVE_TILES[d(g.rng, 6) - 1] : START_TILES[d(g.rng, 6) - 1];
  const vs = variants(shape);
  let placed: Tile | undefined;
  for (const v of shuffle(g.rng, [...vs])) {
    const entry = parent ? v.conns[0] : v.conns.find((c) => c.entrance) ?? v.conns.find((c) => c.dy === 1) ?? v.conns[0];
    if (!entry) continue;
    if (!parent && !(entry.dy === 1)) continue;
    const ox = Math.floor(GRID_W / 2) - entry.x;
    const oy = GRID_H - 1 - entry.y;
    const t = translate(v, ox, oy);
    if (t.cells.every(([x, y]) => grid.free(x, y))) {
      placed = makeTile(g, region, shape, t, true);
      const ent = placed.connectors.find((c) => c.x === entry.x + ox && c.y === entry.y + oy && c.dx === entry.dx && c.dy === entry.dy);
      if (ent) {
        ent.exit = !parent;
        if (parent) {
          ent.to = parent.tile.id;
          ent.toConnector = parent.conn.id;
          parent.conn.to = placed.id;
          parent.conn.toConnector = ent.id;
        }
      }
      break;
    }
  }
  if (!placed) throw new Error('could not place start tile');
  placed.content = parent ? rollContent(g, placed) : { type: 'entrance' };
  region.start = placed.id;
  return region;
}

function rollShapeKey(g: Game): number {
  for (;;) {
    const k = d66(g.rng);
    if (TILE_SHAPES[k]) return k;
  }
}

let tileCounter = 0;
function makeTile(g: Game, region: Region, shape: ShapeDef, v: ReturnType<typeof translate>, start = false): Tile {
  const dung = g.s.dungeon!;
  const id = `t${Object.keys(dung.tiles).length}_${++tileCounter % 1000}`;
  const tile: Tile = {
    id, shapeId: shape.id, corridor: shape.corridor, env: region.env, region: region.id, cells: v.cells,
    connectors: v.conns.map((c, i) => ({ id: `${id}c${i}`, x: c.x, y: c.y, dx: c.dx, dy: c.dy, door: c.door && region.env === 'dungeon' })),
    content: { type: 'empty' }, explored: start, visited: false, searched: false, cleared: false, resolved: start, notes: [], index: Object.keys(dung.tiles).length,
  };
  dung.tiles[id] = tile;
  return tile;
}

/** Fill a region with tiles, breadth-first from its start, until no space remains. */
export function pregenerate(g: Game, regionId: string) {
  const dung = g.s.dungeon!;
  const region = dung.regions.find((r) => r.id === regionId)!;
  const tiles = () => Object.values(dung.tiles).filter((t) => t.region === regionId);
  const queue: [Tile, Connector][] = [];
  const start = dung.tiles[region.start];
  for (const c of start.connectors) if (!c.exit && !c.to) queue.push([start, c]);
  let guard = 0;
  while (queue.length && guard++ < 500) {
    const [from, conn] = queue.shift()!;
    if (conn.to || conn.deadEnd) continue;
    if (tiles().length >= MAX_TILES) {
      conn.deadEnd = true;
      continue;
    }
    const t = attachTile(g, region, from, conn);
    if (t) for (const c of t.connectors) if (!c.to && !c.deadEnd) queue.push([t, c]);
  }
  for (const [, c] of queue) if (!c.to) c.deadEnd = true;
}

/** Generate and attach a new tile at a connector (also used for secret doors). */
export function attachTile(g: Game, region: Region, from: Tile, conn: Connector, opts: { secret?: boolean; shapeKey?: number } = {}): Tile | undefined {
  const dung = g.s.dungeon!;
  const grid = Grid.from(Object.values(dung.tiles).filter((t) => t.region === region.id), region.width, region.height);
  const [tx, ty] = connOut(conn);
  if (!grid.inside(tx, ty)) {
    conn.deadEnd = true;
    return;
  }
  const occupant = grid.at(tx, ty);
  if (occupant) {
    // Opens into an existing tile: link both ways
    const other = dung.tiles[occupant];
    const back: Connector = { id: `${other.id}c${other.connectors.length}`, x: tx, y: ty, dx: -conn.dx, dy: -conn.dy, door: conn.door, to: from.id, toConnector: conn.id };
    other.connectors.push(back);
    conn.to = other.id;
    conn.toConnector = back.id;
    return;
  }
  const shape = dung.adventureKey === 'witch' ? CAVE_TILES[d(g.rng, 6) - 1] : TILE_SHAPES[opts.shapeKey ?? rollShapeKey(g)];
  const opts2: { v: ReturnType<typeof translate>; entry: number; full: boolean }[] = [];
  for (const v of variants(shape)) {
    v.conns.forEach((c, i) => {
      if (c.dx !== -conn.dx || c.dy !== -conn.dy) return;
      const t = translate(v, tx - c.x, ty - c.y);
      const full = t.cells.every(([x, y]) => grid.free(x, y));
      opts2.push({ v: t, entry: i, full });
    });
  }
  if (!opts2.length) {
    conn.deadEnd = true;
    return;
  }
  const fulls = opts2.filter((o) => o.full);
  let pick = fulls.length ? fulls[int(g.rng, 0, fulls.length - 1)] : undefined;
  if (!pick) {
    // truncate the best option
    const scored = opts2.map((o) => {
      const tr = truncate(o.v, grid, [tx, ty]);
      return { o, tr, n: tr.cells.length };
    }).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
    if (!scored.length) {
      conn.deadEnd = true;
      return;
    }
    const best = scored[0];
    // Ensure the entry connector survives truncation
    const entryConn = best.o.v.conns[best.o.entry];
    if (!best.tr.conns.some((c) => c.x === entryConn.x && c.y === entryConn.y && c.dx === entryConn.dx && c.dy === entryConn.dy)) best.tr.conns.push(entryConn);
    pick = { v: best.tr, entry: best.tr.conns.findIndex((c) => c.x === entryConn.x && c.y === entryConn.y && c.dx === entryConn.dx && c.dy === entryConn.dy), full: false };
  }
  const tile = makeTile(g, region, shape, pick.v);
  const entry = tile.connectors[pick.entry];
  entry.to = from.id;
  entry.toConnector = conn.id;
  entry.door = entry.door || conn.door;
  conn.to = tile.id;
  conn.toConnector = entry.id;
  if (opts.secret) tile.secret = true;
  tile.content = rollContent(g, tile);
  return tile;
}

/** Tile Content Table (2d6), pre-rolled at generation ("stocking" the dungeon). */
export function rollContent(g: Game, t: Tile): TileContent {
  const dung = g.s.dungeon!;
  const r = d(g.rng, 6) + d(g.rng, 6);
  t.notes.push(`content:${r}`);
  if (dung.adventureKey === 'witch') return witchContent(r);
  const c = t.corridor;
  switch (r) {
    case 2: return { type: 'treasure' };
    case 3: return { type: 'trap_treasure' };
    case 4: return c ? { type: 'empty' } : { type: 'special_event' };
    case 5: return { type: 'special_feature' };
    case 6: return { type: 'encounter', table: 'vermin' };
    case 7: return { type: 'encounter', table: 'minion' };
    case 8: return c ? { type: 'empty' } : { type: 'encounter', table: 'minion' };
    case 9: return { type: 'empty', clue: false };
    case 10: return c ? { type: 'empty' } : { type: 'encounter', table: 'weird' };
    case 11: return { type: 'encounter', table: 'boss' };
    default: return c ? { type: 'empty' } : { type: 'encounter', table: 'boss', dragon: true };
  }
}

function witchContent(r: number): TileContent {
  switch (r) {
    case 2: return { type: 'treasure' };
    case 3: return { type: 'trap_treasure' };
    case 4: return { type: 'special_event' };
    case 5: return { type: 'special_feature' };
    case 6: return { type: 'encounter', table: 'vermin' };
    case 7:
    case 8: return { type: 'encounter', table: 'minion' };
    case 10: return { type: 'encounter', table: 'weird' };
    case 11: return { type: 'encounter', table: 'boss' };
    default: return { type: 'empty', clue: true };
  }
}

export function contentRoll(t: Tile): number | undefined {
  const n = t.notes.find((x) => x.startsWith('content:'));
  return n ? Number(n.split(':')[1]) : undefined;
}

export function neighbors(dung: Dungeon, t: Tile): Tile[] {
  return t.connectors.filter((c) => c.to).map((c) => dung.tiles[c.to!]);
}
