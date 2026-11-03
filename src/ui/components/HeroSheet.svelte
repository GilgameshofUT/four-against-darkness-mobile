<script lang="ts">
  import { ui, art } from '../store.svelte';
  import { CLASSES } from '../../data/classes';
  import { findTrait } from '../../data/traits';
  import { SPELLS } from '../../data/spells';
  import { maxLife, base, bonusValue, canUseItem, tierOf } from '../../engine/hero';
  import { equipItem, unequip } from '../../engine/inventory';
  import { madnessLimit } from '../../engine/effects';

  let { heroId }: { heroId: string } = $props();
  // Fresh identity per bump (engine mutates heroes in place); arrays copied so rows refresh.
  const found = $derived((void ui.version, ui.s.guild.roster.find((x) => x.id === heroId) ?? ui.s.guild.graveyard.find((x) => x.id === heroId)));
  const h = $derived(found && { ...found, inventory: [...found.inventory], spells: [...found.spells], conditions: [...found.conditions], secrets: [...(found.secrets ?? [])], resources: { ...found.resources } });
  const cls = $derived(h ? CLASSES[h.classId] : undefined);
  const inDungeon = $derived(!!ui.s.dungeon);
  const bdesc = (b: string) => (b === 'L' ? '+L' : b === 'half' ? '+½L' : b === 'tier' ? '+Tier' : b === 'one' ? '+1' : '—');
  function equipped(uid: string) {
    return h ? Object.values(h.equip).includes(uid) : false;
  }
  function toggle(uid: string) {
    if (!h || ui.s.combat) return;
    const it = h.inventory.find((i) => i.uid === uid)!;
    if (equipped(uid)) unequip(h, uid);
    else equipItem(ui.game, h, it);
    ui.bump();
    ui.save();
  }
</script>

{#if h && cls}
  <div class="bg" role="presentation" onclick={() => (ui.sheetHero = null)}>
    <div class="sheet panel" role="presentation" onclick={(e) => e.stopPropagation()}>
      <div class="top">
        <img src={art(`portraits/${h.portrait}`)} alt="" class="portrait big" />
        <div class="col grow">
          <h2>{h.name}</h2>
          <div class="muted">Level {h.level} {cls.name} · {cls.role}</div>
          <div class="lifebar"><i style="width:{(100 * Math.max(0, h.life)) / maxLife(h)}%"></i></div>
          <div class="row small"><b>♥ {h.life}/{maxLife(h)}</b><span>🌀 {h.madness}/{madnessLimit(h)}</span>{#if h.status !== 'ok'}<span class="pill red">{h.status}</span>{/if}</div>
          <div class="stats small">
            <span>⚔ Melee {bdesc(cls.attackMelee)} ({bonusValue(cls.attackMelee, h)})</span>
            <span>🏹 Ranged {bdesc(cls.attackRanged)}</span>
            <span>🛡 Defense {bdesc(cls.defense)}</span>
            <span>👣 Stealth {bdesc(cls.stealth)}</span>
            <span>Saves as {cls.savesAs}</span>
            <span>Tier {tierOf(h.level)} · d6</span>
          </div>
        </div>
      </div>
      <div class="divider"></div>
      <div class="scroll body">
        {#if Object.keys(h.resources).some((k) => k !== 'arrows')}
          <h4>Resources</h4>
          <div class="row wrap">
            {#each Object.entries(h.resources).filter(([k]) => k !== 'arrows' || ui.s.settings.arrowTracking) as [k, v]}<span class="pill teal">{k}: {v}</span>{/each}
          </div>
        {/if}
        {#if h.spells.length}
          <h4>Prepared spells</h4>
          <div class="row wrap">{#each h.spells as s}<span class="pill" class:used={s.used} title={SPELLS[s.id]?.desc}>{SPELLS[s.id]?.name ?? s.id}</span>{/each}</div>
        {/if}
        <h4>Traits</h4>
        {#each h.traits as t}{@const td = findTrait(t)}<div class="trait"><b>{td?.name ?? t}</b> <span class="small">{td?.desc}</span></div>{/each}
        {#if h.conditions.length}
          <h4>Conditions</h4>
          <div class="row wrap">{#each h.conditions as c}<span class="pill red">{c.label}</span>{/each}</div>
        {/if}
        <h4>Equipment <span class="tiny muted">{inDungeon && !ui.s.combat ? '(tap to equip / unequip)' : ''}</span></h4>
        <div class="items">
          {#each h.inventory as it (it.uid)}
            {@const b = base(it)}
            {@const no = canUseItem(h, it)}
            <button class="item" class:eq={equipped(it.uid)} onclick={() => toggle(it.uid)} disabled={!!ui.s.combat}>
              <img src={art(`items/${b?.icon ?? 'scroll'}`)} alt="" />
              <div class="col" style="gap:0">
                <b class="small">{it.name}{it.qty && it.qty > 1 ? ` ×${it.qty}` : ''}</b>
                <span class="tiny muted">{equipped(it.uid) ? 'Equipped' : no ? no : b?.desc?.slice(0, 70)}</span>
              </div>
            </button>
          {/each}
        </div>
        {#if h.companion}<h4>Companion</h4><div>{h.companion.name} ({h.companion.id}) ♥{h.companion.life}/{h.companion.maxLife}</div>{/if}
        {#if h.secrets.length}<h4>Secrets</h4><div class="row wrap">{#each h.secrets as s}<span class="pill gold">{s.replace(/_/g, ' ')}</span>{/each}</div>{/if}
        <h4>Record</h4>
        <div class="small muted">Adventures: {h.adventures} · Kills: {h.kills.total} · Major foes: {h.kills.major}</div>
      </div>
      <button class="btn primary block" onclick={() => (ui.sheetHero = null)}>Close</button>
    </div>
  </div>
{/if}

<style>
  .bg { position: absolute; inset: 0; z-index: 70; background: rgba(0, 0, 0, 0.55); display: flex; align-items: flex-end; padding: 0.471rem 8px calc(8px + var(--safe-b)); animation: fadeIn 0.15s; }
  .sheet { width: 100%; max-height: 92dvh; display: flex; flex-direction: column; gap: 0.353rem; animation: slideUp 0.2s; }
  .top { display: flex; gap: 0.706rem; }
  .big { width: 7.059rem; height: 9.412rem; flex: none; }
  .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; margin-top: 4px; }
  .body { flex: 1; display: flex; flex-direction: column; gap: 0.353rem; min-height: 0; }
  h4 { font-family: var(--font-head); color: var(--teal); margin-top: 6px; }
  .wrap { flex-wrap: wrap; }
  .pill.used { text-decoration: line-through; opacity: 0.5; }
  .trait { font-size: 0.95rem; }
  .items { display: flex; flex-direction: column; gap: 4px; }
  .item { display: flex; gap: 0.471rem; align-items: center; text-align: left; border: 1px solid rgba(31, 75, 72, 0.4); border-radius: 8px; padding: 4px; background: rgba(255, 255, 255, 0.25); }
  .item.eq { border: 2px solid var(--teal); background: rgba(63, 127, 119, 0.15); }
  .item img { width: 2.353rem; height: 2.353rem; border-radius: 6px; }
</style>
