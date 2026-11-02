import type { Game } from '../game';
import type { Foe } from '../types';
import { FOES } from '../../data/foes';
import { makeFoe, isMajor, isMinor, foeAlive, makeFinalBoss } from '../foe';
import { encounter, type EncounterResult } from '../combat/encounter';
import { rollTreasure } from './treasure';
import { grantXpRoll, tallyMinor, oldSchoolXp } from '../xp';
import { questProgress } from './quest';
import { removeCond } from '../effects';

export interface FightOpts {
  count?: number;
  wandering?: boolean;
  ambush?: boolean;
  resting?: boolean;
  major?: boolean;
  partySurprise?: boolean;
  forceSurprise?: boolean;
  foes?: Foe[];
  noBossCheck?: boolean;
  intro?: string;
}

/** Instantiate a foe, check Final Boss, run the encounter and award loot/XP. */
export async function fightFoe(g: Game, defId: string, o: FightOpts = {}): Promise<EncounterResult | undefined> {
  const d = g.s.dungeon!;
  const tile = d.tiles[d.currentTile];
  const def = FOES[defId];
  if (def.event) {
    const { gremlins } = await import('./gremlins');
    await gremlins(g);
    if (!o.wandering) d.majorFoesMet++;
    return;
  }
  const foes = o.foes ?? [makeFoe(g, defId, { count: o.count, wandering: o.wandering })];
  const lead = foes[0];
  // Secrets that alter the encounter
  await preEncounterSecrets(g, lead);
  // Final Boss check (p.105): every time you meet a Major Foe, roll d6 + (Major Foes met so far, incl.
  // gremlins). Major Foes met as Wandering Monsters cannot be the Final Boss (p.154) but still count.
  if (isMajor(lead) && !o.noBossCheck && !lead.state.deal) {
    const metBefore = d.majorFoesMet;
    d.majorFoesMet++;
    if (!d.finalBossFound && !o.wandering && d.adventureKey === 'random') {
      const isBoss = await finalBossCheck(g);
      void metBefore;
      if (isBoss) {
        makeFinalBoss(lead);
        d.finalBossFound = true;
        g.log('bad', `👑 The ${lead.name} is the Final Boss: +1 Life, +1 attack, fights to the death; greater treasure.`);
      }
    }
  }
  if (lead.state.deal) {
    g.log('good', `You have a deal with the ${lead.name}. They let you pass.`);
    tile.foeAttitude = 'deal';
    tile.foes = foes;
    return;
  }
  const res = await encounter(g, {
    foes, corridor: tile.corridor, narrow: false, ambush: o.ambush, partySurprise: o.partySurprise || (tile.secret && !tile.visited), forceSurprise: o.forceSurprise,
    canWithdraw: canWithdraw(g), allowStealth: !o.wandering && !o.resting, wandering: o.wandering, intro: o.intro,
  });
  await rewards(g, res, o);
  return res;
}

function canWithdraw(g: Game): boolean {
  const d = g.s.dungeon!;
  const t = d.tiles[d.currentTile];
  if (!d.previousTile) return false;
  const back = t.connectors.find((c) => c.to === d.previousTile);
  return !!back && (back.door || !!back.doorState) && !back.doorState?.destroyed && t.env === 'dungeon';
}

async function finalBossCheck(g: Game): Promise<boolean> {
  const d = g.s.dungeon!;
  const bonus = d.majorFoesMet - 1; // Major Foes encountered before this one
  if (g.s.settings.tileLimit && d.tilesEntered >= g.s.settings.tileLimit) return true;
  const ctx = `Roll d6${bonus ? ` +${bonus} (one per Major Foe met before this one)` : ''}. 6 or more: this is the Final Boss.`;
  const r = await g.tableRoll('Is this the Final Boss?', 'd6', { mods: bonus ? [{ label: 'Major Foes met', value: bonus }] : [], context: ctx, target: 6, outcome: ['It IS the Final Boss!', 'Not the Final Boss'] });
  let boss = r >= 6;
  g.log(boss ? 'bad' : 'info', boss ? 'This is the Final Boss!' : `Not the Final Boss (rolled ${r}, needed 6+).`);
  const ranger = g.party().find((h) => h.classId === 'ranger' && !g.isSpent(h, 'adventure', 'boss_tracking'));
  if (ranger && (await g.yesNo('Boss tracking', `${ranger.name} may reroll this check once per adventure.${boss ? ' (It IS the boss now.)' : ''}`, 'Reroll', 'Keep'))) {
    g.spend(ranger, 'adventure', 'boss_tracking');
    const r2 = await g.tableRoll('Final Boss (reroll)', 'd6', { mods: bonus ? [{ label: 'Major Foes met', value: bonus }] : [], context: ctx, target: 6, outcome: ['It IS the Final Boss!', 'Not the Final Boss'] });
    boss = r2 >= 6;
  }
  return boss;
}

async function preEncounterSecrets(g: Game, lead: Foe) {
  for (const h of g.party()) {
    if (isMajor(lead) && h.secrets.includes('weakness') && (await g.yesNo(`${h.name} knows a weakness`, `Use it against the ${lead.name}? (+2 to attack for everyone)`))) {
      h.secrets.splice(h.secrets.indexOf('weakness'), 1);
      lead.state.weakness = true;
    }
    if (h.secrets.includes('deal') && lead.category !== 'vermin' && (await g.yesNo(`${h.name} has a deal`, `Declare a deal with the ${lead.name}? They will let you pass (no treasure).`))) {
      h.secrets.splice(h.secrets.indexOf('deal'), 1);
      lead.state.deal = true;
    }
    if (isMajor(lead) && h.secrets.includes('nemesis') && (await g.yesNo('Your enemy is here!', `Replace the ${lead.name} with your nemesis, a Chaos Lord (+1 to attack)?`))) {
      h.secrets.splice(h.secrets.indexOf('nemesis'), 1);
      const cl = makeFoe(g, 'chaos_lord');
      Object.assign(lead, cl, { uid: lead.uid });
      lead.state.nemesis = true;
    }
  }
}

/** Treasure and XP after the encounter. */
export async function rewards(g: Game, res: EncounterResult, o: FightOpts) {
  const d = g.s.dungeon!;
  const tile = d.tiles[d.currentTile];
  const c = res.combat;
  if (res.outcome === 'wipe') return;
  const foes = res.foes.filter((f) => f.defId !== 'azure_gremlins' || true);
  const majors = foes.filter(isMajor);
  const minors = foes.filter(isMinor);
  const won = ['won', 'challenge_won', 'trial_won'].includes(res.outcome) || (res.outcome !== 'fled' && res.outcome !== 'withdrew' && foes.every((f) => !foeAlive(f)) && foes.some((f) => !f.treasure.none));
  // Leave surviving foes in the tile (withdraw / flee) so they're still there later
  if (res.outcome === 'withdrew' || res.outcome === 'fled') {
    const left = foes.filter(foeAlive);
    if (left.length && !o.wandering) {
      tile.foes = left;
      tile.foeAttitude = 'hostile';
      tile.resolved = false;
    }
    return;
  }
  if (res.outcome === 'evaded') {
    tile.foes = foes;
    tile.foeAttitude = 'hostile';
    tile.resolved = false;
    return;
  }
  // Quest tracking
  for (const f of majors) {
    if (f.life <= 0 && !f.subdued) questProgress(g, { kind: 'kill', foeId: f.defId });
    if (f.subdued) questProgress(g, { kind: 'subdue', foeId: f.defId });
  }
  if (c.flags.nonViolent) questProgress(g, { kind: 'nonviolent' });
  // XP
  const defeatedMajors = majors.filter((f) => !foeAlive(f) || c.majorDefeated.includes(f.uid));
  const defeatedMinors = minors.length && minors.every((f) => !foeAlive(f)) && (c.minorDefeated || minors.some((f) => f.fled && f.count < f.initialCount));
  if (defeatedMajors.length && minors.length && defeatedMinors) {
    await grantXpRoll(g, 'Boss with minions defeated');
    await grantXpRoll(g, 'Boss with minions defeated');
  } else {
    for (const f of defeatedMajors) {
      if (f.fled && f.life > 0 && !c.majorDefeated.includes(f.uid)) continue;
      await grantXpRoll(g, `${f.name} defeated`);
      if (f.finalBoss) await grantXpRoll(g, 'Final Boss slain');
    }
    if (defeatedMinors) await tallyMinor(g);
  }
  for (const f of defeatedMajors) {
    if (f.finalBoss) d.finalBossSlain = true;
    for (const h of g.party()) {
      if (h.conditions.some((k) => k.id === 'cursed') && c.flags.soloKill === h.id) removeCond(h, 'cursed');
      h.kills.major++;
    }
    oldSchoolXp(g, f.level * 10 + 5 * f.maxLife, f.name);
  }
  for (const f of minors) oldSchoolXp(g, Math.floor((f.initialCount - f.count) * f.level / (f.category === 'vermin' ? 2 : 1)), f.name);
  // Treasure: once per encounter (not wandering monsters, not with a boss for its minions)
  if (o.wandering) return void (tile.cleared = tile.cleared || true);
  tile.cleared = true;
  tile.resolved = true;
  const env = tile.env;
  const fiendish = foes.some((f) => FOES[f.defId].source === 'fiendish');
  const treasureFoes = majors.length ? majors : minors;
  for (const f of treasureFoes) {
    if (f.treasure.none) continue;
    if (f.treasure.special) {
      const { specialTreasure } = await import('./adventures');
      await specialTreasure(g, f);
      continue;
    }
    let rolls = f.treasure.rolls ?? 1;
    if (f.finalBoss) {
      await g.say('The Final Boss\u2019s hoard', 'Its gold is tripled (or at least 100 gp), and magic items are doubled.');
    }
    const startGold = g.s.partyGold;
    for (let i = 0; i < rolls; i++) await rollTreasure(g, { env, mod: f.treasure.mod + (tile.treasureMod ?? 0), goldMult: tile.treasureDouble ? 2 : 1, noMagic: FOES[f.defId].specials?.some((s) => s.id === 'no_magic_loot'), fiendish, witch: d.adventureKey === 'witch' });
    if (f.finalBoss) {
      const gained = g.s.partyGold - startGold;
      const extra = Math.max(gained * 2, 100 - gained);
      g.addGold(extra, 'Final Boss hoard');
    }
    if (FOES[f.defId].treasure?.special === 'clue2' || f.treasure.special === 'clue2') if (g.chance(2)) g.s.clues++;
    if (f.defId === 'chaos_lord' && g.chance(2)) {
      const { gainClue } = await import('./features');
      await gainClue(g, 'The party');
    }
  }
  // Steal success on "Ignore" reaction
  if (c.flags.stealLoot) await rollTreasure(g, { env });
  // Weapons from humanoid foes
  if (minors.some((f) => !f.tags.includes('animal') && !f.tags.includes('undead') && f.count < f.initialCount)) tile.notes.push('weapons');
}
