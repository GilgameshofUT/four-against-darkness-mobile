<script lang="ts">
  import { ui, art } from '../store.svelte';
  import type { Hero, Item } from '../../engine/types';
  import { CLASSES } from '../../data/classes';
  import { SHOP_LIST, ITEM_BASES } from '../../data/items';
  import { equipItem, removeItem } from '../../engine/inventory';
  import { canUseItem, heldLight, maxLife } from '../../engine/hero';
  import { startAdventure, resurrect } from '../../engine/campaign';
  import Creation from './Creation.svelte';

  let tab = $state<'roster' | 'embark' | 'market'>('roster');
  let showCreation = $state(false);
  let creationCount = $state(1);
  let showGraveyard = $state(false);
  let selectedParty = $state<string[]>([]);
  let adventure = $state<'random' | 'witch'>('random');
  let marchingOrder = $state<string[]>([]);
  let lanternBearer = $state('');
  let buyerId = $state('');
  let damageChoice = $state<string | null>(null);
  let sellHeroId = $state('');

  const roster = $derived(ui.s.guild.roster);
  const aliveRoster = $derived(roster.filter((h) => h.status === 'ok'));
  const partyHeroes = $derived(selectedParty.map((id) => roster.find((h) => h.id === id)).filter((h): h is Hero => !!h));
  const buyer = $derived(roster.find((h) => h.id === buyerId));
  const sellHero = $derived(roster.find((h) => h.id === sellHeroId));

  function openCreation(count: number) {
    creationCount = count;
    showCreation = true;
  }

  function classLabel(h: Hero) {
    return CLASSES[h.classId].name;
  }

  function retire(h: Hero) {
    if (!confirm(`Retire ${h.name} from the guild? This cannot be undone.`)) return;
    ui.s.guild.roster = ui.s.guild.roster.filter((x) => x.id !== h.id);
    ui.s.guild.graveyard.push(h);
    selectedParty = selectedParty.filter((id) => id !== h.id);
    ui.bump();
    void ui.save();
  }

  async function bringBack(h: Hero) {
    await ui.run(async (g) => {
      const ok = resurrect(g, h);
      if (ok) {
        g.s.guild.graveyard = g.s.guild.graveyard.filter((x) => x.id !== h.id);
        g.s.guild.roster.push(h);
      }
    });
  }

  function toggleParty(h: Hero) {
    if (h.status !== 'ok') return;
    if (selectedParty.includes(h.id)) {
      selectedParty = selectedParty.filter((id) => id !== h.id);
      marchingOrder = marchingOrder.filter((id) => id !== h.id);
    } else if (selectedParty.length < 4) {
      selectedParty = [...selectedParty, h.id];
      marchingOrder = [...marchingOrder, h.id];
    }
    if (!lanternBearer || !selectedParty.includes(lanternBearer)) lanternBearer = selectedParty.find((id) => hasLantern(roster.find((h) => h.id === id))) ?? '';
  }

  function hasLantern(h: Hero | undefined) {
    return !!h?.inventory.some((i) => i.base === 'lantern');
  }

  function hasTorch(h: Hero) {
    return h.inventory.some((i) => i.base === 'torch' || i.base === 'torch_weapon');
  }

  const warnings = $derived.by(() => {
    const out: string[] = [];
    if (!partyHeroes.some((h) => ['cleric', 'paladin', 'druid'].includes(h.classId))) out.push('No healer');
    if (!partyHeroes.some((h) => ['rogue', 'assassin', 'gnome', 'kukla'].includes(h.classId))) out.push('No trap or lock specialist');
    if (!partyHeroes.some((h) => heldLight(h) || hasTorch(h)) && !partyHeroes.some((h) => h.classId === 'illusionist')) out.push('No light source');
    if (!partyHeroes.some((h) => CLASSES[h.classId].lifeBase >= 5)) out.push('No front-liner');
    if (!partyHeroes.some((h) => CLASSES[h.classId].tags.includes('spellcaster'))) out.push('No magic');
    return out;
  });

  const partyHasLantern = $derived(partyHeroes.some(hasLantern));
  const partyHasIllusionist = $derived(partyHeroes.some((h) => h.classId === 'illusionist'));
  const canDescend = $derived(selectedParty.length > 0 && selectedParty.length <= 4 && (partyHasLantern || partyHasIllusionist) && !!lanternBearer);

  function moveOrder(id: string, direction: -1 | 1) {
    const i = marchingOrder.indexOf(id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= marchingOrder.length) return;
    const next = [...marchingOrder];
    [next[i], next[j]] = [next[j], next[i]];
    marchingOrder = next;
  }

  function chooseBearer(id: string) {
    const h = roster.find((x) => x.id === id);
    if (h && hasLantern(h)) {
      const item = h.inventory.find((i) => i.base === 'lantern');
      if (item) equipItem(undefined, h, item);
      lanternBearer = id;
      ui.bump();
    }
  }

  async function descend() {
    if (!canDescend) return;
    const ids = [...marchingOrder];
    await ui.run(async (g) => {
      await startAdventure(g, ids, adventure);
      if (g.s.dungeon) {
        g.s.dungeon.marchingOrder = ids;
        if (lanternBearer) g.s.dungeon.lanternBearer = lanternBearer;
      }
    });
    ui.screen = 'dungeon';
  }

  function buy(baseId: string, damage?: 'crushing' | 'slashing') {
    const h = buyer;
    const b = ITEM_BASES[baseId];
    if (!h || !b?.price) return;
    const count = h.inventory.filter((i) => i.base === baseId).reduce((n, i) => n + (i.qty ?? 1), 0);
    if (b.maxPerHero !== undefined && count >= b.maxPerHero) return;
    if (baseId === 'food' && count >= 10) return;
    if (ui.s.guild.gold < b.price) return;
    ui.s.guild.gold -= b.price;
    const name = baseId === 'light_weapon' ? (damage === 'crushing' ? 'Club' : 'Dagger') : baseId === 'hand_weapon' ? (damage === 'crushing' ? 'Mace' : 'Sword') : baseId === 'two_handed' ? (damage === 'crushing' ? 'Warhammer' : 'Greatsword') : b.name;
    const existing = b.stack ? h.inventory.find((i) => i.base === baseId && i.damage === damage) : undefined;
    if (existing) existing.qty = (existing.qty ?? 1) + 1;
    else h.inventory.push({ uid: ui.game.uid('i'), base: baseId, name, qty: b.stack ? 1 : undefined, damage });
    damageChoice = null;
    ui.bump();
    void ui.save();
  }

  function buyClicked(baseId: string) {
    const b = ITEM_BASES[baseId];
    if (!b) return;
    if (b.weapon?.chooseDamage) damageChoice = baseId;
    else buy(baseId);
  }

  function buyAtPrice(baseId: string, price: number) {
    const h = buyer;
    const b = ITEM_BASES[baseId];
    if (!h || !b || ui.s.guild.gold < price) return;
    const count = h.inventory.filter((i) => i.base === baseId).reduce((n, i) => n + (i.qty ?? 1), 0);
    if (b.maxPerHero !== undefined && count >= b.maxPerHero) return;
    if (baseId === 'food' && count >= 10) return;
    ui.s.guild.gold -= price;
    const existing = b.stack ? h.inventory.find((i) => i.base === baseId) : undefined;
    if (existing) existing.qty = (existing.qty ?? 1) + 1;
    else h.inventory.push({ uid: ui.game.uid('i'), base: baseId, name: b.name });
    ui.bump();
    void ui.save();
  }

  function sell(it: Item) {
    const h = sellHero;
    if (!h) return;
    const b = ITEM_BASES[it.base];
    let value = it.value ?? b?.resale ?? (b?.price ? Math.floor(b.price / 2) : 0);
    if (b?.kind === 'valuable') {
      const bonus = h.classId === 'dwarf' ? (h.traits.includes('gem_appraiser') ? 1.3 : 1.2) : 1;
      value = Math.floor(value * bonus);
    }
    if (!value) return;
    ui.s.guild.gold += value;
    removeItem(h, it.uid);
    ui.bump();
    void ui.save();
  }

  function quickEquip(h: Hero, it: Item) {
    equipItem(undefined, h, it);
    ui.bump();
    void ui.save();
  }

  function repair(h: Hero) {
    const cost = maxLife(h) - h.life;
    if (h.classId !== 'kukla' || cost <= 0 || ui.s.guild.gold < cost) return;
    ui.s.guild.gold -= cost;
    h.life = maxLife(h);
    ui.bump();
    void ui.save();
  }
</script>

{#if showCreation}
  <Creation count={creationCount} onDone={() => (showCreation = false)} onCancel={() => (showCreation = false)} />
{:else}
  <div class="guild" style={`background-image: linear-gradient(180deg, rgba(12,20,18,.35), rgba(12,20,18,.9)), url(${art(tab === 'market' ? 'scenes/shop' : 'scenes/guild_hall')})`}>
    <header class="topbar">
      <div>
        <p class="eyebrow">The Guild Hall</p>
        <h1>{tab === 'roster' ? 'Your Company' : tab === 'embark' ? 'Prepare the Delve' : 'The Market'}</h1>
      </div>
      <div class="treasury"><span>✦</span><strong>{ui.s.guild.gold}</strong><small>gp</small></div>
    </header>

    {#if tab === 'roster'}
      <main class="content scroll">
        <section class="stats panel">
          <div><strong>{roster.length}</strong><span>heroes</span></div>
          <div><strong>{ui.s.guild.clues}</strong><span>clues</span></div>
          <div><strong>{ui.s.guild.adventuresCompleted}</strong><span>delves won</span></div>
        </section>
        <div class="section-title"><h2>Roster</h2><span class="pill teal">{aliveRoster.length} ready</span></div>
        {#if roster.length === 0}
          <section class="panel empty"><h3>A guild awaits its first heroes</h3><p>Recruit a champion, then gather a party for the darkness below.</p></section>
        {:else}
          <section class="hero-list">
            {#each roster as h (h.id)}
              <article class="hero-card panel" class:fallen={h.status !== 'ok'}>
                <button class="hero-tap" onclick={() => (ui.sheetHero = h.id)} aria-label={`Open ${h.name}'s hero sheet`}>
                  <img class="portrait" src={art(`portraits/${h.portrait}`)} alt="" />
                  <div class="hero-info"><h3>{h.name}</h3><p class="muted">L{h.level} · {classLabel(h)}</p><div class="life-row"><span>Life {h.life}/{maxLife(h)}</span><div class="lifebar"><i style={`width:${Math.max(0, Math.min(100, h.life / maxLife(h) * 100))}%`}></i></div></div></div>
                  <span class:bad={h.status !== 'ok'} class="status">{h.status === 'ok' ? 'Ready' : h.status}</span>
                </button>
                <div class="card-actions"><button class="btn small" onclick={() => (ui.sheetHero = h.id)}>Hero sheet</button>{#if h.status === 'ok'}<button class="btn small quiet" onclick={() => retire(h)}>Retire</button>{/if}</div>
              </article>
            {/each}
          </section>
        {/if}
        <div class="action-row"><button class="btn primary" onclick={() => openCreation(1)}>＋ Recruit hero</button><button class="btn" onclick={() => aliveRoster.length < 4 ? openCreation(4) : (tab = 'embark')}>Assemble a party</button></div>
        <button class="grave-toggle" onclick={() => (showGraveyard = !showGraveyard)}>{showGraveyard ? '⌃ Hide' : '⌄ Show'} graveyard · {ui.s.guild.graveyard.length}</button>
        {#if showGraveyard}
          <section class="panel graveyard"><p class="muted small">The fallen may return from beyond the veil for 1,000 gp. Madness and the no-resurrect condition bar the rite.</p>
            {#each ui.s.guild.graveyard as h (h.id)}
              <div class="grave-row"><img class="portrait tiny-portrait" src={art(`portraits/${h.portrait}`)} alt="" /><span class="grow"><strong>{h.name}</strong><small class="muted"> L{h.level} {classLabel(h)}</small></span><button class="btn small" disabled={h.madness > 0 || h.conditions.some((c) => c.id === 'no_resurrect') || ui.s.guild.gold < 1000} onclick={() => bringBack(h)}>Resurrect · 1000 gp</button></div>
            {/each}
          </section>
        {/if}
      </main>
    {:else if tab === 'embark'}
      <main class="content scroll">
        <section class="panel intro"><h2>Choose your company</h2><p>Select one to four living heroes. Positions <b>1–2 march in front</b>; positions <b>3–4 bring up the rear</b>.</p></section>
        <div class="selection-grid">{#each aliveRoster as h (h.id)}<button class:selected={selectedParty.includes(h.id)} class="party-pick" onclick={() => toggleParty(h)}><img class="portrait" src={art(`portraits/${h.portrait}`)} alt="" /><b>{h.name}</b><small>L{h.level} {classLabel(h)}</small>{#if selectedParty.includes(h.id)}<span class="check">{marchingOrder.indexOf(h.id) + 1}</span>{/if}</button>{/each}</div>
        {#if selectedParty.length}<section class="panel balance"><div class="section-title"><h3>Party balance</h3><span>{selectedParty.length}/4</span></div>{#if warnings.length}<p class="warning">⚠ {warnings.join(' · ')}</p>{:else}<p class="good-text">This company covers the essentials.</p>{/if}</section>{/if}
        <section class="panel"><div class="section-title"><h3>Adventure</h3></div><div class="segmented"><button class:selected={adventure === 'random'} onclick={() => (adventure = 'random')}>Random Dungeon</button><button class:selected={adventure === 'witch'} onclick={() => (adventure = 'witch')}>The Witch's Cave</button></div><p class="muted small">{adventure === 'witch' ? 'An introductory adventure, best with the eight core classes.' : 'A fresh dungeon generated from the tables.'}</p></section>
        {#if selectedParty.length}<section class="panel prepare"><h3>Marching order</h3>{#each marchingOrder as id, i}<div class="order-row"><span class="order-num">{i + 1}</span><strong class="grow">{roster.find((h) => h.id === id)?.name}</strong><button class="btn small" disabled={i === 0} onclick={() => moveOrder(id, -1)}>↑</button><button class="btn small" disabled={i === marchingOrder.length - 1} onclick={() => moveOrder(id, 1)}>↓</button></div>{/each}<p class="muted small">Front positions take the brunt of corridor attacks; rear positions are safer but may be unable to fight.</p>
          <label class="field">Lantern bearer<select onchange={(e) => chooseBearer((e.currentTarget as HTMLSelectElement).value)}><option value="">Choose a hero holding a lantern…</option>{#each partyHeroes.filter(hasLantern) as h}<option value={h.id} selected={lanternBearer === h.id}>{h.name}</option>{/each}</select></label>
          {#if !partyHasLantern && !partyHasIllusionist}<p class="warning">This expedition needs a lantern bearer. Buy one in the Market, or recruit an illusionist whose magic illuminates the way.</p><button class="btn block" onclick={() => (tab = 'market')}>Go to Market</button>{:else if !partyHasLantern}<p class="muted small">The illusionist's light means no lantern is needed.</p>{/if}
        </section>{/if}
      </main>
      <div class="bottom-action"><button class="btn primary block" disabled={!canDescend} onclick={descend}>Descend into darkness</button></div>
    {:else}
      <main class="content scroll">
        <section class="panel market-head"><h2>Market stalls</h2><p class="muted">Treasury: <b>{ui.s.guild.gold} gp</b>. Choose a bearer before buying gear.</p><div class="buyer-list">{#each aliveRoster as h}<button class:selected={buyerId === h.id} class="buyer" onclick={() => (buyerId = h.id)}><img class="portrait" src={art(`portraits/${h.portrait}`)} alt="" />{h.name}</button>{/each}</div></section>
        <div class="section-title"><h2>For sale</h2><span class="pill gold">{SHOP_LIST.length} wares</span></div>
        <section class="shop-grid">{#each SHOP_LIST as b (b.id)}<article class="shop-item panel"><img src={art(`items/${b.icon}`)} alt=""/><div class="shop-copy"><h3>{b.name}</h3><p class="muted small">{b.desc}</p><div class="row"><strong class="price">{ui.s.guild.potionRecipe && b.id === 'healing_potion' ? 50 : b.price} gp</strong><button class="btn small primary" disabled={!buyer || ui.s.guild.gold < (ui.s.guild.potionRecipe && b.id === 'healing_potion' ? 50 : b.price ?? 0)} onclick={() => b.id === 'healing_potion' && ui.s.guild.potionRecipe ? buyAtPrice(b.id, 50) : buyClicked(b.id)}>Buy</button></div>{#if buyer}<p class="tiny muted">{canUseItem(buyer, { uid: 'preview', base: b.id, name: b.name }) ?? 'Usable'} · carry allowed</p>{/if}</div></article>{/each}</section>
        {#if damageChoice}<section class="panel choice-pop"><h3>Choose {ITEM_BASES[damageChoice].name} damage</h3><div class="action-row"><button class="btn" onclick={() => buy(damageChoice!, 'slashing')}>⚔ Slashing</button><button class="btn" onclick={() => buy(damageChoice!, 'crushing')}>♜ Crushing</button></div></section>{/if}
        <div class="section-title"><h2>Sell & maintain</h2></div><section class="panel"><div class="buyer-list">{#each aliveRoster as h}<button class:selected={sellHeroId === h.id} class="buyer" onclick={() => (sellHeroId = h.id)}><img class="portrait" src={art(`portraits/${h.portrait}`)} alt="" />{h.name}</button>{/each}</div>{#if sellHero}<div class="sell-list">{#each sellHero.inventory as it (it.uid)}<div class="sell-row"><span class="grow">{it.name}{#if it.qty && it.qty > 1} ×{it.qty}{/if}</span><button class="btn small" onclick={() => sell(it)}>Sell · {it.value ?? ITEM_BASES[it.base]?.resale ?? Math.floor((ITEM_BASES[it.base]?.price ?? 0) / 2)} gp</button>{#if !sellHero.equip.main?.includes(it.uid) && !sellHero.equip.off?.includes(it.uid) && !sellHero.equip.armor?.includes(it.uid)}<button class="btn small quiet" onclick={() => quickEquip(sellHero!, it)}>Equip</button>{/if}</div>{/each}</div>{#if sellHero.classId === 'kukla' && sellHero.life < maxLife(sellHero)}<button class="btn block" disabled={ui.s.guild.gold < maxLife(sellHero) - sellHero.life} onclick={() => repair(sellHero!)}>Repair kukla · {maxLife(sellHero) - sellHero.life} gp</button>{/if}{:else}<p class="muted small">Select a hero to sell carried items or quickly equip gear.</p>{/if}</section>
      </main>
    {/if}
    <nav class="tabs"><button class:active={tab === 'roster'} onclick={() => (tab = 'roster')}>⚔<span>Roster</span></button><button class:active={tab === 'embark'} onclick={() => (tab = 'embark')}>⌁<span>Embark</span></button><button class:active={tab === 'market'} onclick={() => (tab = 'market')}>◇<span>Market</span></button><button onclick={() => (ui.showSettings = true)}>⚙<span>Settings</span></button></nav>
</div>
{/if}

<style>
  .guild { position:absolute; inset:0; background-size:cover; background-position:center; color:var(--ink); display:flex; flex-direction:column; padding-top:var(--safe-t); }
  .topbar { min-height:4.588rem; padding:0.824rem 16px 10px; display:flex; align-items:center; justify-content:space-between; color:var(--parch); text-shadow:0 2px 4px #000; }
  .topbar h1 { font-size:1.65rem; }.eyebrow { color:var(--brass-2); font-family:var(--font-head); margin:0; text-transform:uppercase; letter-spacing:.12em; font-size:.75rem; }.treasury { display:flex; align-items:baseline; gap:4px; color:var(--brass-2); font-size:1.5rem; }.treasury small { color:var(--parch-2); font-size:.75rem; }.content { flex:1; padding:0.588rem 14px calc(150px + var(--safe-b)); min-height:0; }.panel { margin-bottom:12px; }.stats { display:flex; justify-content:space-around; text-align:center; padding:0.588rem; }.stats div { display:flex; flex-direction:column; }.stats strong { font-family:var(--font-head); font-size:1.5rem; color:var(--teal); }.stats span { font-size:.78rem; color:var(--ink-soft); }.section-title { display:flex; align-items:center; justify-content:space-between; margin:14px 2px 8px; }.section-title h2 { font-size:1.25rem; }.hero-list { display:flex; flex-direction:column; gap:0.588rem; }.hero-card { padding:0.588rem; margin:0; }.hero-card.fallen { opacity:.72; }.hero-tap { border:0; background:transparent; padding:0; width:100%; display:flex; align-items:center; gap:0.588rem; text-align:left; }.hero-tap .portrait { width:4.6rem; height:6rem; object-position: center 20%; }.hero-info { flex:1; min-width:0; }.hero-info h3 { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }.life-row { font-size:.78rem; margin-top:6px; }.lifebar { margin-top:3px; }.status { color:var(--good); font-size:.76rem; white-space:nowrap; }.status.bad { color:var(--oxblood); }.card-actions { display:flex; justify-content:flex-end; gap:0.412rem; margin-top:7px; }.action-row { display:flex; gap:0.471rem; margin:12px 0; }.action-row > * { flex:1; }.empty { text-align:center; padding:1.412rem 14px; }.grave-toggle { width:100%; min-height:2.824rem; color:var(--parch); background:rgba(20,25,21,.75); border:1px solid var(--brass); border-radius:8px; }.graveyard { padding:0.588rem; }.grave-row { display:flex; align-items:center; gap:0.471rem; padding:0.471rem 0; border-bottom:1px solid rgba(43,33,22,.18); }.tiny-portrait { width:2.235rem; height:2.824rem; }.grave-row .btn { font-size:.78rem; padding:0.294rem 7px; }.intro { background:rgba(239,226,196,.94); }.selection-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:0.412rem; margin-bottom:12px; }.party-pick { min-height:7.529rem; padding:0.353rem 3px; position:relative; display:flex; align-items:center; flex-direction:column; gap:3px; background:var(--parch-2); border:2px solid var(--teal); border-radius:8px; }.party-pick.selected { background:var(--verdigris); color:var(--parch); border-color:var(--brass-2); }.party-pick .portrait { width:100%; height:auto; aspect-ratio:3/4; object-position:center 20%; }.party-pick small { font-size:.68rem; text-align:center; }.check { position:absolute; right:3px; top:3px; border-radius:50%; background:var(--brass); color:var(--ink); width:1.353rem; height:1.353rem; text-align:center; padding-top:2px; }.balance .warning,.warning { color:var(--oxblood); }.good-text { color:var(--good); }.segmented { display:flex; gap:4px; }.segmented button { flex:1; min-height:2.824rem; padding:0.353rem; border:1px solid var(--teal); background:var(--parch-2); border-radius:6px; }.segmented button.selected { background:var(--teal); color:var(--parch); }.prepare h3 { margin-bottom:8px; }.order-row { display:flex; align-items:center; gap:0.412rem; border-top:1px solid rgba(43,33,22,.18); padding:0.353rem 0; }.order-num { background:var(--teal); color:var(--parch); border-radius:50%; width:1.588rem; height:1.588rem; text-align:center; padding-top:3px; }.field { display:flex; flex-direction:column; gap:0.294rem; margin-top:10px; font-family:var(--font-head); }.field select,.field input,.field textarea { min-height:2.824rem; border:2px solid var(--teal); border-radius:6px; background:var(--parch-2); color:var(--ink); padding:0.471rem; font:inherit; }.bottom-action { position:absolute; z-index:2; bottom:calc(4.4rem + var(--safe-b)); left:14px; right:14px; }.tabs { position:absolute; bottom:0; left:0; right:0; padding:0.353rem 8px calc(6px + var(--safe-b)); display:flex; justify-content:space-around; background:rgba(21,18,14,.94); border-top:2px solid var(--brass); }.tabs button { color:var(--parch-2); background:transparent; border:0; min-height:2.824rem; min-width:3.765rem; display:flex; flex-direction:column; align-items:center; gap:1px; font-size:1.25rem; }.tabs button span { font-size:.72rem; font-family:var(--font-head); }.tabs button.active { color:var(--brass-2); }.market-head { padding:0.706rem; }.buyer-list { display:flex; gap:0.412rem; overflow-x:auto; padding:4px 0; }.buyer { min-width:3.882rem; min-height:4.353rem; display:flex; flex-direction:column; align-items:center; gap:2px; background:var(--parch-2); border:2px solid var(--teal); border-radius:7px; padding:4px; font-size:.72rem; }.buyer.selected { background:var(--verdigris); color:var(--parch); border-color:var(--brass); }.buyer .portrait { width:2.8rem; height:3.6rem; }.shop-grid { display:flex; flex-direction:column; gap:0.471rem; }.shop-item { margin:0; padding:0.529rem; display:flex; gap:0.529rem; }.shop-item > img { width:2.941rem; height:2.941rem; object-fit:contain; align-self:flex-start; }.shop-copy { flex:1; min-width:0; }.shop-copy h3 { font-size:1rem; }.shop-copy p { margin:.25em 0; }.price { color:var(--oxblood); }.choice-pop { position:sticky; bottom:8px; z-index:3; }.sell-list { margin-top:8px; }.sell-row { display:flex; align-items:center; gap:0.353rem; padding:0.412rem 0; border-top:1px solid rgba(43,33,22,.18); font-size:.9rem; }.sell-row .btn { font-size:.75rem; padding:4px 7px; }.sell-row + .sell-row { }.sell-row .grow { min-width:0; }.shop-item .tiny { min-height:1em; }.shop-item .row { margin-top:4px; }
</style>
