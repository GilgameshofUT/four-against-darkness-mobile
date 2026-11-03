<script lang="ts">
  import { ui } from '../store.svelte';
  import type { Tile, Connector } from '../../engine/types';
  import { GRID_W, GRID_H } from '../../engine/dungeon/generate';
  import { haptic } from '../fx';

  let { regionId, onExit }: { regionId: string; onExit: (c: Connector) => void } = $props();
  const CELL = 22;
  const d = $derived((void ui.version, { ...ui.s.dungeon! }));
  const tiles = $derived((void ui.version, Object.values(d.tiles).filter((t) => t.region === regionId).map((t) => ({ ...t }))));
  const region = $derived(d.regions.find((r) => r.id === regionId)!);
  const current = $derived((void ui.version, { ...d.tiles[d.currentTile] }));
  const tex = $derived(region.env === 'caverns' ? 'cavern_floor' : region.env === 'fungal' ? 'fungal_floor' : 'dungeon_floor');
  const corrTex = $derived(region.env === 'dungeon' ? 'dungeon_corridor' : tex);

  /** Tiles adjacent to explored ones are "hinted": door markers only. */
  const exitsHere = $derived((void ui.version, current) && current.region === regionId ? current.connectors.filter((c) => (c.to || c.exit) && !c.blocked) : []);

  function visible(t: Tile) {
    return t.explored || t.visited;
  }
  function cellPath(t: Tile) {
    return t.cells.map(([x, y]) => `M${x * CELL},${y * CELL}h${CELL}v${CELL}h-${CELL}z`).join('');
  }
  function outline(t: Tile) {
    // Edges of cells that border non-tile cells
    const set = new Set(t.cells.map(([x, y]) => `${x},${y}`));
    let p = '';
    for (const [x, y] of t.cells) {
      const X = x * CELL, Y = y * CELL;
      if (!set.has(`${x},${y - 1}`)) p += `M${X},${Y}h${CELL}`;
      if (!set.has(`${x},${y + 1}`)) p += `M${X},${Y + CELL}h${CELL}`;
      if (!set.has(`${x - 1},${y}`)) p += `M${X},${Y}v${CELL}`;
      if (!set.has(`${x + 1},${y}`)) p += `M${X + CELL},${Y}v${CELL}`;
    }
    return p;
  }
  function center(t: Tile) {
    const xs = t.cells.map((c) => c[0]), ys = t.cells.map((c) => c[1]);
    // pick the cell closest to the centroid
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length, cy = ys.reduce((a, b) => a + b, 0) / ys.length;
    const best = t.cells.reduce((b, c) => (Math.hypot(c[0] - cx, c[1] - cy) < Math.hypot(b[0] - cx, b[1] - cy) ? c : b));
    return [best[0] * CELL + CELL / 2, best[1] * CELL + CELL / 2];
  }
  function connPos(c: Connector) {
    return [c.x * CELL + CELL / 2 + (c.dx * CELL) / 2, c.y * CELL + CELL / 2 + (c.dy * CELL) / 2];
  }
  function icon(t: Tile): string {
    if (t.content.type === 'entrance') return '⌂';
    if (!t.visited) return t.notes.includes('peeked') ? '?' : '';
    if (t.foes?.some((f) => (f.category === 'vermin' || f.category === 'minion' ? f.count > 0 : f.life > 0) && !f.fled)) return t.foeAttitude === 'hostile' ? '⚔' : '☺';
    if (t.feature === 'fountain') return '⛲';
    if (t.feature === 'shrine') return '✚';
    if (t.feature === 'cursed_altar') return '☠';
    if (t.feature === 'water_pool') return '≈';
    if (t.notes.some((n) => n.startsWith('passage'))) return '⇣';
    if (t.notes.includes('safe_exit')) return '⌂';
    if (t.searched) return 'S';
    return '';
  }
  let svg: SVGSVGElement;
  let whole = $state(false);
  let boxW = $state(400);
  let boxH = $state(600);
  /** Zoom to the explored area (plus margin), matching the container's aspect ratio. */
  const view = $derived.by(() => {
    void ui.version;
    const fullW = GRID_W * CELL, fullH = GRID_H * CELL;
    if (whole) return { x: -6, y: -6, w: fullW + 12, h: fullH + 12 };
    const cells = tiles.filter(visible).flatMap((t) => t.cells);
    if (!cells.length) return { x: -6, y: -6, w: fullW + 12, h: fullH + 12 };
    let x0 = Math.min(...cells.map((c) => c[0])) - 2, x1 = Math.max(...cells.map((c) => c[0])) + 3;
    let y0 = Math.min(...cells.map((c) => c[1])) - 2, y1 = Math.max(...cells.map((c) => c[1])) + 3;
    // minimum zoom window so a single room isn't absurdly huge
    const minW = 9;
    if (x1 - x0 < minW) { const c = (x0 + x1) / 2; x0 = c - minW / 2; x1 = c + minW / 2; }
    let w = (x1 - x0) * CELL, h = (y1 - y0) * CELL;
    const aspect = boxW / Math.max(1, boxH);
    if (w / h < aspect) { const nw = h * aspect; x0 -= (nw - w) / 2 / CELL; w = nw; }
    else { const nh = w / aspect; y0 -= (nh - h) / 2 / CELL; h = nh; }
    // keep the window inside the level where possible (no void below the bottom edge)
    let vx = x0 * CELL, vy = y0 * CELL;
    if (h <= fullH + 40) vy = Math.min(Math.max(vy, -6), fullH + 34 - h);
    if (w <= fullW + 12) vx = Math.min(Math.max(vx, -6), fullW + 6 - w);
    return { x: vx, y: vy, w, h };
  });
  let scroller: HTMLDivElement;
  $effect(() => {
    if (!scroller) return;
    const ro = new ResizeObserver(() => { boxW = scroller.clientWidth; boxH = scroller.clientHeight; });
    ro.observe(scroller);
    return () => ro.disconnect();
  });
  const k = $derived(Math.min(1, Math.max(0.4, view.w / (17 * CELL))));
  function tapExit(c: Connector) {
    if (ui.busy || ui.pending) return;
    haptic(10);
    onExit(c);
  }
</script>

<div class="map" bind:this={scroller}>
  <button class="zoom" onclick={() => (whole = !whole)}>{whole ? '⌖ Zoom in' : '▣ Whole level'}</button>
  <svg bind:this={svg} viewBox="{view.x} {view.y} {view.w} {view.h}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" class:anim={true}>
    <defs>
      <pattern id="floor-{regionId}" patternUnits="userSpaceOnUse" width="132" height="132"><image href="./art/textures/{tex}.webp" width="132" height="132" /></pattern>
      <pattern id="corr-{regionId}" patternUnits="userSpaceOnUse" width="110" height="110"><image href="./art/textures/{corrTex}.webp" width="110" height="110" /></pattern>
      <filter id="glow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      <radialGradient id="lamp"><stop offset="0" stop-color="#ffd98a" stop-opacity=".55" /><stop offset="1" stop-color="#ffd98a" stop-opacity="0" /></radialGradient>
    </defs>
    <rect x="-2000" y="-2000" width="5000" height="5000" fill="#0e0c09" />
    <!-- faint grid -->
    {#each Array(GRID_W + 1) as _, i}<line x1={i * CELL} y1="0" x2={i * CELL} y2={GRID_H * CELL} stroke="#2a241b" stroke-width="0.5" />{/each}
    {#each Array(GRID_H + 1) as _, i}<line x1="0" y1={i * CELL} x2={GRID_W * CELL} y2={i * CELL} stroke="#2a241b" stroke-width="0.5" />{/each}

    {#each tiles.filter(visible) as t (t.id)}
      <g class="tile" class:visited={t.visited} class:current={t.id === d.currentTile}>
        <path d={cellPath(t)} fill="url(#{t.corridor ? 'corr' : 'floor'}-{regionId})" opacity={t.visited ? 1 : 0.45} />
        <path d={cellPath(t)} fill="none" stroke="rgba(0,0,0,.25)" stroke-width="0.6" />
        <path d={outline(t)} stroke={t.id === d.currentTile ? '#d9b66a' : '#1f1a12'} stroke-width={t.id === d.currentTile ? 3 : 2.4} fill="none" stroke-linecap="square" />
        {#if !t.visited}<path d={cellPath(t)} fill="#0e0c09" opacity="0.45" />{/if}
        {#if icon(t)}{@const [cx, cy] = center(t)}<text x={cx} y={cy + 5 * k} text-anchor="middle" class="ico" style="font-size:{13 * k}px">{icon(t)}</text>{/if}
      </g>
    {/each}

    <!-- connectors of visited tiles (doors / openings) -->
    {#each tiles.filter((t) => t.visited) as t}
      {#each t.connectors.filter((c) => c.to || c.exit || c.deadEnd) as c}
        {@const [px, py] = connPos(c)}
        {#if c.door}
          <rect x={px - (c.dx ? 3 : 7)} y={py - (c.dy ? 3 : 7)} width={c.dx ? 6 : 14} height={c.dy ? 6 : 14} rx="1.5" fill={c.doorState?.open || c.doorState?.destroyed ? '#6b4a2b' : '#8a5a2e'} stroke="#2a1a0c" stroke-width="1.2" />
        {:else if c.deadEnd}
          <rect x={px - (c.dx ? 1.5 : 6)} y={py - (c.dy ? 1.5 : 6)} width={c.dx ? 3 : 12} height={c.dy ? 3 : 12} fill="#1f1a12" />
        {/if}
      {/each}
    {/each}

    <!-- party token & light -->
    {#if current && current.region === regionId}
      {@const [cx, cy] = center(current)}
      <circle cx={cx} cy={cy} r="70" fill="url(#lamp)" pointer-events="none" />
      <g class="token" transform="translate({cx},{cy})">
        <circle r={9 * k} fill="#1f4b48" stroke="#d9b66a" stroke-width={2.5 * k} />
        <text y={4 * k} text-anchor="middle" class="tok" style="font-size:{11 * k}px">4</text>
      </g>
    {/if}

    <!-- tappable exits from the current tile -->
    {#each exitsHere as c (c.id)}
      {@const [px, py] = connPos(c)}
      {@const target = c.to ? d.tiles[c.to] : undefined}
      <g class="exit" role="button" tabindex="0" onclick={() => tapExit(c)} onkeydown={(e) => e.key === 'Enter' && tapExit(c)}>
        <circle cx={px + c.dx * 9 * k} cy={py + c.dy * 9 * k} r={14 * k} class="hit" />
        <circle cx={px + c.dx * 9 * k} cy={py + c.dy * 9 * k} r={9 * k} class="ring" class:unknown={!target?.visited} class:out={c.exit} filter="url(#glow)" />
        <text x={px + c.dx * 9 * k} y={py + c.dy * 9 * k + 4 * k} text-anchor="middle" class="arrow" style="font-size:{10 * k}px">{c.exit ? '⌂' : c.dy < 0 ? '▲' : c.dy > 0 ? '▼' : c.dx > 0 ? '▶' : '◀'}</text>
      </g>
    {/each}
  </svg>
</div>

<style>
  .map { width: 100%; height: 100%; overflow: hidden; background: #0e0c09; position: relative; }
  svg { display: block; touch-action: manipulation; }
  .zoom { position: absolute; right: 0.5rem; top: 0.5rem; z-index: 2; border: 1px solid var(--brass); background: rgba(21,18,14,.8); color: var(--parch); border-radius: 0.5rem; padding: 0.35rem 0.7rem; font-family: var(--font-head); font-size: 0.85rem; min-height: 2.4rem; }
  .ico { font-size: 13px; fill: #f0e2c0; font-family: var(--font-head); paint-order: stroke; stroke: #000; stroke-width: 2.5px; pointer-events: none; }
  .tok { font-size: 11px; fill: #efe2c4; font-family: var(--font-head); font-weight: 700; }
  .token { transition: transform 0.45s ease; }
  .exit { cursor: pointer; }
  .exit .hit { fill: transparent; }
  .exit .ring { fill: #2d6560; stroke: #d9b66a; stroke-width: 2; animation: pulse 1.6s infinite; }
  .exit .ring.unknown { fill: #7d2b22; }
  .exit .ring.out { fill: #b4893c; }
  .exit .arrow { fill: #efe2c4; font-size: 11px; pointer-events: none; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
</style>
