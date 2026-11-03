<script lang="ts">
  import { ui } from '../store.svelte';
  import DiceTray from './DiceTray.svelte';
  import ChoiceSheet from './ChoiceSheet.svelte';
  import StoryCard from './StoryCard.svelte';
  const p = $derived(ui.pending);
</script>

{#if p && !ui.promptHidden}
{#if p.kind === 'roll'}
  {#key p}<DiceTray prompt={p.prompt} result={p.result} />{/key}
{:else if p.kind === 'choice'}
  {#key p}<ChoiceSheet prompt={p.prompt} />{/key}
{:else if p.kind === 'pause'}
  {#key p}<StoryCard title={p.title} text={p.text} image={p.art} />{/key}
{/if}
{/if}
