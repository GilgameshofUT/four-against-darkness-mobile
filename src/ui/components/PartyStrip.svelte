<script lang="ts">
  import { ui, art } from '../store.svelte';
  import { maxLife } from '../../engine/hero';
  import { CLASSES } from '../../data/classes';

  const order = $derived((void ui.version, ui.s.dungeon?.marchingOrder ?? ui.s.party).map((id) => ui.s.guild.roster.find((h) => h.id === id)!).filter(Boolean));
  const c = $derived((void ui.version, ui.s.combat ? { ...ui.s.combat } : undefined));

  function res(h: (typeof order)[number]): string {
    const r = h.resources;
    const parts: string[] = [];
    if (h.classId === 'cleric') parts.push(`✚${r.healing ?? 0} ✦${r.blessing ?? 0}`);
    if (h.classId === 'halfling') parts.push(`☘${r.luck ?? 0}`);
    if (h.classId === 'barbarian') parts.push(`⚡${r.rage ?? 0}`);
    if (h.classId === 'acrobat') parts.push(`✸${r.trick ?? 0}`);
    if (h.classId === 'paladin') parts.push(`✚${r.prayer ?? 0}`);
    if (h.classId === 'gnome') parts.push(`⚙${r.gadget ?? 0}`);
    if (h.classId === 'swashbuckler') parts.push(`✧${r.panache ?? 0}`);
    if (h.classId === 'mushroom_monk') parts.push(`☁${r.spores ?? 0}`);
    const sp = h.spells.filter((s) => !s.used).length;
    if (h.spells.length) parts.push(`✦${sp}/${h.spells.length}`);
    return parts.join(' ');
  }
</script>

<div class="strip">
  {#each order as h, i (h.id + ':' + ui.version)}
    {@const hc = c?.heroes[h.id]}
    <button class="hero" class:dead={h.status !== 'ok'} class:acted={hc?.acted} class:light={ui.s.dungeon?.lanternBearer === h.id} onclick={() => (ui.sheetHero = h.id)}>
      <div class="pos">{i + 1}</div>
      <img src={art(`portraits/${h.portrait}`)} alt="" class="portrait" />
      {#if h.status !== 'ok'}<div class="status">{h.status === 'petrified' ? '🗿' : h.status === 'insane' ? '🌀' : '☠'}</div>{/if}
      <div class="info">
        <div class="name">{h.name}</div>
        <div class="tiny cls">L{h.level} {CLASSES[h.classId].name}</div>
        <div class="lifebar"><i style="width:{Math.max(0, (100 * h.life) / maxLife(h))}%"></i></div>
        <div class="tiny row" style="justify-content:space-between"><span>♥{h.life}/{maxLife(h)}</span><span class="res">{res(h)}</span></div>
        {#if h.conditions.length || h.madness}<div class="conds">{#if h.madness}<span title="Madness">🌀{h.madness}</span>{/if}{#each h.conditions.slice(0, 3) as k}<span title={k.label}>•</span>{/each}</div>{/if}
      </div>
    </button>
  {/each}
</div>

<style>
  .strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.294rem; padding: 0.353rem; }
  .hero { position: relative; display: flex; flex-direction: column; padding: 4px; border-radius: 8px; border: 2px solid var(--teal); background: linear-gradient(180deg, var(--parch), var(--parch-2)); text-align: left; min-width: 0; }
  .hero.light { border-color: var(--brass); box-shadow: 0 0 10px rgba(217, 182, 106, 0.6); }
  .hero.acted { opacity: 0.6; }
  .hero.dead { filter: grayscale(1) brightness(0.7); }
  .portrait { width: 100%; aspect-ratio: 1 / 1; object-position: center 20%; border-width: 1px; }
  .pos { position: absolute; top: 6px; left: 6px; z-index: 1; background: var(--teal); color: var(--parch); border-radius: 50%; width: 1.059rem; height: 1.059rem; font-size: 0.7rem; display: grid; place-items: center; font-family: var(--font-head); }
  .status { position: absolute; top: 18%; left: 0; right: 0; text-align: center; font-size: 1.8rem; }
  .info { padding-top: 3px; min-width: 0; }
  .name { font-family: var(--font-head); font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.1; }
  .cls { color: var(--ink-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lifebar { margin: 2px 0; }
  .res { color: var(--teal); font-weight: 700; }
  .conds { font-size: 0.7rem; color: var(--oxblood); }
</style>
