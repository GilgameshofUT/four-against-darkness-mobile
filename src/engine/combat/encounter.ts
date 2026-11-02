import type { Game } from '../game';
import type { Foe } from '../types';
import type { CombatState } from './types';
import { cs, hc, liveFoes, combatHeroes, newHeroCombat, allFoesDown, partyCount, foeHeadcount } from './util';
import { combatStart } from './hooks2';
import { foeTurn } from './foeturn';
import { partyTurn, alliesAct, heroUpkeep, afterPartyTurn } from './turns';
import { rollReaction, payBribe, reactionName } from './reactions';
import { fdef, foeAlive, foeLabel, fspecial, isMinor, foeLevel } from '../foe';
import { groupStealth } from '../checks';
import { endCombat } from './end';
import { specialReaction } from './special';

export interface EncounterOpts {
  foes: Foe[];
  corridor: boolean;
  narrow?: boolean;
  /** wandering monsters ambush: they attack first, no reactions */
  ambush?: boolean;
  /** party surprised them (stealth, secret door) */
  partySurprise?: boolean;
  /** foes automatically surprise (fled into unexplored tile) */
  forceSurprise?: boolean;
  canWithdraw: boolean;
  allowStealth?: boolean;
  /** roll XP/treasure for this fight */
  wandering?: boolean;
  intro?: string;
}

export interface EncounterResult {
  outcome: NonNullable<CombatState['outcome']>;
  foes: Foe[];
  combat: CombatState;
}

export async function encounter(g: Game, o: EncounterOpts): Promise<EncounterResult> {
  const c: CombatState = {
    id: g.uid('c'), foes: o.foes, turn: 1, corridor: o.corridor, narrow: !!o.narrow, foesFirstSurprise: false, ambush: !!o.ambush,
    partySurprise: !!o.partySurprise, heroes: {}, allies: [], over: false, flags: {}, hitThisTurn: [], minorDefeated: false, majorDefeated: [],
  };
  g.s.combat = c;
  for (const h of g.party()) c.heroes[h.id] = newHeroCombat();
  if (o.foes.some((f) => fspecial(f, 'web_no_flee'))) c.flags.noFlee = true;
  for (const f of o.foes) if (f.state.fightToDeath) f.noMorale = true;
  g.io.changed();
  const names = o.foes.map((f) => foeLabel(f)).join(' and ');
  const lead = o.foes[0];
  const art = `monsters/${fdef(lead).art ?? lead.defId}`;
  const bossNote = lead.finalBoss ? ' 👑 FINAL BOSS.' : '';
  await g.say(lead.finalBoss ? 'The Final Boss!' : o.ambush ? 'Ambush!' : 'Encounter!', o.intro ?? `${names} (L${lead.level}${isMinor(lead) ? '' : `, ${lead.life} Life`}).${bossNote} ${fdef(lead).desc}`, art);

  // Effects at the beginning of the encounter happen before anything else
  await combatStart(g);
  if (await checkOver(g)) return finish(g, o);

  let foesFirst = !!o.ambush;
  if (!o.ambush && !o.partySurprise) {
    const sur = surpriseChance(g, o);
    if (o.forceSurprise) foesFirst = true;
    else if (sur > 0) {
      const r = await g.tableRoll(`Surprise? (${sur}-in-6)`, 'd6', { context: `1–${sur}: the foes act first` });
      foesFirst = r <= sur;
      if (foesFirst) {
        const nose = g.party().find((h) => h.traits.includes('keen_nose') && !g.isSpent(h, 'adventure', 'keen_nose'));
        if (nose && (await g.yesNo(`${nose.name} smells them coming!`, 'Use Keen Nose to cancel the surprise?'))) {
          g.spend(nose, 'adventure', 'keen_nose');
          foesFirst = false;
        }
      }
    }
  }

  if (foesFirst) {
    c.foesFirstSurprise = !o.ambush;
    if (!o.ambush) {
      const out = await reactionPhase(g, o, true);
      if (out) return finish(g, o, out);
    }
    // Foes' ranged attacks (handled in combatStart volleys) then PCs' ranged & spells
    await partyTurn(g, { rangedOnly: true, canWithdraw: o.canWithdraw });
    if (await checkOver(g)) return finish(g, o);
    await foeTurn(g);
    if (o.ambush) c.flags.ambushTurned = true;
    if (await checkOver(g)) return finish(g, o);
    c.turn++;
  } else {
    // Party acts first: stealth, attack or wait for reactions
    const choice = await openingChoice(g, o);
    if (choice === 'evaded') return finish(g, o, 'evaded');
    if (choice === 'react') {
      const out = await reactionPhase(g, o, false);
      if (out) return finish(g, o, out);
      if (c.flags.foesStrikeFirst) {
        await foeTurn(g);
        if (await checkOver(g)) return finish(g, o);
        c.turn++;
      }
    }
  }

  // Main loop
  for (let guard = 0; guard < 200; guard++) {
    heroUpkeep(g);
    const choice = await partyTurn(g, { canWithdraw: o.canWithdraw });
    afterPartyTurn(g);
    if (choice === 'flee' || choice === 'withdraw' || choice === 'smoke') {
      const res = await runAway(g, choice);
      return finish(g, o, res);
    }
    if (await checkOver(g)) return finish(g, o);
    await alliesAct(g);
    if (await checkOver(g)) return finish(g, o);
    await foeTurn(g);
    if (await checkOver(g)) return finish(g, o);
    c.turn++;
    if (c.trial) {
      c.trial.turnsLeft--;
      if (c.trial.turnsLeft <= 0) return finish(g, o, 'trial_won');
    }
  }
  return finish(g, o);
}

function surpriseChance(g: Game, o: EncounterOpts): number {
  let s = Math.max(0, ...o.foes.map((f) => f.surprise ?? 0));
  if (s >= 6) return 6;
  if (s <= 0) return 0;
  if (g.party().some((h) => h.companion?.id === 'warhound' && h.companion.life > 0)) s--;
  if (g.s.dungeon?.noSurprise?.length) {
    const env = g.s.dungeon.tiles[g.s.dungeon.currentTile]?.env;
    if (g.s.dungeon.noSurprise.some((n) => n.env === 'all' || n.env === env)) return 0;
  }
  if (g.s.dungeon?.tiles[g.s.dungeon.currentTile]?.cavernFeature === 'boulders') s++;
  if (g.s.dungeon?.keywords.includes('hyphae_alert')) s--;
  return Math.max(0, s);
}

async function openingChoice(g: Game, o: EncounterOpts): Promise<'attack' | 'react' | 'evaded'> {
  const c = cs(g);
  const opts: { value: string; label: string; desc?: string; tone?: 'primary' | 'quiet' | 'danger' }[] = [
    { value: 'attack', label: 'Attack immediately', desc: 'Ranged weapons and spells strike first.', tone: 'primary' },
    { value: 'react', label: 'Wait and see their Reaction', desc: 'If they attack, they strike first.' },
  ];
  if (o.allowStealth && !o.wandering) opts.push({ value: 'stealth', label: 'Sneak (Stealth Save)', desc: 'Slip away unseen, or ambush them (−1 L, first turn).' });
  const pick = await g.choose('What do you do?', opts, { art: `monsters/${fdef(o.foes[0]).art ?? o.foes[0].defId}` });
  if (pick === 'attack') return 'attack';
  if (pick === 'react') return 'react';
  const L = Math.max(...liveFoes(g).map((f) => foeLevel(g, f)));
  const ok = await groupStealth(g, g.party(), L);
  if (!ok) {
    g.log('bad', 'You are spotted!');
    const p2 = await g.choose('Spotted! The foes gain the initiative.', [
      { value: 'fight', label: 'They attack first' },
      { value: 'react', label: 'Roll for their Reaction' },
    ]);
    if (p2 === 'fight') {
      c.flags.foesStrikeFirst = true;
      await foeTurn(g);
      c.turn++;
      return 'attack';
    }
    return 'react';
  }
  const p = await g.choose('Unseen!', [
    { value: 'ambush', label: 'Ambush them', desc: 'Their L −1 on the first turn; they cannot shoot before melee.', tone: 'primary' as const },
    { value: 'leave', label: 'Slip away', desc: 'Leave quietly (1-in-6 wandering monster check).' },
    { value: 'reveal', label: 'Reveal yourselves (Reaction)' },
  ]);
  if (p === 'ambush') {
    c.partySurprise = true;
    return 'attack';
  }
  if (p === 'leave') return 'evaded';
  return 'react';
}

/** Handle the foe group's Reaction. Returns an outcome if the encounter ends without a fight. */
async function reactionPhase(g: Game, o: EncounterOpts, surprised: boolean): Promise<CombatState['outcome'] | undefined> {
  const c = cs(g);
  for (const f of liveFoes(g)) {
    const r = await rollReaction(g, f);
    switch (r.type) {
      case 'fight':
        c.flags.foesStrikeFirst = true;
        break;
      case 'fight_death':
        f.noMorale = true;
        f.state.fightToDeath = true;
        c.flags.foesStrikeFirst = true;
        break;
      case 'flee':
        f.fled = true;
        f.treasure.none = true;
        g.log('good', `${foeLabel(f)} flee!`);
        break;
      case 'flee_outnumbered':
        if (foeHeadcount([f]) < partyCount(g)) (f.fled = true), (f.treasure.none = true), g.log('good', `Outnumbered, ${foeLabel(f)} flee!`);
        else c.flags.foesStrikeFirst = true;
        break;
      case 'bribe': {
        const paid = await payBribe(g, f, r.bribe ?? '5ea');
        if (paid) {
          f.fled = true;
          c.flags.bribed = true;
          c.flags.nonViolent = true;
          (g.s.dungeon?.tiles[g.s.dungeon.currentTile] ?? ({} as never)).foeAttitude = 'bribed';
        } else c.flags.foesStrikeFirst = true;
        break;
      }
      case 'peaceful':
      case 'ignore':
      case 'ignore_or_fight':
      case 'info':
      case 'offer_food':
      case 'trade':
      case 'sleeping':
      case 'puzzle':
      case 'quest':
      case 'magic_challenge':
      case 'trade_info':
      case 'capture':
      case 'blood_offering':
      case 'trial':
      case 'buy_weapons': {
        const out = await specialReaction(g, f, r);
        if (out === 'fight') c.flags.foesStrikeFirst = true;
        else if (out && out !== 'continue') return out as CombatState['outcome'];
        break;
      }
    }
  }
  void reactionName;
  void surprised;
  void o;
  if (allFoesDown(g)) return c.flags.nonViolent ? (c.flags.bribed ? 'bribed' : 'peaceful') : 'peaceful';
  return undefined;
}

async function runAway(g: Game, how: 'flee' | 'withdraw' | 'smoke'): Promise<CombatState['outcome']> {
  const c = cs(g);
  if (how === 'smoke' || c.flags.freeFlee) {
    g.log('good', 'The party escapes without a scratch!');
    return 'fled';
  }
  g.log('combat', how === 'withdraw' ? 'You withdraw, slamming the door!' : 'You turn and run!');
  const lever = c.flags.leverDoor;
  if (!(how === 'withdraw' && lever)) await foeTurn(g, how === 'withdraw' ? { withdraw: true } : { flee: true });
  for (const h of combatHeroes(g)) hc(g, h).fled = true;
  return how === 'withdraw' ? 'withdrew' : 'fled';
}

async function checkOver(g: Game): Promise<boolean> {
  const c = cs(g);
  if (!g.party().length || combatHeroes(g).length === 0) return true;
  if (allFoesDown(g)) return true;
  void foeAlive;
  return c.over;
}

async function finish(g: Game, o: EncounterOpts, forced?: CombatState['outcome']): Promise<EncounterResult> {
  const c = cs(g);
  let outcome = forced;
  if (!outcome) {
    if (!g.party().length) outcome = 'wipe';
    else if (combatHeroes(g).length === 0) outcome = 'fled';
    else if (allFoesDown(g)) outcome = 'won';
    else outcome = 'fled';
  }
  c.outcome = outcome;
  c.over = true;
  await endCombat(g, o, outcome);
  const res: EncounterResult = { outcome, foes: c.foes, combat: c };
  g.s.combat = undefined;
  g.io.changed();
  return res;
}
