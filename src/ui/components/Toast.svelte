<script lang="ts">
  import { ui } from '../store.svelte';
  let show = $state(false);
  let text = $state('');
  let kind = $state('info');
  let t: ReturnType<typeof setTimeout>;
  $effect(() => {
    const e = ui.toast;
    if (!e) return;
    text = e.text;
    kind = e.kind;
    show = true;
    clearTimeout(t);
    t = setTimeout(() => (show = false), 2600);
  });
</script>

{#if show && !ui.pending}
  <div class="toast {kind}" role="status" onclick={() => (show = false)}>{text}</div>
{/if}

<style>
  .toast { position: absolute; top: calc(10px + var(--safe-t)); left: 12px; right: 12px; z-index: 45; padding: 0.588rem 14px; border-radius: 8px; background: var(--teal); color: var(--parch); border: 1px solid var(--brass); box-shadow: var(--shadow); animation: slideUp 0.2s; font-size: 0.95rem; }
  .toast.bad { background: var(--oxblood); }
  .toast.good { background: var(--good); }
  .toast.loot, .toast.level { background: var(--brass); color: var(--night); }
</style>
