import type { Game } from '../game';
import type { Hero } from '../types';
import type { Action } from './actions';
import { pickFoe } from './actions';
import { attackFoe, applyMajorDamage, applyMinorKills } from './resolve';
import { cs, hc, liveFoes, meleeEligible } from './util';
import { tierOf, mainHand, offHand, hasShieldInHand, maxLife } from '../hero';
import { isMinor, isUnliving, hasTag, foeLevel } from '../foe';
import { addCondition } from '../effects';

/** Active traits usable as (or alongside) an action during combat. */
export function traitActions(g: Game, h: Hero): Action[] {
  const a: Action[] = [];
  const c = cs(g);
  const T = tierOf(h.level);
  const t = (id: string) => h.traits.includes(id);
  const free = (scope: 'adventure' | 'combat', id: string) => !g.isSpent(h, scope, id);
  const use = (scope: 'adventure' | 'combat', id: string) => g.spend(h, scope, id);

  if (t('berserk_fighting') && free('adventure', 'berserk_fighting'))
    a.push({ id: 'berserk', label: 'Berserk Fighting', group: 'ability', desc: '+1 damage on all attacks this combat; afterwards −1 Attack for 6 tiles. Free action.', run: async () => {
      use('adventure', 'berserk_fighting');
      c.flags[`berserk_${h.id}`] = true;
      g.log('good', `${h.name} goes berserk!`);
      return false;
    } });
  if (t('chant_of_valor') && free('adventure', 'chant_of_valor'))
    a.push({ id: 'chant', label: 'Chant of Valor', group: 'ability', desc: 'Free action: all allies +1 to Attack this turn.', run: async () => {
      use('adventure', 'chant_of_valor');
      c.flags.chant_of_valor = c.turn;
      g.log('good', `${h.name} raises a chant of valor!`);
      return false;
    } });
  if (t('divine_protection') && free('adventure', 'divine_protection'))
    a.push({ id: 'divprot', label: 'Divine Protection', group: 'ability', desc: '+1 Defense and Saves for this combat. Free action.', run: async () => {
      use('adventure', 'divine_protection');
      addCondition(h, { id: 'divine_protection', label: 'Divine Protection', until: 'combat' });
      return false;
    } });
  if (t('blessed_touch') && free('adventure', 'blessed_touch'))
    a.push({ id: 'touch', label: 'Blessed Touch', group: 'magic', desc: `Heal ${T} Life on someone you touch.`, run: async () => {
      const tgt = await g.pickHero('Touch whom?', g.party().filter((x) => x.life < maxLife(x)), undefined, true);
      if (!tgt) return false;
      use('adventure', 'blessed_touch');
      g.heal(tgt, T, 'Blessed Touch');
      return true;
    } });
  if (t('bladesong') && free('adventure', 'bladesong'))
    a.push({ id: 'bladesong', label: 'Bladesong', group: 'ability', desc: '+1 Attack with swords, spears or bows this encounter. Free.', run: async () => {
      use('adventure', 'bladesong');
      c.flags[`bladesong_${h.id}`] = true;
      return false;
    } });
  if (t('elidras_melody') && free('adventure', 'elidras_melody'))
    a.push({ id: 'melody', label: "Elidra's Melody", group: 'ability', desc: 'A creature does not attack this turn.', run: async () => {
      const f = await pickFoe(g, 'Calm which creature?');
      if (!f) return false;
      use('adventure', 'elidras_melody');
      f.state.noAttackTurn = c.turn;
      g.log('good', `${f.name} is soothed by the melody.`);
      return true;
    } });
  if (t('rootbind') && free('adventure', 'rootbind'))
    a.push({ id: 'rootbind', label: 'Rootbind', group: 'ability', desc: 'A Foe loses its next turn.', run: async () => {
      const f = await pickFoe(g, 'Bind which foe?', (f) => !hasTag(f, 'slime') && !hasTag(f, 'elemental') && !f.defId.includes('wraith') && !f.defId.includes('ghost'));
      if (!f) return false;
      use('adventure', 'rootbind');
      f.state.noAttackTurn = c.turn;
      g.log('good', `Roots erupt and bind ${f.name}!`);
      return true;
    } });
  if (t('wildform') && free('adventure', 'wildform'))
    a.push({ id: 'wildform', label: 'Wildform', group: 'ability', desc: 'Become a small animal: +1/2L Defense, no attacks, evade freely.', run: async () => {
      use('adventure', 'wildform');
      hc(g, h).wildform = true;
      return true;
    } });
  if (t('hazy_veil') && free('adventure', 'hazy_veil'))
    a.push({ id: 'veil', label: 'Hazy Veil', group: 'ability', desc: `+${T} Defense this encounter. Free.`, run: async () => {
      use('adventure', 'hazy_veil');
      addCondition(h, { id: 'hazy_veil', label: 'Hazy Veil', until: 'combat' });
      return false;
    } });
  if (t('misdirection') && free('adventure', 'misdirection'))
    a.push({ id: 'misdirect', label: 'Misdirection', group: 'ability', desc: 'A foe attacks a phantom until it is hit.', run: async () => {
      const f = await pickFoe(g, 'Misdirect which foe?', (f) => !isUnliving(f));
      if (!f) return false;
      use('adventure', 'misdirection');
      f.state.phantomTarget = h.id;
      return true;
    } });
  if (melee(g, h)) {
    if ((t('distracting_feint')) && free('combat', 'distracting_feint'))
      a.push({ id: 'feint', label: 'Distracting Feint', group: 'ability', desc: 'A foe skips its next attack. Free.', run: async () => {
        const f = await pickFoe(g, 'Feint at…');
        if (!f) return false;
        use('combat', 'distracting_feint');
        f.state.skipAttacks = ((f.state.skipAttacks as number) ?? 0) + 1;
        return false;
      } });
    if (t('acrobat_distract') && free('combat', 'acrobat_distract'))
      a.push({ id: 'adistract', label: 'Distract (−1 L this turn)', group: 'ability', run: async () => {
        const f = await pickFoe(g, 'Distract…');
        if (!f) return false;
        use('combat', 'acrobat_distract');
        f.levelMods.push({ label: 'Distracted (turn)', value: -1 });
        f.state.clearTurnMods = c.turn;
        return false;
      } });
    if (t('taunt') && free('combat', 'taunt'))
      a.push({ id: 'taunt', label: 'Taunt', group: 'ability', desc: `A foe's L −${T} on its next turn (not Weird or Unliving).`, run: async () => {
        const f = await pickFoe(g, 'Taunt…', (f) => f.category !== 'weird' && (!isUnliving(f) || hasTag(f, 'vampire')));
        if (!f) return false;
        use('combat', 'taunt');
        f.levelMods.push({ label: 'Taunted (turn)', value: -T });
        f.state.clearTurnMods = c.turn;
        return false;
      } });
    if (t('quick_feint') && free('adventure', 'quick_feint'))
      a.push({ id: 'qfeint', label: 'Quick Feint', group: 'ability', desc: "Forgo an attack: the foe's L −2 vs your next attack.", run: async () => {
        const f = await pickFoe(g, 'Feint at…');
        if (!f) return false;
        use('adventure', 'quick_feint');
        hc(g, h).attackMods.push({ label: 'Quick Feint', value: 2, foe: f.uid });
        return true;
      } });
    if (t('hair_bind') && free('adventure', 'hair_bind'))
      a.push({ id: 'hairbind', label: 'Hair Bind', group: 'ability', desc: 'Restrain a foe for 2 turns (−2 L).', run: async () => {
        const f = await pickFoe(g, 'Bind…', (f) => !hasTag(f, 'slime') && !hasTag(f, 'elemental') && !hasTag(f, 'giant'));
        if (!f) return false;
        use('adventure', 'hair_bind');
        f.levelMods.push({ label: 'Hair Bind', value: -2 });
        f.state.hairBindUntil = c.turn + 2;
        return true;
      } });
    if (t('hidden_blade') && free('combat', 'hidden_blade'))
      a.push({ id: 'hblade', label: 'Hidden Blade', group: 'attack', desc: `Free action surprise attack, +${T} damage.`, run: async () => {
        const f = await pickFoe(g, 'Strike…');
        if (!f) return false;
        use('combat', 'hidden_blade');
        await attackFoe(g, h, f, { weapon: mainHand(h), ranged: false, extraDamage: isMinor(f) ? 0 : T, label: 'Hidden Blade' });
        return false;
      } });
  }
  if (t('shieldwall') && free('adventure', 'shieldwall') && hasShieldInHand(h))
    a.push({ id: 'shieldwall', label: 'Shieldwall', group: 'ability', desc: 'You and an adjacent ally with a shield gain +1 Defense vs melee. Free.', run: async () => {
      const mo = g.s.dungeon?.marchingOrder ?? [];
      const i = mo.indexOf(h.id);
      const partner = mo[i % 2 === 0 ? i + 1 : i - 1];
      use('adventure', 'shieldwall');
      c.flags[`shieldwall_${h.id}`] = true;
      if (partner && hasShieldInHand(g.hero(partner))) c.flags[`shieldwall_${partner}`] = true;
      return false;
    } });
  if (t('challenge') && !c.flags[`challenge_${h.id}`])
    a.push({ id: 'challenge', label: 'Challenge', group: 'ability', desc: 'A foe must target only you for the whole combat. Free.', run: async () => {
      const f = await pickFoe(g, 'Challenge…');
      if (!f) return false;
      c.flags[`challenge_${h.id}`] = f.uid;
      return false;
    } });
  if (t('clockwork_grenadier') && free('adventure', 'clockwork_grenadier') && !c.foesFirstSurprise && c.turn === 1)
    a.push({ id: 'cgren', label: 'Clockwork Grenade', group: 'attack', desc: '2 damage to a Major Foe or slay 2 Minor Foes.', run: async () => {
      const f = await pickFoe(g, 'Throw at…');
      if (!f) return false;
      use('adventure', 'clockwork_grenadier');
      if (isMinor(f)) await applyMinorKills(g, h, f, 2, {});
      else await applyMajorDamage(g, h, f, 2, {});
      return true;
    } });
  if (t('spectral_trickster') && free('adventure', 'spectral_trickster') && c.flags[`castIllusion_${h.id}`])
    a.push({ id: 'trickster', label: 'Spectral Trickster strike', group: 'attack', run: async () => {
      const f = await pickFoe(g, 'Strike…');
      if (!f) return false;
      use('adventure', 'spectral_trickster');
      await attackFoe(g, h, f, { weapon: mainHand(h), ranged: false, extraMods: [{ label: 'Spectral Trickster', value: T }] });
      return false;
    } });
  void offHand;
  void foeLevel;
  void liveFoes;
  return a;
}

function melee(g: Game, h: Hero) {
  return meleeEligible(g, h);
}
