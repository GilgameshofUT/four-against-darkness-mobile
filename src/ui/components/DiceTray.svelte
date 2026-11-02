<script lang="ts">
  import { ui, art } from '../store.svelte';
  import type { RollPrompt } from '../../engine/io';
  import type { RollResult } from '../../engine/dice';
  import { haptic, sound } from '../fx';
  import Die from './Die.svelte';

  let { prompt, result }: { prompt: RollPrompt; result: RollResult } = $props();
  let phase = $state<'ready' | 'rolling' | 'shown'>('ready');
  let revealed = $state(0);
  const hero = $derived(prompt.who ? ui.s.guild.roster.find((h) => h.id === prompt.who) : undefined);
  const isTable = $derived(result.target === undefined && result.mods.length === 0 && result.faces.length >= 1);
  const outcome = $derived(result.success === undefined ? null : result.success ? 'success' : 'fail');

  function roll() {
    if (phase !== 'ready') return;
    phase = 'rolling';
    haptic(18);
    sound('roll');
    revealed = 0;
    const step = () => {
      revealed++;
      if (result.exploded && revealed < result.faces.length) {
        haptic(10);
        setTimeout(step, 520);
      } else {
        setTimeout(() => {
          phase = 'shown';
          if (result.exploded) haptic([20, 40, 20]);
          if (result.outcomeText) {
            if (outcome === 'success') (sound('bad'), haptic([40, 60, 40]));
          } else {
            if (outcome === 'success') sound('good');
            if (outcome === 'fail') (sound('bad'), haptic(40));
          }
        }, 420);
      }
    };
    setTimeout(step, 650);
  }

  function done() {
    if (phase === 'shown') ui.answer(undefined);
  }

  $effect(() => {
    if (ui.s.settings.autoContinue && phase === 'ready') roll();
  });
</script>

<div class="tray" role="presentation" onclick={() => (phase === 'ready' ? roll() : done())}>
  <div class="card panel" class:fail={phase === 'shown' && outcome === 'fail' && !result.outcomeText} class:win={phase === 'shown' && outcome === 'success'}>
    <div class="head">
      {#if hero}<img class="portrait" src={art(`portraits/${hero.portrait}`)} alt="" width="52" height="68" />{/if}
      <div class="grow">
        <h3>{prompt.label}</h3>
        {#if hero}<div class="small muted">{hero.name}</div>{/if}
        {#if prompt.context}<div class="small">{prompt.context}</div>{/if}
      </div>
    </div>

    <div class="dice">
      {#each result.faces as f, i}
        {#if i === 0 || !result.exploded || revealed > i || phase === 'shown'}
          <Die value={f} sides={result.die} hidden={phase === 'ready'} rolling={phase === 'rolling' && revealed <= i} explode={i > 0} />
        {/if}
      {/each}

    </div>

    {#if phase === 'shown'}
      <div class="math" style="animation: fadeIn .3s">
        {#if result.exploded}<div class="explode">💥 Explosion! {result.faces.join(' + ')}</div>{/if}
        {#if !isTable || result.mods.length}
          <div class="mods">
            <span>Roll {result.faces.reduce((a, b) => a + b, 0)}</span>
            {#each result.mods as m}<span class:neg={m.value < 0}>{m.value >= 0 ? '+' : ''}{m.value} {m.label}</span>{/each}
          </div>
        {/if}
        <div class="total">
          <span class="num">{result.total}</span>
          {#if result.target !== undefined}
            <span class="vs">{result.atMost ? `needs ${result.target} or less` : result.mode === 'gt' ? `vs more than ${result.target}` : result.outcomeText !== undefined ? `needs ${result.target}+` : `vs ${result.target}`}</span>
          {/if}
        </div>
        {#if outcome}
          <div class="verdict {result.outcomeText ? 'neutral ' + outcome : outcome}">{result.outcomeText ?? (outcome === 'success' ? 'Success!' : result.autoFail ? 'Natural 1 — Failure' : 'Failure')}</div>
        {/if}
        <button class="btn primary block" onclick={(e) => (e.stopPropagation(), done())}>Continue</button>
      </div>
    {:else}
      <button class="btn primary block" disabled={phase !== 'ready'} onclick={(e) => (e.stopPropagation(), roll())}>🎲 Roll {result.faces.length > 1 && isTable ? `${result.faces.length}d${result.die}` : `d${result.die}`}</button>
    {/if}
  </div>
</div>

<style>
  .tray { position: absolute; inset: 0; z-index: 60; display: flex; align-items: flex-end; padding: 0.706rem 12px calc(16px + var(--safe-b)); background: rgba(10, 8, 6, 0.55); animation: fadeIn 0.15s; }
  .card { width: 100%; animation: slideUp 0.2s; display: flex; flex-direction: column; gap: 0.706rem; }
  .card.fail { animation: shake 0.35s; }
  .head { display: flex; gap: 0.588rem; align-items: center; }
  .dice { display: flex; justify-content: center; align-items: center; gap: 0.706rem; min-height: 6.353rem; flex-wrap: wrap; position: relative; }
  .hint { position: absolute; bottom: -2px; font-family: var(--font-head); color: var(--teal); opacity: 0.8; font-size: 0.9rem; }
  .math { display: flex; flex-direction: column; gap: 0.353rem; align-items: center; }
  .explode { color: var(--oxblood); font-family: var(--font-head); }
  .mods { display: flex; flex-wrap: wrap; gap: 4px 10px; justify-content: center; font-size: 0.9rem; }
  .mods span { background: rgba(31, 75, 72, 0.12); padding: 1px 8px; border-radius: 6px; }
  .mods .neg { background: rgba(125, 43, 34, 0.15); color: var(--oxblood); }
  .total { display: flex; align-items: baseline; gap: 0.588rem; }
  .num { font-family: var(--font-head); font-size: 2.6rem; color: var(--teal); }
  .vs { font-size: 1.1rem; color: var(--ink-soft); }
  .verdict { font-family: var(--font-head); font-size: 1.4rem; padding: 2px 16px; border-radius: 6px; animation: pop 0.3s; }
  .verdict.success { color: var(--parch); background: var(--good); }
  .verdict.fail { color: var(--parch); background: var(--oxblood); }
  .verdict.neutral.success { color: var(--parch); background: var(--oxblood); }
  .verdict.neutral.fail { color: var(--parch); background: var(--teal); }
</style>
