<script lang="ts">
  import { onMount } from 'svelte';
  import { ui } from './ui/store.svelte';
  import PromptHost from './ui/components/PromptHost.svelte';
  import Toast from './ui/components/Toast.svelte';
  import Title from './ui/screens/Title.svelte';
  import Guild from './ui/screens/Guild.svelte';
  import Dungeon from './ui/screens/Dungeon.svelte';
  import Debrief from './ui/screens/Debrief.svelte';
  import Settings from './ui/screens/Settings.svelte';
  import HeroSheet from './ui/components/HeroSheet.svelte';

  let ready = $state(false);
  onMount(async () => {
    const { devBoot } = await import('./ui/dev');
    if (!(await devBoot())) await ui.load();
    ready = true;
  });
</script>

{#if ready}
  {#if ui.screen === 'title'}
    <Title />
  {:else if ui.screen === 'guild'}
    <Guild />
  {:else if ui.screen === 'dungeon'}
    <Dungeon />
  {:else if ui.screen === 'debrief'}
    <Debrief />
  {/if}
  {#if ui.sheetHero}<HeroSheet heroId={ui.sheetHero} />{/if}
  {#if ui.showSettings}<Settings />{/if}
  <Toast />
  <PromptHost />
  {#if ui.pending && ui.promptHidden}
    <button class="resume" onclick={() => (ui.promptHidden = false)}>▶ Resume</button>
  {/if}
{/if}

<style>
  .resume {
    position: absolute;
    left: 50%;
    bottom: calc(14px + var(--safe-b));
    transform: translateX(-50%);
    z-index: 80;
    min-height: 3rem;
    padding: 0.471rem 22px;
    border-radius: 99px;
    border: 2px solid var(--brass);
    background: linear-gradient(180deg, var(--teal-3), var(--teal));
    color: var(--parch);
    font-family: var(--font-head);
    font-size: 1.1rem;
    box-shadow: var(--shadow);
  }
</style>
