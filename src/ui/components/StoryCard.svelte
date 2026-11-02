<script lang="ts">
  import { ui, art } from '../store.svelte';
  let { title, text, image }: { title: string; text: string; image?: string } = $props();
</script>

<div class="bg" role="presentation" onclick={() => ui.answer(undefined)}>
  <div class="card panel">
    {#if image}<div class="img"><img src={art(image)} alt="" /></div>{/if}
    <h2>{title}</h2>
    <div class="divider"></div>
    {#each text.split('\n').filter(Boolean) as para}<p>{para}</p>{/each}
    <button class="btn primary block" onclick={(e) => (e.stopPropagation(), ui.answer(undefined))}>Continue</button>
  </div>
</div>

<style>
  .bg { position: absolute; inset: 0; z-index: 55; display: flex; align-items: center; justify-content: center; padding: 0.824rem; background: rgba(10, 8, 6, 0.6); animation: fadeIn 0.2s; }
  .card { width: 100%; animation: pop 0.25s; display: flex; flex-direction: column; gap: 0.353rem; max-height: 92dvh; overflow-y: auto; }
  .img { margin: -14px -14px 6px; height: 13.529rem; overflow: hidden; border-radius: 8px 8px 0 0; border-bottom: 2px solid var(--teal); background: var(--parch-2); }
  .img img { width: 100%; height: 100%; object-fit: cover; object-position: center 25%; }
  h2 { text-align: center; color: var(--teal); }
</style>
