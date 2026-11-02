import type { Game } from '../game';
import type { Hero } from '../types';
import { heroActions, pickFoe, type Action } from './actions';
import { cs, hc, liveFoes, combatHeroes, heroCanAct, allFoesDown } from './util';
import { foeAlive, isMinor } from '../foe';
import { maxLife } from '../hero';
import { applyMinorKills, applyMajorDamage } from './resolve';

export type PartyChoice = 'end' | 'flee' | 'withdraw' | 'smoke';

/** One PC turn. rangedOnly = the pre-melee ranged/spell phase after being surprised. Returns a party-level choice if made. */
export async function partyTurn(g: Game, opts: { rangedOnly?: boolean; canWithdraw: boolean }): Promise<PartyChoice | undefined> {
  const c = cs(g);
  for (const h of combatHeroes(g)) {
    const x = hc(g, h);
    x.acted = false;
    x.parry = false;
  }
  for (;;) {
    if (allFoesDown(g) || !g.party().length) return;
    if (c.flags.smokeFlee) return 'smoke';
    const heroes = combatHeroes(g);
    const ready = heroes.filter((h) => !heroCanAct(g, h) && (!opts.rangedOnly || heroActions(g, h).some((a) => rangedish(a) && !a.disabled)));
    const options = heroes.map((h) => ({
      value: h.id,
      label: h.name,
      desc: heroCanAct(g, h) ?? (opts.rangedOnly && !ready.includes(h) ? 'No ranged attack or spell ready' : `${h.life}/${maxLife(h)} Life`),
      disabled: ready.includes(h) ? false : heroCanAct(g, h) ?? 'Cannot act now',
      icon: `portraits/${h.portrait}`,
    }));
    const party: { value: string; label: string; desc?: string; disabled?: string | false; tone?: 'danger' | 'quiet' | 'primary' }[] = [
      { value: '__end', label: ready.length ? 'End turn' : 'Continue', tone: ready.length ? 'quiet' : 'primary' },
    ];
    if (!opts.rangedOnly) {
      const pal = fleeBlockedByPaladin(g);
      party.push({ value: '__flee', label: 'Flee', desc: c.flags.freeFlee ? 'The foe is distracted: no attacks!' : 'Every foe attacks once as you run.', tone: 'danger', disabled: pal || (c.flags.noFlee && !c.flags.webBurned ? 'Trapped by webs' : false) });
      if (opts.canWithdraw) party.push({ value: '__withdraw', label: 'Withdraw', desc: 'Slam a door behind you: one attack each, +1 Defense.', tone: 'danger', disabled: pal || (c.flags.noFlee && !c.flags.webBurned ? 'Trapped by webs' : false) });
    }
    if (!ready.length && !opts.rangedOnly) return 'end';
    if (!ready.length) return;
    const pick = await g.choose<string>(opts.rangedOnly ? 'Ranged attacks & spells first!' : `Round ${c.turn}: your heroes act`, [...options, ...party], { layout: 'heroes', text: opts.rangedOnly ? 'Heroes with ready ranged weapons or spells may act before the foes close in.' : 'Choose a hero to act, in any order.' });
    if (pick === '__end') return opts.rangedOnly ? undefined : 'end';
    if (pick === '__flee') return 'flee';
    if (pick === '__withdraw') return 'withdraw';
    const h = g.hero(pick);
    const done = await heroTurn(g, h, !!opts.rangedOnly);
    if (done) hc(g, h).acted = true;
    g.io.changed();
  }
}

function rangedish(a: Action) {
  return a.group === 'magic' || a.id === 'ranged' || a.group === 'item' || ['gadget_shot', 'grenade', 'knife_throw', 'ill_knife', 'cgren', 'lights'].includes(a.id);
}

function fleeBlockedByPaladin(g: Game): string | false {
  const pal = g.party().find((h) => h.classId === 'paladin');
  if (!pal) return false;
  const allLow = g.party().every((h) => h.life < maxLife(h) / 2);
  const healing = g.party().some((h) => (h.resources.healing ?? 0) > 0 || (h.resources.prayer ?? 0) > 0 || h.inventory.some((i) => i.base === 'healing_potion'));
  if (allLow && !healing) return false;
  return `${pal.name} the paladin will never retreat`;
}

async function heroTurn(g: Game, h: Hero, rangedOnly: boolean): Promise<boolean> {
  for (;;) {
    let acts = heroActions(g, h);
    if (rangedOnly) acts = [...acts.filter(rangedish), { id: 'wait', label: 'Wait for melee', group: 'other', run: async () => true }];
    const groups: Record<string, string> = { attack: '⚔', magic: '✦', ability: '★', item: '⚱', other: '·' };
    const pick = await g.choose<string>(`${h.name}'s action`, [
      ...acts.map((a) => ({ value: a.id, label: `${groups[a.group]} ${a.label}`, desc: a.desc, disabled: a.disabled || false, icon: a.icon })),
      { value: '__back', label: 'Back', tone: 'quiet' as const },
    ], { who: h.id, layout: 'list' });
    if (pick === '__back') return false;
    const act = acts.find((a) => a.id === pick)!;
    const r = await act.run();
    if (r === false) {
      // Free actions return false: allow another pick unless cancelled from target selection
      if (['berserk', 'chant', 'divprot', 'bladesong', 'veil', 'feint', 'adistract', 'taunt', 'shieldwall', 'challenge', 'hblade', 'trickster', 'gadget_weapon', 'clockwork', 'shift'].includes(act.id)) continue;
      continue;
    }
    return true;
  }
}

/** Summoned beasts / companions attack. */
export async function alliesAct(g: Game) {
  const c = cs(g);
  for (const a of c.allies.filter((x) => x.life > 0)) {
    const foes = liveFoes(g);
    if (!foes.length) return;
    const f = foes.length === 1 ? foes[0] : (await pickFoe(g, `${a.name} attacks…`)) ?? foes[0];
    const roll = g.d6();
    const total = roll + a.attackBonus;
    const L = f.level;
    g.log('combat', `${a.name} attacks ${f.name}: ${roll}+${a.attackBonus} = ${total} vs ${L}`);
    if (total >= L) {
      if (isMinor(f)) await applyMinorKills(g, undefined, f, Math.max(1, Math.floor(total / L)));
      else await applyMajorDamage(g, undefined, f, 1);
    }
  }
  // Companions (hawk, owl, wildcat, warhound…) fight alongside owners
  for (const h of g.party()) {
    const comp = h.companion;
    if (!comp || comp.life <= 0 || !foeAlive(liveFoes(g)[0] ?? ({} as never))) continue;
    if (c.corridor && ['hawk', 'owl', 'peacock'].includes(comp.id)) continue;
    if (comp.id === 'owl' && h.spells.length) continue; // owl aids casting instead
    const vermin = liveFoes(g).find((f) => f.category === 'vermin' && /rat/i.test(f.name));
    if (vermin && (comp.id === 'wildcat' || comp.id === 'owl')) {
      await applyMinorKills(g, undefined, vermin, g.roll('d6'));
      continue;
    }
    if (comp.id === 'wildcat' && g.d6() === 1) continue;
    const atk = { hawk: -1, owl: -1, peacock: -2, warhound: 1, wildcat: 0, warhorse: 1, crow: 0 }[comp.id] ?? 0;
    const f = liveFoes(g)[0];
    const roll = g.d6();
    if (roll + atk >= f.level) {
      g.log('combat', `${comp.name} the ${comp.id} strikes ${f.name}!`);
      if (isMinor(f)) await applyMinorKills(g, undefined, f, 1);
      else await applyMajorDamage(g, undefined, f, 1);
    }
  }
}

/** Start-of-PC-turn upkeep. */
export function heroUpkeep(g: Game) {
  const c = cs(g);
  for (const h of combatHeroes(g)) {
    const x = hc(g, h);
    if (x.skipTurns > 0 && x.acted === false && c.flags[`skipConsumed_${h.id}_${c.turn}`] !== true) {
      c.flags[`skipConsumed_${h.id}_${c.turn}`] = true;
    }
    if (x.reload > 0) x.reload--;
    if (x.illusorySword) x.illusorySword--;
    x.confused = false;
  }
  for (const f of c.foes) {
    if (f.state.heldUntil && c.turn > (f.state.heldUntil as number)) (f.state.held = false), (f.state.heldUntil = 0);
    if (f.state.hairBindUntil && c.turn > (f.state.hairBindUntil as number)) {
      f.levelMods = f.levelMods.filter((m) => m.label !== 'Hair Bind');
      f.state.hairBindUntil = 0;
    }
    if (f.state.clearTurnMods !== undefined && c.turn > (f.state.clearTurnMods as number)) {
      f.levelMods = f.levelMods.filter((m) => !m.label.includes('(turn)'));
      delete f.state.clearTurnMods;
    }
    f.state.skipAttacks = 0;
  }
  c.hitThisTurn = [];
  if (typeof c.flags.kuklaRevive === 'string') {
    const [id, t] = (c.flags.kuklaRevive as string).split(':');
    if (c.turn >= Number(t)) {
      const k = g.hero(id);
      k.status = 'ok';
      k.life = maxLife(k);
      c.flags.kuklaRevive = false;
      g.log('good', `${k.name}'s eyes flicker open — she rises, fully restored!`);
    }
  }
}

/** Decrement skip-turn counters after a PC turn. */
export function afterPartyTurn(g: Game) {
  for (const h of combatHeroes(g)) {
    const x = hc(g, h);
    if (x.skipTurns > 0) x.skipTurns--;
  }
}
