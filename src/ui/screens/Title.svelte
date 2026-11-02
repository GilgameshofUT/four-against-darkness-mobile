<script lang="ts">
  import { ui, art } from '../store.svelte';
  import { newState } from '../../engine/state';
  import { wipeSave } from '../persist';

  const hasGuild = $derived(ui.s.guild.roster.length > 0 || ui.s.guild.graveyard.length > 0);
  const inDungeon = $derived(ui.s.mode === 'dungeon');

  function cont() {
    ui.screen = ui.s.mode === 'dungeon' ? 'dungeon' : ui.s.mode === 'debrief' ? 'debrief' : 'guild';
  }
  async function newGuild() {
    if (hasGuild && !confirm('Start a new guild? Your current guild and heroes will be lost.')) return;
    await wipeSave();
    const settings = ui.s.settings;
    ui.game.s = newState();
    ui.game.s.settings = settings;
    ui.game.s.mode = 'guild';
    ui.screen = 'guild';
    ui.bump();
    await ui.save();
  }
</script>

<div class="title" style="background-image: url({art('scenes/title')})">
  <div class="shade"></div>
  <div class="top">
    <div class="logo">
      <div class="four">Four</div>
      <div class="against">against</div>
      <div class="darkness">Darkness</div>
    </div>
    <p class="tag">A guided solo dungeon delve</p>
  </div>
  <div class="menu">
    {#if hasGuild}
      <button class="btn primary block" onclick={cont}>{inDungeon ? 'Continue the delve' : 'Return to the Guild'}</button>
      <button class="btn block" onclick={newGuild}>Found a new guild</button>
    {:else}
      <button class="btn primary block" onclick={newGuild}>Found your guild</button>
    {/if}
    <button class="btn quiet block" style="color: var(--parch); border-color: rgba(239,226,196,.4)" onclick={() => (ui.showSettings = true)}>Settings</button>
    <p class="credit tiny">Based on Four Against Darkness by Andrea Sfiligoi (Ganesha Games). Personal use.</p>
  </div>
</div>

<style>
  .title { position: absolute; inset: 0; background-size: cover; background-position: center; display: flex; flex-direction: column; justify-content: space-between; padding: calc(2.353rem + var(--safe-t)) 24px calc(24px + var(--safe-b)); }
  .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(10, 8, 6, 0.75) 0%, rgba(10, 8, 6, 0.1) 35%, rgba(10, 8, 6, 0.2) 55%, rgba(10, 8, 6, 0.92) 100%); }
  .top, .menu { position: relative; }
  .logo { text-align: center; color: var(--parch); font-family: var(--font-head); text-shadow: 0 3px 8px #000, 0 0 2px #000; line-height: 0.95; }
  .four { font-size: 3.6rem; color: var(--brass-2); }
  .against { font-size: 1.4rem; letter-spacing: 0.3em; margin: 4px 0; }
  .darkness { font-size: 3.2rem; }
  .tag { text-align: center; color: var(--parch-2); font-style: italic; text-shadow: 0 2px 4px #000; }
  .menu { display: flex; flex-direction: column; gap: 0.706rem; }
  .credit { color: rgba(239, 226, 196, 0.6); text-align: center; margin-top: 6px; }
</style>
