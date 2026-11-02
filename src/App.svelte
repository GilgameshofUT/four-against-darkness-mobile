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
{/if}
