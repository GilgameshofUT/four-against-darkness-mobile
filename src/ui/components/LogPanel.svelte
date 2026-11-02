<script lang="ts">
  import { ui } from '../store.svelte';
  import { describe } from '../../engine/game';
  const entries = $derived([...ui.s.log].reverse().slice(0, 200));
  let open = $state<number | null>(null);
</script>

<div class="bg" role="presentation" onclick={() => (ui.showLog = false)}>
  <div class="panel log" role="presentation" onclick={(e) => e.stopPropagation()}>
    <div class="row"><h3 class="grow">Adventure Log</h3><button class="btn small quiet" onclick={() => (ui.showLog = false)}>Close</button></div>
    <div class="list scroll">
      {#each entries as e (e.n)}
        <button class="entry {e.kind}" onclick={() => (open = open === e.n ? null : e.n)}>
          <span>{e.text}</span>
          {#if open === e.n && e.roll}<div class="tiny det">{describe(e.roll)}</div>{/if}
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .bg { position: absolute; inset: 0; z-index: 30; background: rgba(0, 0, 0, 0.5); display: flex; align-items: flex-end; padding: 0.471rem 8px calc(8px + var(--safe-b)); }
  .log { width: 100%; height: 75dvh; display: flex; flex-direction: column; gap: 0.471rem; }
  .list { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .entry { text-align: left; border: none; background: transparent; padding: 0.294rem 4px; border-bottom: 1px dashed rgba(43, 33, 22, 0.2); font-size: 0.9rem; }
  .entry.good { color: var(--good); }
  .entry.bad { color: var(--oxblood); }
  .entry.loot, .entry.level { color: #7a5a1a; font-weight: 700; }
  .entry.roll { color: var(--ink-soft); font-size: 0.82rem; }
  .entry.story { font-style: italic; }
  .det { color: var(--teal); }
</style>
