<script lang="ts">
  import { ui } from '../store.svelte';
  import DungeonMap from '../components/DungeonMap.svelte';
  import PartyStrip from '../components/PartyStrip.svelte';
  import CombatView from '../components/CombatView.svelte';
  import LogPanel from '../components/LogPanel.svelte';
  import { moveThrough, tileActions } from '../../engine/dungeon/explore';
  import { search, waterPool } from '../../engine/dungeon/features';
  import { rest, canRest } from '../../engine/dungeon/rest';
  import { revealSecret } from '../../engine/secrets';
  import { manageMarching, manageInventory, takeWeapons } from '../../engine/dungeon/manage';
  import { armoryPick } from '../../engine/dungeon/shopevents';
  import { questCanTurnIn, turnInQuest } from '../../engine/dungeon/quest';
  import { endAdventure } from '../../engine/campaign';
  import type { Connector } from '../../engine/types';
  import { hasLight } from '../../engine/effects';
  import { exitsFrom } from '../../engine/dungeon/explore';
  import { directionName } from '../../engine/dungeon/features';

  // Fresh identity per bump: the engine mutates the dungeon in place and a
  // derived returning the identical reference never propagates downstream.
  const d = $derived((void ui.version, ui.s.dungeon ? { ...ui.s.dungeon } : undefined));
  const tile = $derived((void ui.version, d ? d.tiles[d.currentTile] : undefined));
  let viewRegion = $state<string | null>(null);
  const region = $derived(viewRegion ?? tile?.region ?? 'r0');
  const actions = $derived(d && !ui.s.combat ? (void ui.version, tileActions(ui.game)) : []);
  const envName = $derived(tile?.env === 'caverns' ? 'Caverns' : tile?.env === 'fungal' ? 'Fungal Grottoes' : 'Dungeon');
  const allDead = $derived(ui.s.party.length > 0 && ui.s.party.every((id) => ui.s.guild.roster.find((h) => h.id === id)?.status !== 'ok'));
  const exits = $derived(tile && !ui.s.combat ? (void ui.version, labelExits(exitsFrom(ui.game, tile))) : []);
  function labelExits(list: ReturnType<typeof exitsFrom>) {
    return list.map((e) => {
      const dir = e.conn.exit ? 'Leave' : directionName(e.conn.dx, e.conn.dy);
      const same = list.filter((o) => !o.conn.exit && o.conn.dx === e.conn.dx && o.conn.dy === e.conn.dy);
      let sub = '';
      if (same.length > 1 && !e.conn.exit) {
        const horiz = e.conn.dy !== 0;
        const sorted = [...same].sort((a, b) => (horiz ? a.conn.x - b.conn.x : a.conn.y - b.conn.y));
        const i = sorted.indexOf(e);
        const names = horiz ? ['left', 'center', 'right'] : ['upper', 'middle', 'lower'];
        sub = sorted.length === 2 ? names[i === 0 ? 0 : 2] : names[Math.min(2, i)] ?? String(i + 1);
      }
      return { ...e, label: `${dir}${sub ? ' · ' + sub : ''}`, hint: e.conn.exit || e.tile?.visited ? '' : e.conn.door ? 'door' : '' };
    });
  }
  const showQuest = $derived(d ? (void ui.version, questCanTurnIn(ui.game)) : false);
  let lastTile = '';


  $effect(() => {
    if (allDead && !ui.busy && d) ui.run((g) => endAdventure(g, 'wipe'));
  });
  $effect(() => {
    // Snap the map back to the party when they move
    if (tile && tile.id !== lastTile) {
      lastTile = tile.id;
      viewRegion = null;
    }
  });

  function exit(c: Connector) {
    ui.run((g) => moveThrough(g, c));
  }
  function act(id: string) {
    const t = tile!;
    ui.run(async (g) => {
      if (id === 'search') await search(g, t);
      if (id === 'pool') await waterPool(g, t);
      if (id === 'rest') {
        const block = canRest(g);
        if (block) await g.say('Cannot rest here', block);
        else if (await g.yesNo('Rest now?', 'You can rest only once per adventure. Each hero recovers 1 Life or 1 spent ability. 1-in-6 chance of wandering monsters.', 'Rest', 'Not yet')) await rest(g);
      }
      if (id === 'secret') await revealSecret(g);
      if (id === 'marching') await manageMarching(g);
      if (id === 'inventory') await manageInventory(g);
      if (id === 'armory') await armoryPick(g);
      if (id === 'weapons') await takeWeapons(g);
      if (id === 'kerrak') {
        g.s.clues--;
        g.s.dungeon!.keywords = g.s.dungeon!.keywords.filter((k) => k !== 'kerrak_dar');
        g.addGold(500, 'Gold of Kerrak Dar');
      }
      if (id === 'quest') await turnInQuest(g);
      if (id === 'abandon') {
        if (await g.yesNo('Abandon the adventure?', 'The party escapes with what it carries. The fallen are left behind.', 'Abandon', 'Keep going')) await endAdventure(g, 'retreat');
      }
    });
  }
</script>

{#if d && tile}
  <div class="dungeon">
    <div class="topbar">
      <button class="iconbtn" onclick={() => (ui.showMenu = !ui.showMenu)} aria-label="Menu">☰</button>
      <div class="ttl">
        <div class="env">{envName}{d.adventureKey === 'witch' ? " · Milethia's Cave" : ''}</div>
        <div class="tiny stats">
          <span>💰 {ui.s.partyGold}</span>
          <span>👁 {ui.s.clues}</span>
          <span>⚔ {d.majorFoesMet} major</span>
          <span>🗺 {d.tilesEntered}</span>
          {#if d.finalBossSlain}<span class="pill gold">Boss slain!</span>{/if}
          {#if !hasLight(ui.game)}<span class="pill red">Darkness</span>{/if}
        </div>
      </div>
      <button class="iconbtn" onclick={() => act('inventory')} aria-label="Packs" disabled={!!ui.s.combat} title={ui.s.combat ? 'Packs are unavailable mid-combat' : 'Packs'}>🎒</button>
      <button class="iconbtn" onclick={() => act('marching')} aria-label="Marching order" disabled={!!ui.s.combat} title={ui.s.combat ? 'Marching order cannot change mid-combat' : 'Marching order'}>⇅</button>
      <button class="iconbtn" onclick={() => (ui.showLog = !ui.showLog)} aria-label="Log">📜</button>
    </div>

    {#if d.regions.length > 1}
      <div class="regions">
        {#each d.regions as r}
          <button class="pill" class:teal={r.id === region} onclick={() => (viewRegion = r.id)}>{r.env === 'dungeon' ? 'Dungeon' : r.env === 'caverns' ? 'Caverns' : 'Grottoes'}</button>
        {/each}
      </div>
    {/if}

    <div class="stage">
      {#if ui.s.combat}
        <CombatView />
      {:else}
        <DungeonMap regionId={region} onExit={exit} />
      {/if}
    </div>

    {#if d.quest && !d.quest.rewarded}
      <div class="quest tiny">📜 Quest: {d.quest.label}{d.quest.id === 5 ? ` (${d.quest.progress}/3)` : ''}</div>
    {/if}

    <div class="bottom">
      <PartyStrip />
      {#if !ui.s.combat}
        <div class="exits">
          {#each exits as e (e.conn.id)}
            <button class="exit-btn" class:new={e.tile && !e.tile.visited} class:out={e.conn.exit} disabled={ui.busy} onclick={() => exit(e.conn)}>
              <span class="arr">{e.conn.exit ? '⌂' : e.conn.dy < 0 ? '▲' : e.conn.dy > 0 ? '▼' : e.conn.dx > 0 ? '▶' : '◀'}</span>
              <span class="lbl">{e.label}{#if e.hint}<small>&nbsp;{e.hint}</small>{/if}</span>
            </button>
          {/each}
        </div>
        <div class="acts">
          {#if showQuest}<button class="btn good small" onclick={() => act('quest')}>Complete quest</button>{/if}
          {#each actions.filter((a) => a.id !== 'marching' && a.id !== 'inventory') as a}
            <button class="btn small" class:primary={a.id === 'search'} disabled={!!a.disabled || ui.busy} title={typeof a.disabled === 'string' ? a.disabled : a.desc} onclick={() => act(a.id)}>{a.label}</button>
          {/each}
          
        </div>

      {/if}
    </div>
    {#if ui.showLog}<LogPanel />{/if}
    {#if ui.showMenu}
      <div class="menu-bg" role="presentation" onclick={() => (ui.showMenu = false)}>
        <div class="panel menu" role="presentation" onclick={(e) => e.stopPropagation()}>
          <button class="btn block" onclick={() => ((ui.showMenu = false), (ui.screen = 'title'))}>Title screen (progress is saved)</button>
          <button class="btn block" onclick={() => ((ui.showMenu = false), (ui.showSettings = true))}>Settings</button>
          <button class="btn danger block" disabled={!!ui.s.combat} title={ui.s.combat ? 'Finish the fight before abandoning the adventure' : 'Abandon the adventure'} onclick={() => ((ui.showMenu = false), act('abandon'))}>Abandon adventure</button>
          {#if ui.s.combat}<div class="tiny muted center">Abandon is unavailable mid-combat.</div>{/if}
          <button class="btn quiet block" onclick={() => (ui.showMenu = false)}>Close</button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .dungeon { position: absolute; inset: 0; display: flex; flex-direction: column; background: #0e0c09; }
  .topbar { display: flex; align-items: center; gap: 0.471rem; padding: calc(0.353rem + var(--safe-t)) 8px 6px; background: linear-gradient(180deg, var(--teal), #163634); color: var(--parch); border-bottom: 2px solid var(--brass); }
  .iconbtn[disabled] { opacity: .4; }
  .iconbtn { width: 2.588rem; height: 2.588rem; border-radius: 8px; border: 1px solid var(--brass); background: rgba(0, 0, 0, 0.2); color: var(--parch); font-size: 1.2rem; }
  .ttl { flex: 1; min-width: 0; }
  .env { font-family: var(--font-head); font-size: 1.1rem; }
  .stats { display: flex; gap: 0.588rem; flex-wrap: wrap; opacity: 0.9; }
  .regions { display: flex; gap: 0.353rem; padding: 4px 8px; background: #15120e; }
  .stage { flex: 1; position: relative; min-height: 0; }
  .center { text-align: center; }
  .quest { background: var(--brass); color: var(--night); padding: 3px 10px; }
  .bottom { background: linear-gradient(180deg, #2a2218, #1a1510); border-top: 2px solid var(--brass); padding-bottom: calc(0.353rem + var(--safe-b)); }
  .acts { display: flex; gap: 0.353rem; padding: 2px 8px 4px; flex-wrap: wrap; justify-content: center; }
  .acts .btn { flex: 1 1 auto; white-space: nowrap; min-height: 2.471rem; }
  .hint { color: rgba(239, 226, 196, 0.6); text-align: center; padding: 0 0.471rem 2px; }
  .hint .red { color: #d06a5c; }
.menu-bg { position: absolute; inset: 0; z-index: 70; background: rgba(0,0,0,.5); display: flex; align-items: flex-start; padding: calc(3.529rem + var(--safe-t)) 10px; }
  .menu { width: 100%; display: flex; flex-direction: column; gap: 0.471rem; }
.exits { display: flex; flex-wrap: wrap; gap: 0.353rem; padding: 2px 8px 4px; }
  .exit-btn .lbl { line-height: 1.05; }
  .exit-btn small { opacity: .75; font-size: .75rem; }
  .exit-btn { flex: 1 1 30%; min-height: 2.588rem; display: flex; align-items: center; justify-content: center; gap: 0.353rem; border-radius: 8px; border: 2px solid var(--brass); background: linear-gradient(180deg, var(--teal-3), var(--teal)); color: var(--parch); font-family: var(--font-head); text-transform: capitalize; font-size: .95rem; }
  .exit-btn.new { background: linear-gradient(180deg, var(--oxblood-2), var(--oxblood)); }
  .exit-btn.out { background: linear-gradient(180deg, var(--brass-2), var(--brass)); color: var(--night); }
  .exit-btn:active { transform: translateY(2px); }
  .arr { font-size: .8rem; }
</style>
