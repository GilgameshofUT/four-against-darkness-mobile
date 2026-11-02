import type { Game } from '../game';
import type { Foe, Hero } from '../types';
import { SPELLS } from '../../data/spells';
import { foeLevel, isMinor, isUnliving, immune, fspecial, hasTag, foeAlive, fdef } from '../foe';
import { tierOf, isAlive } from '../hero';
import { addCondition, applyBlessing, blessTargets } from '../effects';
import { applyMinorKills, applyMajorDamage } from './resolve';
import { pickFoe } from './actions';
import { cs, hc, liveFoes } from './util';

/** Spellcasting roll vs target L (and first vs MR if any). */
export async function spellRoll(g: Game, h: Hero, spell: string, bonus: number, target: number, extraLabel = ''): Promise<{ ok: boolean; total: number }> {
  const c = g.s.combat;
  const mods = [{ label: 'Casting', value: bonus }];
  const pen = c ? liveFoes(g).map((f) => fspecial(f, 'spell_penalty')).filter(Boolean) : [];
  if (pen.length) mods.push({ label: 'Distracting noise', value: -1 });
  const res = await g.heroRoll({ hero: h, kind: 'spell', label: `${SPELLS[spell].name}${extraLabel}`, mods, target, context: `Spellcasting vs L${target}` });
  return { ok: !!res.success, total: res.total };
}

const illusionImmune = (f: Foe) => f.category === 'vermin' || isUnliving(f) || f.defId === 'doppelganger';

/** Returns false if the cast was cancelled before any effect. */
export async function castEffect(g: Game, h: Hero, id: string, bonus: number, _src: string): Promise<boolean | void> {
  const c = g.s.combat;
  const T = tierOf(h.level);
  const inCombat = !!c;
  switch (id) {
    case 'lightning':
    case 'lightning_strike': {
      const f = await pickFoe(g, 'Lightning strikes…', (f) => !hasTag(f, 'electric'));
      if (!f) return false;
      if (immune(f, 'spells') || immune(f, 'lightning') || immune(f, 'spells_nonfire')) return void g.log('combat', `${f.name} is unaffected by the lightning.`);
      const r = await spellRoll(g, h, id, bonus, foeLevel(g, f));
      if (!r.ok) return void g.log('combat', 'The bolt goes wide.');
      if (f.defId === 'cavern_sludge') f.levelMods.push({ label: 'Lightning', value: -2 });
      if (isMinor(f)) await applyMinorKills(g, h, f, 1, { magical: true, spell: true });
      else {
        await applyMajorDamage(g, h, f, 2, { magical: true });
        h.milestones.lightning_dmg = (h.milestones.lightning_dmg ?? 0) + 2;
      }
      return;
    }
    case 'fireball': {
      const f = await pickFoe(g, 'Fireball at…');
      if (!f) return false;
      if (immune(f, 'spells') || (hasTag(f, 'dragon') && f.tags.includes('fire'))) return void g.log('combat', `${f.name} shrugs off the flames.`);
      const flam = (fspecial(f, 'flammable')?.value ?? 0) + (f.state.flammable ? 2 : 0) + (fspecial(f, 'fire_bonus') ? T : 0);
      const r = await spellRoll(g, h, id, bonus + flam, foeLevel(g, f));
      c && (c.fireUsedThisTurn = true);
      if (c) for (const x of liveFoes(g)) if (fspecial(x, 'web_no_flee')) c.flags.webBurned = true;
      if (fspecial(f, 'fireball_kills_all')) return void (await applyMinorKills(g, h, f, f.count, { magical: true, fire: true, spell: true }));
      if (isMinor(f)) {
        const n = Math.max(1, r.total - foeLevel(g, f));
        await applyMinorKills(g, h, f, n, { magical: true, fire: true, spell: true });
      } else if (r.ok) await applyMajorDamage(g, h, f, f.defId === 'mummy' ? 2 : 1, { magical: true, fire: true });
      else g.log('combat', 'The fireball splashes harmlessly.');
      return;
    }
    case 'sleep': {
      const f = await pickFoe(g, 'Sleep on…', (f) => !isUnliving(f) && !immune(f, 'sleep') && f.level < 11 && !hasTag(f, 'dragon'));
      if (!f) return inCombat ? (g.log('info', 'Nothing here can be put to sleep.'), false) : false;
      const r = await spellRoll(g, h, id, bonus, foeLevel(g, f));
      if (!r.ok) return void g.log('combat', `${f.name} resist${isMinor(f) ? '' : 's'} the spell.`);
      if (isMinor(f)) {
        const n = Math.min(f.count, g.roll('d6') + h.level);
        f.count -= n;
        f.subdued = (f.subdued ?? 0) + n;
        h.milestones.slumber = (h.milestones.slumber ?? 0) + n * f.level;
        g.log('good', `${n} ${f.name} fall asleep and are bound!`);
        if (f.count <= 0) cs(g).minorDefeated = true;
      } else {
        f.state.asleep = true;
        f.life = 0;
        f.subdued = 1;
        cs(g).majorDefeated.push(f.uid);
        h.milestones.slumber = (h.milestones.slumber ?? 0) + f.level;
        g.log('good', `${f.name} falls into a deep sleep — helpless!`);
      }
      markNonViolent(g);
      return;
    }
    case 'protection':
    case 'barkskin': {
      const t = await g.pickHero(`${SPELLS[id].name} on…`, g.party());
      if (!t) return false;
      addCondition(t, { id, label: SPELLS[id].name, until: 'combat' });
      g.log('good', `${t.name} is protected by ${SPELLS[id].name}.`);
      return;
    }
    case 'blessing': {
      const targets = blessTargets(g);
      if (!targets.length) return void g.log('info', 'No one needs a Blessing.');
      const t = await g.pickHero('Bless whom?', targets, undefined, true);
      if (!t) return false;
      await applyBlessing(g, t);
      return;
    }
    case 'escape': {
      if (c) {
        hc(g, h).fled = true;
        c.flags[`escaped_${h.id}`] = true;
      } else if (g.s.dungeon) g.s.dungeon.currentTile = g.s.dungeon.regions[0].start;
      g.log('good', `${h.name} vanishes and reappears at the dungeon entrance!`);
      return;
    }
    // ---- Druid ----
    case 'disperse_vermin': {
      const f = await pickFoe(g, 'Disperse which vermin?', (f) => f.category === 'vermin' && !isUnliving(f));
      if (!f) return false;
      const r = await spellRoll(g, h, id, h.level * 2 + (bonus - h.level), foeLevel(g, f));
      if (r.ok) {
        const n = Math.min(f.count, Math.floor(r.total / foeLevel(g, f)));
        f.count -= n;
        g.log('good', `${n} ${f.name} scatter into the dark.`);
        f.treasure.none = true;
      }
      return;
    }
    case 'summon_beast': {
      cs(g).allies.push({ id: g.uid('a'), name: 'Summoned Beast', kind: 'beast', level: 3, life: 5, attackBonus: 3, defenseBonus: 0, heroId: h.id, art: 'monsters/summoned_beast' });
      g.log('good', 'A great bear answers the call!');
      return;
    }
    case 'water_jet': {
      const f = await pickFoe(g, 'Water Jet at…');
      if (!f) return false;
      const r = await spellRoll(g, h, id, bonus, foeLevel(g, f));
      if (!r.ok) return;
      const opts = [] as { value: string; label: string }[];
      if (hasTag(f, 'fire')) opts.push({ value: 'fire', label: '2 damage (fire creature)' });
      if (f.category === 'vermin') opts.push({ value: 'vermin', label: 'Disperse 2 vermin' });
      if (f.category === 'minion') opts.push({ value: 'minion', label: 'Knock out 1 minion' });
      if (!isMinor(f)) opts.push({ value: 'distract', label: 'Distract: the party may flee freely' });
      const tarred = g.party().filter((x) => x.conditions.some((k) => k.id === 'tarred'));
      if (tarred.length) opts.push({ value: 'tar', label: 'Wash tar off an ally' });
      if (!opts.length) return;
      const pick = await g.choose('Water Jet effect', opts);
      if (pick === 'fire') await applyMajorDamage(g, h, f, 2, { magical: true });
      if (pick === 'vermin' || pick === 'minion') {
        const n = Math.min(f.count, pick === 'vermin' ? 2 : 1);
        f.count -= n;
        if (pick === 'minion') f.subdued = (f.subdued ?? 0) + n;
        g.log('good', `${n} ${f.name} ${pick === 'vermin' ? 'washed away' : 'knocked out'}.`);
      }
      if (pick === 'distract') cs(g).flags.freeFlee = true;
      if (pick === 'tar') {
        const t = await g.pickHero('Wash whom?', tarred);
        if (t) t.conditions = t.conditions.filter((k) => k.id !== 'tarred' && k.id !== 'tar_eyes');
      }
      return;
    }
    case 'bear_form': {
      cs(g).flags[`bear_${h.id}`] = true;
      h.conditions.push({ id: 'bear_form', label: 'Bear Form', value: Math.max(8, h.life), tilesLeft: 0 });
      g.log('good', `${h.name} transforms into a great bear!`);
      return;
    }
    case 'warp_wood': {
      const f = c ? await pickFoe(g, 'Warp which wooden foe?', (f) => hasTag(f, 'plant') || hasTag(f, 'wood') || !!fspecial(f, 'warp_wood_vulnerable') || f.defId === 'toadstool_knights') : undefined;
      if (!f) return c ? (g.log('info', 'No wooden foes.'), false) : true;
      const ww = fspecial(f, 'warp_wood_vulnerable');
      if (ww) {
        f.level = Math.max(1, f.level - ww.levelLoss);
        g.log('good', `${f.name}'s fungal armor and blade crumble! (L${f.level})`);
      } else if (f.defId === 'toadstool_knights') {
        f.state.shields = 0;
        g.log('good', 'All toadstool caps warp and crack!');
      } else await applyMajorDamage(g, h, f, 2, { magical: true });
      return;
    }
    case 'spiderweb':
    case 'entangle': {
      const f = await pickFoe(g, 'Entangle which foe?', (f) => !hasTag(f, 'spider') && !hasTag(f, 'elemental') && (id === 'entangle' || !hasTag(f, 'fire')));
      if (!f) return false;
      f.levelMods.push({ label: 'Webbed', value: -1 });
      f.state.webbed = true;
      g.log('good', `${f.name} ${isMinor(f) ? 'are' : 'is'} tangled in sticky webs (−1 L).`);
      return;
    }
    case 'subdual':
      cs(g).flags.subdual_spell = true;
      g.log('good', 'Your blows will stun rather than kill (no −1 for Subdual).');
      return;
    // ---- Illusionist ----
    case 'illusionary_armor':
      addCondition(h, { id: 'illusionary_armor', label: 'Illusionary Armor', until: 'combat' });
      g.log('good', `${h.name} shimmers in illusory plate (+${T} Defense).`);
      return;
    case 'mirror_image':
      hc(g, h).mirrorImages = T + 1;
      g.log('good', `${T + 1} mirror images of ${h.name} appear!`);
      return;
    case 'illusionary_fog':
      cs(g).flags.illusionary_fog = true;
      g.log('good', 'A thick illusory fog rolls in: no ranged or gaze attacks.');
      return;
    case 'phantasmal_binding': {
      const f = await pickFoe(g, 'Bind which foe?', (f) => !illusionImmune(f));
      if (!f) return false;
      const r = await spellRoll(g, h, id, bonus, foeLevel(g, f));
      if (r.ok) {
        f.state.held = true;
        f.state.heldUntil = cs(g).turn + T;
        g.log('good', `Spectral chains bind ${f.name}!`);
      }
      return;
    }
    case 'shadow_strike': {
      const f = await pickFoe(g, 'Shadow Strike at…', (f) => !illusionImmune(f));
      if (!f) return false;
      const r = await spellRoll(g, h, id, bonus, foeLevel(g, f));
      if (!r.ok) return;
      if (isMinor(f)) await applyMinorKills(g, h, f, T, { subdual: true, magical: true, spell: true });
      else await applyMajorDamage(g, h, f, T, { subdual: true, magical: h.traits.includes('shadow_adept') });
      return;
    }
    case 'specter_swarm': {
      const { checkMorale } = await import('./morale');
      for (const f of liveFoes(g)) {
        if (f.noMorale || illusionImmune(f)) continue;
        const r = await g.tableRoll(`${f.name}: Morale vs specters`, 'd6', { mods: [{ label: 'Morale', value: f.morale }] });
        if (r <= 3) f.state.cantAttack = h.id;
      }
      void checkMorale;
      return;
    }
    case 'mirage_of_fortune': {
      const f = await pickFoe(g, 'Tempt which foe?', (f) => !illusionImmune(f) && !!fdef(f).reactions.some((r) => r.type === 'bribe'));
      if (!f) return c ? (g.log('info', 'No foe here takes bribes.'), false) : false;
      const r = await spellRoll(g, h, id, bonus, foeLevel(g, f));
      if (r.ok) {
        f.fled = true;
        cs(g).flags.bribedBy = 'mirage';
        g.log('good', `${f.name} chase${isMinor(f) ? '' : 's'} the phantom treasure and let you pass!`);
        markNonViolent(g);
      }
      return;
    }
    case 'illusionary_sword':
      hc(g, h).illusorySword = T + 3;
      g.log('good', `A flaming illusory sword appears in ${h.name}'s hand!`);
      return;
    case 'disbelief': {
      for (const x of g.party()) x.conditions = x.conditions.filter((k) => !['illusionary_armor'].includes(k.id));
      if (c) for (const f of liveFoes(g)) if (f.defId === 'doppelganger') (c.flags.mimic = false), f.levelMods.push({ label: 'Revealed', value: -2 });
      g.log('good', 'All illusions are dispelled.');
      return;
    }
    case 'glamour_mask':
    case 'illusionary_servant':
    case 'illusionary_banquet':
      g.log('info', `${SPELLS[id].name} is cast.`);
      return;
    default:
      g.log('info', `${SPELLS[id]?.name ?? id} has no effect here.`);
  }
  void isAlive;
  void foeAlive;
}

function markNonViolent(g: Game) {
  if (g.s.combat) g.s.combat.flags.nonViolent = true;
}
