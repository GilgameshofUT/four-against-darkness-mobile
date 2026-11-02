<script lang="ts">
  import type { Settings } from '../../engine/types';
  import { ui } from '../store.svelte';
  import { exportSave, importSave } from '../persist';
  const vp = `${window.innerWidth}×${window.innerHeight} CSS px · DPR ${window.devicePixelRatio} · ${navigator.userAgent.match(/Android [\d.]+|iPhone OS [\d_]+/)?.[0] ?? ''}`;
  import { DEFAULT_SETTINGS } from '../../engine/state';

  let importText = $state('');
  let notice = $state('');

  const xpOptions: { value: Settings['xpSystem']; label: string; desc: string }[] = [
    { value: 'classic', label: 'Classic', desc: 'The standard advancement pace.' },
    { value: 'slow_sure', label: 'Slow & Sure', desc: 'A successful delve levels one surviving hero.' },
    { value: 'old_school', label: 'Old School', desc: 'Keep a tally and earn advancement the hard way.' },
    { value: 'slower', label: 'Slower', desc: 'A more measured campaign for long-running guilds.' },
  ];
  const fiendOptions: { value: Settings['fiendishFoes']; label: string; desc: string }[] = [
    { value: 'off', label: 'Off', desc: 'Use the normal foe tables.' },
    { value: 'mixed', label: 'Mixed', desc: 'Fiendish foes can appear alongside normal foes.' },
    { value: 'replace', label: 'Replace', desc: 'Fiendish foes replace normal results.' },
  ];

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    ui.s.settings[key] = value;
    ui.bump();
    void ui.save();
  }

  function toggle(key: keyof Settings) {
    update(key, !ui.s.settings[key] as Settings[typeof key]);
  }

  async function copySave() {
    try {
      await navigator.clipboard.writeText(exportSave(ui.s));
      notice = 'Save copied to clipboard.';
    } catch {
      notice = 'Clipboard unavailable — use the text below after selecting Export.';
    }
  }

  function loadImport() {
    try {
      const saved = importSave(importText);
      ui.game.s = saved;
      ui.screen = saved.mode === 'title' ? 'title' : saved.mode;
      ui.bump();
      void ui.save();
      notice = 'Save imported.';
      importText = '';
    } catch {
      notice = 'That save could not be read. Check that the full text was pasted.';
    }
  }

  function resetSettings() {
    ui.game.s.settings = { ...DEFAULT_SETTINGS };
    ui.bump();
    void ui.save();
  }
</script>

<div class="settings-overlay" role="presentation">
  <div class="settings-panel scroll" role="dialog" aria-label="Settings">
    <header class="settings-head"><div><p class="eyebrow">Guild options</p><h1>Settings</h1></div><button class="btn" onclick={() => (ui.showSettings = false)}>Close</button></header>
    <div class="settings-body">
      <section class="setting-group"><h2>Campaign pace</h2><div class="option-list">{#each xpOptions as option}<button class:selected={ui.s.settings.xpSystem === option.value} class="option-card" onclick={() => update('xpSystem', option.value)}><div class="row"><strong class="grow">{option.label}</strong>{#if ui.s.settings.xpSystem === option.value}<span>✓</span>{/if}</div><small>{option.desc}</small></button>{/each}</div></section>
      <section class="setting-group"><h2>Dungeon tables</h2>{@render SettingToggle('Door table', 'Use the expanded door and lock table.', ui.s.settings.doorTable, () => toggle('doorTable'))}{@render SettingToggle('Torch duration', 'Track torches by the number of tiles they light.', ui.s.settings.torchDuration, () => toggle('torchDuration'))}{@render SettingToggle('Arrow tracking', 'Track ammunition and replacement quivers.', ui.s.settings.arrowTracking, () => toggle('arrowTracking'))}{@render SettingToggle('Caverns', 'Allow cavern environments in random dungeons.', ui.s.settings.caverns, () => toggle('caverns'))}{@render SettingToggle('Fungal grottoes', 'Allow fungal environments in random dungeons.', ui.s.settings.fungal, () => toggle('fungal'))}{@render SettingToggle('Traits', 'Use the class trait choices during hero creation.', ui.s.settings.traits, () => toggle('traits'))}</section>
      <section class="setting-group"><h2>Tile limit</h2><p class="muted small">Stop a dungeon after a fixed number of explored tiles.</p><div class="segmented">{#each [0, 10, 15, 20] as n}<button class:selected={ui.s.settings.tileLimit === n} onclick={() => update('tileLimit', n)}>{n === 0 ? 'Off' : n}</button>{/each}</div></section>
      <section class="setting-group"><h2>Fiendish foes</h2><div class="option-list">{#each fiendOptions as option}<button class:selected={ui.s.settings.fiendishFoes === option.value} class="option-card" onclick={() => update('fiendishFoes', option.value)}><div class="row"><strong class="grow">{option.label}</strong>{#if ui.s.settings.fiendishFoes === option.value}<span>✓</span>{/if}</div><small>{option.desc}</small></button>{/each}</div><p class="tiny muted">Recommended once two or more heroes have reached L3.</p></section>
      <section class="setting-group"><h2>Feel</h2>{@render SettingToggle('Auto-continue dice', 'Automatically resolve dice instead of waiting for a tap. Dice tapping is core fun, so this is off by default.', ui.s.settings.autoContinue, () => toggle('autoContinue'))}{@render SettingToggle('Haptics', 'Vibrate for important rolls and moments.', ui.s.settings.haptics, () => toggle('haptics'))}{@render SettingToggle('Sound', 'Play game sounds when available.', ui.s.settings.sound, () => toggle('sound'))}</section>
      <section class="setting-group"><h2>Display</h2><p class="small muted">Screen: {vp}</p></section><section class="setting-group"><h2>Save data</h2><button class="btn block" onclick={copySave}>Export save · copy to clipboard</button><textarea class="save-box" bind:value={importText} placeholder="Paste an exported save here…"></textarea><button class="btn block" disabled={!importText.trim()} onclick={loadImport}>Import save</button>{#if notice}<p class="notice">{notice}</p>{/if}<button class="btn quiet block" onclick={resetSettings}>Reset settings to defaults</button></section>
    </div>
  </div>
</div>

{#snippet SettingToggle(label: string, desc: string, checked: boolean, onToggle: () => void)}
  <button class="setting-toggle" onclick={onToggle}><span class:enabled={checked} class="switch"><i></i></span><span class="grow"><strong>{label}</strong><small>{desc}</small></span><span>{checked ? 'On' : 'Off'}</span></button>
{/snippet}

<style>
  .settings-overlay { position:absolute; inset:0; z-index:40; background:rgba(10,12,10,.76); padding:calc(0.471rem + var(--safe-t)) 10px calc(8px + var(--safe-b)); }.settings-panel { height:100%; margin:auto; background: linear-gradient(rgba(242,230,204,.85), rgba(234,219,188,.9)), url('/art/textures/parchment.webp') center/420px repeat; border:var(--frame); border-radius:var(--radius); box-shadow:var(--shadow); display:flex; flex-direction:column; }.settings-head { padding:0.706rem 14px; display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid var(--brass); }.settings-head h1 { color:var(--teal); }.eyebrow { color:var(--oxblood); font-family:var(--font-head); text-transform:uppercase; letter-spacing:.12em; font-size:.72rem; margin:0; }.settings-body { padding:4px 14px 26px; }.setting-group { padding:0.706rem 0; border-bottom:1px solid rgba(43,33,22,.2); }.setting-group h2 { font-size:1.15rem; color:var(--teal); margin-bottom:8px; }.option-list { display:flex; flex-direction:column; gap:0.353rem; }.option-card { text-align:left; min-height:3.176rem; border:2px solid var(--teal); background:var(--parch-2); border-radius:7px; padding:0.471rem 10px; color:var(--ink); }.option-card.selected { background:var(--verdigris); color:var(--parch); border-color:var(--brass); }.option-card small { display:block; font-size:.78rem; margin-top:3px; }.segmented { display:flex; gap:0.294rem; }.segmented button { flex:1; min-height:2.824rem; border:1px solid var(--teal); background:var(--parch-2); border-radius:6px; padding:0.294rem; }.segmented button.selected { background:var(--teal); color:var(--parch); }.setting-toggle { width:100%; min-height:3.765rem; display:flex; align-items:center; gap:0.588rem; border:0; border-bottom:1px solid rgba(43,33,22,.14); background:transparent; text-align:left; color:var(--ink); }.setting-toggle small { display:block; font-size:.78rem; color:var(--ink-soft); }.setting-toggle > :last-child { font-size:.8rem; color:var(--ink-soft); }.switch { width:2.353rem; height:1.412rem; flex:none; border-radius:14px; padding:3px; background:var(--ink-soft); transition:.15s; }.switch i { display:block; width:1.059rem; height:1.059rem; background:var(--parch); border-radius:50%; transition:.15s; }.switch.enabled { background:var(--teal-2); }.switch.enabled i { transform:translateX(16px); }.save-box { width:100%; min-height:5.882rem; margin:10px 0; resize:vertical; border:2px solid var(--teal); border-radius:6px; background:var(--parch-2); color:var(--ink); padding:0.471rem; font: .78rem var(--font-body); }.notice { color:var(--good); text-align:center; }.settings-head .btn { min-height:2.588rem; }
</style>
