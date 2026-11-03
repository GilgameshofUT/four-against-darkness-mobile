<script lang="ts">
  import { ui, art } from '../store.svelte';
  import { FOES } from '../../data/foes';
  import { foeAlive, isMinor } from '../../engine/foe';
import { combatFoes } from '../store.svelte';
  const c = $derived((void ui.version, ui.s.combat!));
  const left = $derived(combatFoes());
  const env = $derived(ui.s.dungeon?.tiles[ui.s.dungeon.currentTile]?.env ?? 'dungeon');
  const bg = $derived(c.corridor ? 'combat_bg_corridor' : env === 'caverns' ? 'combat_bg_cavern' : env === 'fungal' ? 'combat_bg_fungal' : 'combat_bg_dungeon');
</script>

<div class="combat" style="background-image: url({art(`scenes/${bg}`)})">
  <div class="shade"></div>
  <div class="hdr row">
    <span class="pill teal">Round {c.turn}</span>
    {#if left}<span class="pill gold">⚔ {left.bodies} foe{left.bodies === 1 ? '' : 's'} left{#if left.groups > 1} · {left.groups} groups{/if}{#if left.slain > 0} · {left.slain} slain{/if}</span>{/if}
    {#if c.corridor}<span class="pill">Corridor: front 2 fight</span>{/if}
    {#if c.ambush && c.turn === 1}<span class="pill red">Ambush!</span>{/if}
    {#if c.partySurprise && c.turn === 1}<span class="pill gold">You surprised them</span>{/if}
  </div>
  <div class="foes">
    {#each c.foes.filter(foeAlive) as f (f.uid)}
      {@const def = FOES[f.defId]}
      <div class="foe" class:boss={f.finalBoss}>
        <img src={art(`monsters/${def.art ?? f.defId}`)} alt="" />
        <div class="fi">
          <div class="fname">{isMinor(f) ? `${f.count} × ` : ''}{f.name}</div>
          {#if f.finalBoss}<div class="boss-tag">👑 Final Boss · +1 Life, +1 attack, fights to the death</div>{/if}
          <div class="row tiny">
            <span class="pill teal">L{f.level}{f.levelMods.length ? `→${Math.max(1, f.level + f.levelMods.reduce((a, m) => a + m.value, 0))}` : ''}</span>
            {#if !isMinor(f)}<span class="pill red">♥ {f.life}/{f.maxLife}</span><span class="pill">{f.attacks} atk{f.damage > 1 ? ` · ${f.damage} dmg` : ''}</span>{/if}
            {#if f.state.held}<span class="pill gold">Held</span>{/if}
            {#if f.state.webbed}<span class="pill">Webbed</span>{/if}
          </div>
          {#if !isMinor(f)}<div class="lifebar"><i style="width:{(100 * f.life) / f.maxLife}%"></i></div>{/if}
          <div class="tiny desc">{def.desc}</div>
        </div>
      </div>
    {/each}
    {#each c.allies.filter((a) => a.life > 0) as a}
      <div class="foe ally"><div class="fi"><div class="fname">🐻 {a.name} (L{a.level}, ♥{a.life})</div></div></div>
    {/each}
  </div>
</div>

<style>
  .combat { position: absolute; inset: 0; background-size: cover; background-position: center; display: flex; flex-direction: column; padding: calc(0.471rem + var(--safe-t)) 8px 8px; overflow-y: auto; }
  .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(10, 8, 6, 0.55), rgba(10, 8, 6, 0.25) 40%, rgba(10, 8, 6, 0.7)); }
  .hdr, .foes { position: relative; }
  .hdr { flex-wrap: wrap; gap: 0.353rem; }
  .foes { display: flex; flex-direction: column; gap: 0.471rem; margin-top: 8px; }
  .foe { display: flex; gap: 0.588rem; background: rgba(239, 226, 196, 0.92); border: 2px solid var(--oxblood); border-radius: 10px; padding: 0.353rem; box-shadow: var(--shadow); animation: slideUp 0.25s; }
  .foe.boss { border-color: var(--brass); box-shadow: 0 0 18px rgba(217, 182, 106, 0.7); }
  .foe.ally { border-color: var(--teal); }
  .foe img { width: 6.588rem; height: 6.588rem; object-fit: cover; border-radius: 8px; flex: none; background: var(--parch-2); }
  .fi { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .fname { font-family: var(--font-head); font-size: 1.1rem; color: var(--oxblood); }
  .desc { color: var(--ink-soft); }
  .boss-tag { font-family: var(--font-head); font-size: 0.85rem; color: var(--parch); background: var(--oxblood); border-radius: 0.35rem; padding: 0.1rem 0.5rem; align-self: flex-start; }
  .row { flex-wrap: wrap; gap: 4px; }
</style>
