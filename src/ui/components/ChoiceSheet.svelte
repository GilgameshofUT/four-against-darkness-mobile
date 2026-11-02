<script lang="ts">
  import { ui, art } from '../store.svelte';
  import type { ChoicePrompt } from '../../engine/io';
  import { haptic } from '../fx';
  import { maxLife } from '../../engine/hero';

  let { prompt }: { prompt: ChoicePrompt<unknown> } = $props();
  const hero = $derived(prompt.who ? ui.s.guild.roster.find((h) => h.id === prompt.who) : undefined);
  function pick(v: unknown, disabled?: boolean | string) {
    if (disabled) return;
    haptic(8);
    ui.answer(v);
  }
  const heroOpts = $derived(prompt.layout === 'heroes' ? prompt.options.filter((o) => o.icon?.startsWith('portraits/')) : []);
  const restOpts = $derived(prompt.layout === 'heroes' ? prompt.options.filter((o) => !o.icon?.startsWith('portraits/')) : prompt.options);
  function heroFor(id: unknown) {
    return ui.s.guild.roster.find((h) => h.id === id);
  }
</script>

<div class="sheet-bg">
  <div class="sheet panel">
    {#if prompt.art}
      <div class="art"><img src={art(prompt.art)} alt="" /></div>
    {/if}
    <div class="head">
      {#if hero}<img class="portrait" src={art(`portraits/${hero.portrait}`)} alt="" width="48" height="64" />{/if}
      <div>
        <h3>{prompt.title}</h3>
        {#if prompt.text}<p class="small">{prompt.text}</p>{/if}
      </div>
    </div>
    <div class="opts scroll">
      {#if heroOpts.length}
        <div class="heroes">
          {#each heroOpts as o}
            {@const h = heroFor(o.value)}
            <button class="hero" class:dis={!!o.disabled} onclick={() => pick(o.value, o.disabled)}>
              <img class="portrait" src={art(o.icon)} alt="" />
              <b>{o.label}</b>
              {#if h}<div class="lifebar"><i style="width:{(100 * h.life) / maxLife(h)}%"></i></div>{/if}
              <span class="tiny">{typeof o.disabled === 'string' ? o.disabled : o.desc ?? ''}</span>
            </button>
          {/each}
        </div>
      {/if}
      {#each restOpts as o}
        <button class="opt {o.tone ?? ''}" class:dis={!!o.disabled} onclick={() => pick(o.value, o.disabled)}>
          {#if o.icon}<img src={art(o.icon)} alt="" class="ico" />{/if}
          <span class="txt">
            <span class="lbl">{o.label}</span>
            {#if typeof o.disabled === 'string'}<span class="tiny why">{o.disabled}</span>
            {:else if o.desc}<span class="tiny">{o.desc}</span>{/if}
          </span>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .sheet-bg { position: absolute; inset: 0; z-index: 50; display: flex; align-items: flex-end; background: rgba(10, 8, 6, 0.45); animation: fadeIn 0.15s; padding: 0.471rem 8px calc(10px + var(--safe-b)); }
  .sheet { width: 100%; max-height: 86dvh; display: flex; flex-direction: column; gap: 0.588rem; animation: slideUp 0.2s; padding: 0.706rem; }
  .art { margin: -12px -12px 0; height: 8.824rem; overflow: hidden; border-radius: 8px 8px 0 0; border-bottom: 2px solid var(--teal); background: var(--parch-2); }
  .art img { width: 100%; height: 100%; object-fit: cover; object-position: center 30%; }
  .head { display: flex; gap: 0.588rem; align-items: center; }
  .opts { display: flex; flex-direction: column; gap: 0.471rem; overflow-y: auto; padding: 2px; }
  .opt { display: flex; align-items: center; gap: 0.588rem; text-align: left; min-height: 3.059rem; padding: 0.471rem 12px; border-radius: 8px; border: 2px solid var(--teal); background: linear-gradient(180deg, #f6ecd3, var(--parch-2)); box-shadow: 0 2px 0 var(--teal); }
  .opt:active { transform: translateY(2px); box-shadow: none; }
  .opt.primary { background: linear-gradient(180deg, var(--teal-3), var(--teal)); color: var(--parch); border-color: var(--brass); }
  .opt.danger { background: linear-gradient(180deg, var(--oxblood-2), var(--oxblood)); color: var(--parch); border-color: #4a1612; box-shadow: 0 2px 0 #3b120e; }
  .opt.good { background: linear-gradient(180deg, #5c9a5f, var(--good)); color: var(--parch); }
  .opt.quiet { background: transparent; box-shadow: none; border-color: rgba(43, 33, 22, 0.35); color: var(--ink-soft); }
  .opt.dis { opacity: 0.45; filter: grayscale(0.7); }
  .ico { width: 2.353rem; height: 2.353rem; border-radius: 6px; object-fit: cover; flex: none; }
  .txt { display: flex; flex-direction: column; }
  .lbl { font-family: var(--font-head); font-size: 1.05rem; }
  .why { color: var(--oxblood); }
  .heroes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.353rem; }
  .hero { display: flex; flex-direction: column; gap: 3px; align-items: center; padding: 4px; border-radius: 8px; border: 2px solid var(--teal); background: var(--parch-2); text-align: center; }
  .hero .portrait { width: 100%; aspect-ratio: 3/4; }
  .hero b { font-size: 0.85rem; line-height: 1.05; }
  .hero .lifebar { width: 100%; }
  .hero.dis { opacity: 0.4; filter: grayscale(1); }
</style>
