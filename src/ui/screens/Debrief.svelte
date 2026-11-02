<script lang="ts">
  import { ui, art } from '../store.svelte';
  import { buryFallen } from '../../engine/campaign';
  import { CLASSES } from '../../data/classes';

  const r = $derived(ui.s.adventureResult);
  const party = $derived(ui.s.party.map((id) => ui.s.guild.roster.find((h) => h.id === id)).filter(Boolean));
  const title = $derived(r?.outcome === 'victory' ? 'Victory!' : r?.outcome === 'wipe' ? 'The Darkness Wins' : 'You Escaped');
  const scene = $derived(r?.outcome === 'wipe' ? 'defeat' : 'victory');

  async function back() {
    const fallen = party.filter((h) => h!.status !== 'ok').map((h) => h!.id);
    // Insane heroes are gone; dead/petrified may be resurrected from the graveyard
    buryFallen(ui.game, fallen);
    ui.s.mode = 'guild';
    ui.s.party = [];
    ui.s.adventureResult = undefined;
    ui.screen = 'guild';
    ui.bump();
    await ui.save();
  }
</script>

<div class="deb" style="background-image:url({art(`scenes/${scene}`)})">
  <div class="shade"></div>
  <div class="panel card">
    <h1 class="center">{title}</h1>
    <div class="divider"></div>
    {#if r}
      <p class="center">Treasure brought home: <b>{r.goldGained} gp</b> (added to the guild treasury)</p>
      <div class="heroes">
        {#each party as h}
          {#if h}
            <div class="h" class:dead={h.status !== 'ok'}>
              <img class="portrait" src={art(`portraits/${h.portrait}`)} alt="" />
              <b class="small">{h.name}</b>
              <span class="tiny">L{h.level} {CLASSES[h.classId].name}</span>
              <span class="tiny">{h.status === 'ok' ? 'Survived' : h.status === 'insane' ? 'Lost to madness' : h.status === 'petrified' ? 'Turned to stone' : 'Fallen'}</span>
            </div>
          {/if}
        {/each}
      </div>
      {#if r.deaths.length}<p class="small muted center">The fallen rest in the guild graveyard. A temple can attempt a Resurrection for 1000 gp.</p>{/if}
    {/if}
    <button class="btn primary block" onclick={back}>Return to the Guild Hall</button>
  </div>
</div>

<style>
  .deb { position: absolute; inset: 0; background-size: cover; background-position: center; display: flex; align-items: flex-end; padding: 0.706rem 12px calc(16px + var(--safe-b)); }
  .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.75)); }
  .card { position: relative; width: 100%; display: flex; flex-direction: column; gap: 0.588rem; animation: slideUp 0.3s; }
  h1 { color: var(--teal); }
  .heroes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.353rem; }
  .h { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 2px; }
  .h .portrait { width: 100%; aspect-ratio: 3/4; }
  .h.dead { filter: grayscale(1); }
</style>
