<script lang="ts">
  import type { ClassId } from '../../engine/types';
  import type { HeroDraft } from '../../engine/setup/create';
  import { buildHero, COMPANIONS, SWORN_ENEMIES, itemName } from '../../engine/setup/create';
  import { maxLife } from '../../engine/hero';
  import { int } from '../../engine/rng';
  import { ui, art } from '../store.svelte';
  import { CLASSES, CLASS_ORDER } from '../../data/classes';
  import { TRAITS } from '../../data/traits';
  import { STARTING_KITS } from '../../data/starting';
  import { ITEM_BASES } from '../../data/items';
  import { ILLUSIONIST_SPELLS, SPELLS } from '../../data/spells';

  let { count = 1, onDone, onCancel }: { count?: number; onDone: () => void; onCancel: () => void } = $props();
  type DraftState = HeroDraft & { selectedClass?: ClassId; selectedTrait?: string };
  let created = $state<{ classId: ClassId }[]>([]);
  const partyMode = $derived(count > 1);
  const alreadyUsedRare = $derived([...ui.s.guild.roster, ...created].filter((h) => h.classId === 'bulwark' || h.classId === 'kukla' || h.classId === 'mushroom_monk').map((h) => h.classId));
  let heroNo = $state(0);
  let step = $state(0);
  let selectedClass = $state<ClassId | null>(null);
  let detailClass = $state<ClassId | null>(null);
  let portraitIndex = $state(1);
  let name = $state('');
  let traits = $state<string[]>([]);
  let kitId = $state('');
  let damage = $state<Record<number, 'crushing' | 'slashing'>>({});
  let choices = $state<Record<string, string>>({});
  let companionId = $state('');
  let swornEnemy = $state('');
  let rolledGold = $state<{ gold: number; rolls: string[] } | null>(null);
  let rolledBuild = $state<ReturnType<typeof buildHero> | null>(null);
  let rolling = $state(false);
  let partyIntro = $state(true);

  const cls = $derived(selectedClass ? CLASSES[selectedClass] : undefined);
  const classTraits = $derived(selectedClass ? TRAITS[selectedClass] : []);
  const kits = $derived(selectedClass ? STARTING_KITS[selectedClass] : []);
  const currentKit = $derived(kits.find((k) => k.id === kitId) ?? kits[0]);
  const needsTraits = $derived(ui.s.settings.traits);
  const needsChoices = $derived(selectedClass === 'druid' || selectedClass === 'ranger' || (selectedClass === 'warrior' && traits.includes('weapon_training')) || (selectedClass === 'wizard' && (traits.includes('specialist') || traits.includes('scrapper'))) || (selectedClass === 'rogue' && traits.includes('street_thug')) || selectedClass === 'gnome');
  const stepCount = 7;

  const names: Record<string, string[]> = {
    dwarf: ['Borin', 'Dagna', 'Kelda', 'Rurik', 'Sigrun', 'Thrain', 'Brunna', 'Olin', 'Krag', 'Mira', 'Gimli', 'Hilda', 'Bram', 'Frida', 'Sten'],
    elf: ['Aelwen', 'Caelynn', 'Elian', 'Faelar', 'Lethariel', 'Nimue', 'Sylvar', 'Thalion', 'Elaria', 'Ithil', 'Lúthien', 'Ryn', 'Vaelis', 'Yavanna', 'Zoren'],
    halfling: ['Bungo', 'Clover', 'Daisy', 'Fennel', 'Marigold', 'Pip', 'Poppy', 'Rosie', 'Samwise', 'Tansy', 'Tobin', 'Wicket', 'Willow', 'Merry', 'Nettle'],
    gnome: ['Bix', 'Bumble', 'Fizz', 'Glim', 'Nim', 'Pipwick', 'Quill', 'Razz', 'Tinker', 'Wizzle', 'Zook', 'Moxie', 'Cogs', 'Dabble', 'Sprocket'],
    human: ['Alden', 'Bran', 'Cora', 'Edric', 'Fara', 'Garrick', 'Hester', 'Jory', 'Lena', 'Mara', 'Nolan', 'Orrin', 'Rowan', 'Tessa', 'Wren'],
    mushroom_monk: ['Amanita', 'Chanterelle', 'Cremini', 'Morel', 'Nori', 'Porcini', 'Shiitake', 'Truffle', 'Mycena', 'Puffball', 'Reishi', 'Spore', 'Inkcap', 'Lactarius', 'Maitake'],
    kukla: ['Dolly', 'Lace', 'Marion', 'Patch', 'Penny', 'Petal', 'Porcelain', 'Raggedy', 'Ribbon', 'Satin', 'Silk', 'Stitch', 'Taffeta', 'Topsy', 'Velvet'],
  };

  const ancestry = $derived(selectedClass === 'dwarf' ? 'dwarf' : selectedClass === 'elf' ? 'elf' : selectedClass === 'halfling' ? 'halfling' : selectedClass === 'gnome' ? 'gnome' : selectedClass === 'mushroom_monk' ? 'mushroom_monk' : selectedClass === 'kukla' ? 'kukla' : 'human');

  function resetHero() {
    selectedClass = null; detailClass = null; portraitIndex = 1; name = ''; traits = []; kitId = ''; damage = {}; choices = {}; companionId = ''; swornEnemy = ''; rolledGold = null; rolledBuild = null; rolling = false;
    step = partyMode && partyIntro ? 0 : 1;
  }

  function chooseClass(id: ClassId) {
    if (CLASSES[id].rare && alreadyUsedRare.includes(id)) return;
    selectedClass = id;
    detailClass = id;
    kitId = STARTING_KITS[id][0]?.id ?? '';
  }

  function inspectClass(id: ClassId) {
    if (CLASSES[id].rare && alreadyUsedRare.includes(id)) return;
    detailClass = id;
    // Selecting on tap makes the footer Next button (always visible) usable
    // without having to discover the detail panel below the fold.
    if (selectedClass !== id) {
      selectedClass = id;
      kitId = STARTING_KITS[id][0]?.id ?? '';
    }
    // Nudge the detail panel (and its Choose button) into view only if it is
    // currently off-screen; block:nearest avoids yanking the grid away.
    window.setTimeout(() => {
      document.getElementById('class-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 30);
  }

  function randomName() {
    if (!selectedClass) return;
    const list = names[ancestry];
    name = list[int(ui.s.rng, 0, list.length - 1)];
  }

  function toggleTrait(id: string) {
    const max = selectedClass === 'halfling' ? 2 : 1;
    if (traits.includes(id)) traits = traits.filter((x) => x !== id);
    else if (traits.length < max) traits = [...traits, id];
  }

  function rollTraits() {
    const max = selectedClass === 'halfling' ? 2 : 1;
    const picked: string[] = [];
    while (picked.length < max) {
      const t = classTraits[int(ui.s.rng, 0, classTraits.length - 1)].id;
      if (!picked.includes(t)) picked.push(t);
    }
    traits = picked;
  }

  function next() {
    if (step === 1 && !selectedClass) return;
    if (step === 2 && !name.trim()) randomName();
    if (step === 3 && needsTraits && !traits.length) return;
    if (((step === 3 && !needsTraits) || (step === 4 && needsTraits)) && !kitId) return;
    if (((step === 4 && !needsTraits) || (step === 5 && needsTraits)) && needsChoices && !choicesComplete()) return;
    if (step < stepCount - 1) step++;
  }

  function back() {
    if (step <= 1) return;
    step--;
  }

  function choicesComplete() {
    if (!selectedClass) return false;
    if (selectedClass === 'druid') return !!companionId;
    if (selectedClass === 'ranger') return !!swornEnemy;
    if (selectedClass === 'warrior' && traits.includes('weapon_training')) return !!choices.weapon_training;
    if (selectedClass === 'wizard' && traits.includes('specialist') && !choices.specialist) return false;
    if (selectedClass === 'wizard' && traits.includes('scrapper') && !choices.scrapper_weapon) return false;
    if (selectedClass === 'rogue' && traits.includes('street_thug') && !choices.street_thug) return false;
    if (selectedClass === 'gnome') return !!choices.gnome_spell;
    return true;
  }

  function draft(): HeroDraft {
    return { name, classId: selectedClass!, portrait: `${selectedClass}_${portraitIndex}`, traits, kit: kitId, damage, choices: { ...choices, ...(companionId ? { companion: companionId } : {}) }, swornEnemy: swornEnemy || undefined };
  }

  function rollGold() {
    if (rolling || rolledGold) return;
    rolling = true;
    window.setTimeout(() => {
      const result = buildHero(ui.s.rng, draft());
      rolledBuild = result;
      rolledGold = { gold: result.gold, rolls: result.rolls };
      rolling = false;
      ui.bump();
    }, 380);
  }

  async function recruit() {
    if (!rolledGold || !selectedClass) return;
    const result = rolledBuild;
    if (!result) return;
    ui.s.guild.roster.push(result.hero);
    ui.s.guild.gold += result.gold;
    created = [...created, { classId: result.hero.classId }];
    ui.bump();
    await ui.save();
    if (heroNo + 1 < count) {
      heroNo++;
      partyIntro = false;
      resetHero();
    } else onDone();
  }

  function finishIntro() { partyIntro = false; step = 1; }

  function bonus(v: string) { return v === 'none' ? 'no bonus' : v === 'half' ? '+½L' : v === 'tier' ? '+Tier' : v === 'one' ? '+1' : '+L'; }
  function armorText(id: ClassId) { const a = CLASSES[id].armor; return [a.light ? 'light' : '', a.heavy ? 'heavy' : '', a.shield ? 'shields' : ''].filter(Boolean).join(', ') || 'none'; }
  function buildPreview() { return { level: 1, classId: selectedClass!, traits, bonusLife: 0, conditions: [] } as never; }
</script>

<div class="creation">
  <header class="wizard-head"><button class="btn quiet" onclick={onCancel}>✕ Cancel</button><div class="step-mark">{partyMode ? `Hero ${heroNo + 1} of ${count}` : 'New recruit'}<small>{step === 0 ? 'Company' : `Step ${Math.min(step, 6)} of 6`}</small></div><span class="spacer"></span></header>
  <main class="wizard-scroll scroll">
    {#if step === 0}
      <section class="panel welcome"><div class="sigil">✦</div><h1>Gather your company</h1><p>Four Against Darkness rewards a balanced party. Bring healing, a trap and lock specialist, strong front-liners, and at least one source of magic.</p><h3>Eight core classes</h3><p class="muted">Warrior · Barbarian · Elf · Dwarf · Cleric · Rogue · Wizard · Halfling</p><p class="small">Rare classes are powerful but limited to one per party. You can always recruit specialists later.</p><button class="btn primary block" onclick={finishIntro}>Begin with hero 1</button></section>
      {#if created.length}<section class="panel"><h3>Current picks</h3><div class="picked-row">{#each created as p}<span class="pill">{CLASSES[p.classId].name}</span>{/each}</div></section>{/if}
    {:else if step === 1}
      <section class="panel step-card"><h2>Choose a class</h2><p class="muted">Tap a card to select it — details appear below, then Choose or tap Next.</p><div class="class-grid">{#each CLASS_ORDER as id (id)}<button class:selected={selectedClass === id} class:locked={CLASSES[id].rare && alreadyUsedRare.includes(id)} class="class-card" disabled={CLASSES[id].rare && alreadyUsedRare.includes(id)} onclick={() => inspectClass(id)}><img src={art(`portraits/${id}_1`)} alt=""/><strong>{CLASSES[id].name}</strong><small>{CLASSES[id].role}</small><span class="stars">{'★'.repeat(CLASSES[id].difficulty)}{'☆'.repeat(3 - CLASSES[id].difficulty)}</span>{#if CLASSES[id].core}<em>Core</em>{:else if CLASSES[id].rare}<em class="rare">Rare · 1</em>{/if}</button>{/each}</div></section>
      {#if detailClass}<section id="class-detail" class="panel detail"><div class="row"><h2 class="grow">{CLASSES[detailClass].name}</h2><span class="pill teal">Life {CLASSES[detailClass].lifeBase + 1} at L1</span></div><p>{CLASSES[detailClass].blurb}</p><p class="small"><b>Attack:</b> {bonus(CLASSES[detailClass].attackMelee)} melee · {bonus(CLASSES[detailClass].attackRanged)} ranged<br><b>Defense:</b> {bonus(CLASSES[detailClass].defense)} · <b>Stealth:</b> {bonus(CLASSES[detailClass].stealth)}<br><b>Saves as:</b> {CLASSES[detailClass].savesAs} · <b>Armor:</b> {armorText(detailClass)}<br><b>Weapons:</b> {CLASSES[detailClass].weapons.join(', ')}</p><p class="muted small"><b>Strengths:</b> {CLASSES[detailClass].strengths.join(' · ')}</p><button class="btn primary block" onclick={() => { chooseClass(detailClass!); next(); }}>Choose {CLASSES[detailClass].name}</button></section>{/if}
    {:else if step === 2 && selectedClass}
      <section class="panel step-card"><h2>Portrait & name</h2><p class="muted">Give this adventurer a face the guild will remember.</p><div class="portrait-options">{#each [1,2,3,4] as n}<button class:selected={portraitIndex === n} onclick={() => (portraitIndex = n)}><img class="portrait" src={art(`portraits/${selectedClass}_${n}`)} alt={`Portrait ${n}`} /></button>{/each}</div><label class="field">Hero name<input bind:value={name} maxlength="24" placeholder={CLASSES[selectedClass].name} /></label><button class="btn" onclick={randomName}>🎲 Random name</button></section>
    {:else if step === 3 && selectedClass && needsTraits}
      <section class="panel step-card"><h2>Choose traits</h2><p class="muted">{selectedClass === 'halfling' ? 'Halflings choose two traits.' : 'Choose one trait to define this hero.'}</p><div class="trait-list">{#each classTraits as t (t.id)}<button class:selected={traits.includes(t.id)} class="trait-card" onclick={() => toggleTrait(t.id)}><div class="row"><strong class="grow">{t.name}</strong>{#if t.uses}<span class="pill">{t.uses}</span>{/if}</div><p>{t.desc}</p></button>{/each}</div><button class="btn" onclick={rollTraits}>🎲 Roll {selectedClass === 'halfling' ? 'twice' : 'd6'}</button></section>
    {:else if (step === 3 && selectedClass && !needsTraits) || (step === 4 && selectedClass && needsTraits)}
      <section class="panel step-card"><h2>Starting gear</h2><p class="muted">Choose one kit. Weapon damage choices are recorded in your hero's build.</p><div class="kit-list">{#each kits as k (k.id)}<button class:selected={kitId === k.id} class="kit-card" onclick={() => (kitId = k.id)}><div class="row"><strong class="grow">{k.label}</strong>{#if kitId === k.id}<span>✓</span>{/if}</div><div class="kit-items">{#each k.items as it, i}<span><img src={art(`items/${ITEM_BASES[it.base].icon}`)} alt="" />{it.name ?? itemName(it.base, damage[i])}{#if it.qtyExpr} ({it.qtyExpr}){/if}</span>{/each}</div></button>{/each}</div>{#if currentKit}<div class="damage-choices">{#each currentKit.items as it, i}{#if it.damage === 'choose'}<div class="row"><span class="grow">{itemName(it.base, damage[i])}</span><button class:selected={damage[i] === 'slashing'} class="toggle" onclick={() => (damage = { ...damage, [i]: 'slashing' })}>Slashing</button><button class:selected={damage[i] === 'crushing'} class="toggle" onclick={() => (damage = { ...damage, [i]: 'crushing' })}>Crushing</button></div>{/if}{/each}</div>{/if}</section>
    {:else if step === 4 && selectedClass && !needsTraits}
      <section class="panel step-card"><h2>Starting gear</h2><p class="muted">Choose one kit for this hero.</p><div class="kit-list">{#each kits as k (k.id)}<button class:selected={kitId === k.id} class="kit-card" onclick={() => (kitId = k.id)}><strong>{k.label}</strong><div class="kit-items">{#each k.items as it}<span>{it.name ?? ITEM_BASES[it.base].name}</span>{/each}</div></button>{/each}</div></section>
    {:else if step === 5 && selectedClass && needsChoices}
      <section class="panel step-card"><h2>Class choices</h2><p class="muted">Make the choice that completes this build.</p>{#if selectedClass === 'druid'}{@render ChoiceList('Animal companion', Object.entries(COMPANIONS).map(([id, c]) => ({ id, name: c.name, desc: c.desc })), companionId, (v: string) => (companionId = v))}{:else if selectedClass === 'ranger'}{@render ChoiceList('Sworn enemy', SWORN_ENEMIES.map((id) => ({ id, name: id, desc: 'Gain an edge when hunting this foe.' })), swornEnemy, (v: string) => (swornEnemy = v))}{:else if selectedClass === 'gnome'}{@render ChoiceList('Illusionist spell', ILLUSIONIST_SPELLS.map((id) => ({ id, name: SPELLS[id].name, desc: SPELLS[id].desc })), choices.gnome_spell ?? '', (v: string) => (choices = { ...choices, gnome_spell: v }))}{:else if selectedClass === 'wizard' && traits.includes('specialist')} {@render ChoiceList('Specialist spell', ['lightning','sleep','fireball'].map((id) => ({ id, name: SPELLS[id].name, desc: SPELLS[id].desc })), choices.specialist ?? '', (v: string) => (choices = { ...choices, specialist: v }))}{:else}{@render ChoiceList('Weapon', [{ id:'slashing', name:'Slashing', desc:'Sword or blade.' }, { id:'crushing', name:'Crushing', desc:'Mace or blunt weapon.' }], choices.weapon_training ?? choices.scrapper_weapon ?? choices.street_thug ?? '', (v: string) => (choices = { ...choices, ...(selectedClass === 'warrior' ? { weapon_training:v } : selectedClass === 'wizard' ? { scrapper_weapon:v } : { street_thug:v }) }))}{/if}</section>
    {:else}
      <section class="panel step-card review"><h2>Review this hero</h2>{#if cls}<div class="review-head"><img class="portrait" src={art(`portraits/${selectedClass}_${portraitIndex}`)} alt=""/><div><h3>{name || cls.name}</h3><p class="muted">L1 {cls.name} · Life {maxLife(buildPreview())}</p></div></div><p>{cls.blurb}</p><h3>Traits</h3><p class="muted">{traits.map((id) => TRAITS[selectedClass!].find((t) => t.id === id)?.name).join(' · ') || 'No traits enabled'}</p><h3>Gear</h3><p class="muted">{currentKit?.items.map((it) => it.name ?? ITEM_BASES[it.base].name).join(' · ')}</p>{#if ['wizard','elf','illusionist','druid','gnome'].includes(selectedClass!)}<p class="small banner">Spells are prepared at the embark step through the dice and choice prompts.</p>{/if}{#if rolledGold}<div class="gold-roll"><span class="die">{rolledGold.gold}</span><div><b>Starting gold: {rolledGold.gold} gp</b><small>{rolledGold.rolls.join(' · ')}</small></div></div><button class="btn primary block" onclick={recruit}>Recruit {name || cls.name}</button>{:else}<button class="btn primary block" class:rolling onclick={rollGold}>{rolling ? 'Rolling…' : '🎲 Roll starting gold'}</button>{/if}{/if}</section>
    {/if}
  </main>
  {#if step > 0 && step < stepCount - 1}<footer class="wizard-actions"><button class="btn" disabled={step <= 1} onclick={back}>Back</button><button class="btn primary" disabled={(step === 1 && !selectedClass) || (step === 3 && needsTraits && !traits.length)} onclick={next}>Next</button></footer>{/if}
</div>

{#snippet ChoiceList(label: string, options: { id: string; name: string; desc: string }[], value: string, onSelect: (id: string) => void)}
  <h3>{label}</h3><div class="choice-list">{#each options as o}<button class:selected={value === o.id} class="choice-card" onclick={() => onSelect(o.id)}><strong>{o.name}</strong><small>{o.desc}</small></button>{/each}</div>
{/snippet}

<style>
  .creation { position:absolute; inset:0; z-index:10; background:radial-gradient(ellipse at 50% 15%, #2c241a 0%, #16120e 55%, #0b0907 100%); color:var(--ink); display:flex; flex-direction:column; padding-top:var(--safe-t); }.wizard-head { height:4.118rem; color:var(--parch); display:flex; align-items:center; justify-content:space-between; padding:0.471rem 14px; }.wizard-head .btn { color:var(--parch); border-color:var(--parch-3); }.step-mark { text-align:center; font-family:var(--font-head); font-size:1.1rem; }.step-mark small { display:block; font-family:var(--font-body); color:var(--parch-2); font-size:.75rem; }.spacer { width:4.824rem; }.wizard-scroll { flex:1; min-height:0; padding:0.471rem 14px 92px; }.step-card { padding:0.765rem; }.welcome { margin-top:5vh; text-align:center; padding:1.294rem 16px; }.sigil { color:var(--brass); font-size:3rem; }.welcome h1 { color:var(--teal); }.welcome .btn { margin-top:18px; }.class-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:0.353rem; }.class-card { min-height:8.529rem; display:flex; flex-direction:column; align-items:center; gap:2px; padding:4px 2px; background:var(--parch-2); border:2px solid var(--teal); border-radius:7px; color:var(--ink); }.class-card.selected { background:var(--verdigris); color:var(--parch); border-color:var(--brass-2); }.class-card.locked { opacity:.45; }.class-card img { width:100%; height:auto; aspect-ratio:3/4; object-fit:cover; object-position:center 20%; border-radius:5px; }.class-card strong { font-size:.78rem; line-height:1; text-align:center; }.class-card small { font-size:.65rem; text-align:center; }.stars { color:var(--brass); font-size:.7rem; }.class-card em { font-style:normal; font-size:.61rem; background:var(--teal); color:var(--parch); padding:1px 5px; border-radius:8px; }.class-card em.rare { background:var(--oxblood); }.detail { margin-top:10px; scroll-margin-bottom:110px; }.detail h2 { color:var(--teal); }.detail .btn.block { position:sticky; bottom:76px; }.portrait-options { display:grid; grid-template-columns:repeat(4,1fr); gap:0.471rem; margin:14px 0; }.portrait-options button { padding:3px; border:2px solid var(--teal); border-radius:8px; background:var(--parch-2); }.portrait-options button.selected { border-color:var(--brass); background:var(--verdigris); }.portrait-options .portrait { width:100%; height:auto; aspect-ratio:3/4; }.field { display:flex; flex-direction:column; gap:0.294rem; margin:12px 0; font-family:var(--font-head); }.field input { min-height:2.941rem; background:var(--parch-2); border:2px solid var(--teal); border-radius:6px; padding:0.471rem; font:inherit; color:var(--ink); }.trait-list,.kit-list,.choice-list { display:flex; flex-direction:column; gap:0.471rem; }.trait-card,.kit-card,.choice-card { text-align:left; color:var(--ink); background:var(--parch-2); border:2px solid var(--teal); border-radius:8px; padding:0.588rem; min-height:2.824rem; }.trait-card.selected,.kit-card.selected,.choice-card.selected { background:var(--verdigris); color:var(--parch); border-color:var(--brass); }.trait-card p { margin:.3em 0 0; font-size:.85rem; }.kit-items { display:flex; gap:0.471rem; flex-wrap:wrap; margin-top:8px; font-size:.8rem; }.kit-items span { display:flex; align-items:center; gap:3px; }.kit-items img { width:1.588rem; height:1.588rem; object-fit:contain; }.damage-choices { border-top:1px solid var(--parch-3); margin-top:10px; padding-top:0.471rem; }.toggle { min-height:2.353rem; padding:0.294rem 8px; border:1px solid var(--teal); background:var(--parch); border-radius:5px; }.toggle.selected { background:var(--teal); color:var(--parch); }.choice-card { display:flex; flex-direction:column; gap:3px; }.choice-card small { font-size:.8rem; }.review-head { display:flex; gap:0.706rem; align-items:center; margin:12px 0; }.review-head .portrait { width:6rem; height:8rem; }.review h3 { margin-top:12px; }.gold-roll { display:flex; gap:0.588rem; align-items:center; margin:14px 0; background:var(--parch-2); padding:0.588rem; border-radius:8px; }.die { width:2.824rem; height:2.824rem; display:grid; place-items:center; background:var(--brass); color:var(--ink); border-radius:8px; font-family:var(--font-head); font-size:1.4rem; animation:pop .35s ease; }.gold-roll small { display:block; font-size:.72rem; color:var(--ink-soft); }.wizard-actions { position:absolute; bottom:0; left:0; right:0; padding:0.588rem 14px calc(10px + var(--safe-b)); display:flex; gap:0.471rem; background:rgba(21,18,14,.96); }.wizard-actions .btn { flex:1; }.picked-row { display:flex; flex-wrap:wrap; gap:0.294rem; }
</style>
