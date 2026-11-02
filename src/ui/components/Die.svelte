<script lang="ts">
  let { value, sides = 6, rolling = false, explode = false, hidden = false }: { value: number; sides?: number; rolling?: boolean; explode?: boolean; hidden?: boolean } = $props();
  let shown = $state(1);
  $effect(() => {
    if (!rolling) {
      shown = value;
      return;
    }
    const t = setInterval(() => (shown = 1 + Math.floor(Math.random() * sides)), 70);
    return () => clearInterval(t);
  });
  const pips: Record<number, [number, number][]> = {
    1: [[50, 50]],
    2: [[28, 28], [72, 72]],
    3: [[28, 28], [50, 50], [72, 72]],
    4: [[28, 28], [72, 28], [28, 72], [72, 72]],
    5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
    6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]],
  };
</script>

<div class="die" class:idle={hidden} class:rolling class:explode class:six={!rolling && value === sides}>
  {#if sides === 6}
    <svg viewBox="0 0 100 100" class="dsvg">
      <rect x="4" y="4" width="92" height="92" rx="18" class="face" />
      {#if hidden}<text x="50" y="64" text-anchor="middle" class="numtext q">?</text>{:else}{#each pips[shown] ?? [] as [x, y]}<circle cx={x} cy={y} r="9" class="pip" />{/each}{/if}
    </svg>
  {:else}
    <svg viewBox="0 0 100 100" class="dsvg">
      <polygon points="50,4 95,30 95,72 50,96 5,72 5,30" class="face" />
      <text x="50" y="62" text-anchor="middle" class="numtext">{hidden ? '?' : shown}</text>
    </svg>
  {/if}
</div>

<style>
  .die { animation: pop 0.25s; filter: drop-shadow(0 4px 4px rgba(0, 0, 0, 0.35)); }
  .dsvg { width: 5rem; height: 5rem; }
  .face { fill: #f6ecd6; stroke: var(--teal); stroke-width: 4; }
  .pip { fill: var(--ink); }
  .six .pip { fill: var(--oxblood); }
  .explode .dsvg { width: 5rem; height: 5rem; }
  .face { fill: #fbe2b8; stroke: var(--oxblood); }
  .numtext { font-family: var(--font-head); font-size: 2.353rem; fill: var(--ink); }
    .q { fill: var(--teal); opacity: .6; }
  .idle { animation: bob 1.6s ease-in-out infinite; }
  @keyframes bob { 0%,100% { transform: translateY(0) rotate(-4deg); } 50% { transform: translateY(-6px) rotate(4deg); } }
  .rolling { animation: tumble 0.35s infinite linear; }
  @keyframes tumble { 0% { transform: rotate(0) translateY(0); } 25% { transform: rotate(90deg) translateY(-8px); } 50% { transform: rotate(180deg); } 75% { transform: rotate(270deg) translateY(-6px); } 100% { transform: rotate(360deg); } }
</style>
