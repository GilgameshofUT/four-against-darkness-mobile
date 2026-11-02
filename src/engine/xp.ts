import type { Game } from './game';
import type { Hero } from './types';
import { maxLife, isAlive, tierOf } from './hero';
import { CLASSES } from '../data/classes';

export const LEVEL_CAP = 4;

/** Award an XP roll (Classic) or store XP for other systems. */
export async function grantXpRoll(g: Game, reason: string) {
  const sys = g.s.settings.xpSystem;
  if (sys === 'slow_sure') return; // level-up at end of adventure instead
  if (sys === 'old_school') return; // tallied separately
  if (sys === 'slower') {
    const h = await chooseHero(g, `XP earned: ${reason}`, 'Store 1 XP with which hero?', true);
    if (h) g.s.guild.storedXp[h.id] = (g.s.guild.storedXp[h.id] ?? 0) + 1;
    return;
  }
  const h = await chooseHero(g, `XP roll: ${reason}`, 'Who makes the XP roll? Roll higher than their Level (6 always succeeds) to gain a Level.');
  if (!h) return;
  await xpRoll(g, h, reason);
}

async function chooseHero(g: Game, title: string, text: string, allowCapped = false): Promise<Hero | undefined> {
  const alive = g.party();
  const eligible = alive.filter((h) => (allowCapped || h.level < LEVEL_CAP) && (!h.justLeveled || alive.length === 1));
  if (!eligible.length) {
    g.log('info', `${title} — no hero can benefit (level cap ${LEVEL_CAP}).`);
    return;
  }
  return g.pickHero(title, eligible, text);
}

export async function xpRoll(g: Game, h: Hero, reason: string, bonus = 0): Promise<boolean> {
  for (const x of g.party()) x.justLeveled = false;
  const res = await g.heroRoll({ hero: h, kind: 'xp', label: `XP roll (${reason})`, mods: bonus ? [{ label: 'Extra XP', value: bonus }] : [], target: h.level + 1, explode: false, noReroll: true, context: `Need ${h.level + 1}+ (6 always succeeds)` });
  const ok = res.success || res.natural === 6;
  if (ok) await levelUp(g, h);
  else g.log('info', `${h.name} does not level up this time.`);
  return ok;
}

export async function levelUp(g: Game, h: Hero) {
  if (h.level >= LEVEL_CAP) {
    g.log('info', `${h.name} is at the level cap (${LEVEL_CAP}).`);
    return;
  }
  h.level++;
  h.life = Math.min(maxLife(h), h.life + 1);
  h.justLeveled = true;
  const cls = CLASSES[h.classId];
  // Resource growth
  if (h.classId === 'halfling') h.resources.luck = (h.resources.luck ?? 0) + 1;
  if (h.classId === 'paladin') h.resources.prayer = (h.resources.prayer ?? 0) + 1;
  if (h.classId === 'acrobat') h.resources.trick = (h.resources.trick ?? 0) + 1;
  if (h.classId === 'gnome') h.resources.gadget = (h.resources.gadget ?? 0) + 1;
  if (h.classId === 'barbarian' && h.level % 2 === 0) h.resources.rage = (h.resources.rage ?? 0) + 1;
  g.log('level', `★ ${h.name} reaches Level ${h.level}!`);
  await g.say('Level up!', `${h.name} the ${cls.name} is now Level ${h.level}. +1 Life and all Level-based bonuses improve.`, `portraits/${h.portrait}`);
  // New spell slot: add a spell now
  const { spellSlots } = await import('./setup/spells');
  const slots = spellSlots(h);
  if (slots > h.spells.length && ['wizard', 'elf', 'illusionist', 'druid', 'gnome'].includes(h.classId)) {
    const { chooseSpellsFor } = await import('./setup/spells');
    await chooseSpellsFor(g, h, slots - h.spells.length);
  }
  void tierOf;
  void isAlive;
}

/** Minor foe encounter tally: every 10 gives an XP roll. */
export async function tallyMinor(g: Game) {
  g.s.xpTally.minorEncounters++;
  const n = g.s.xpTally.minorEncounters;
  g.log('info', `Minor Foe encounters defeated: ${n % 10}/10.`);
  if (n % 10 === 0) await grantXpRoll(g, '10 Minor Foe encounters');
}

/** Old School XP tally. */
export function oldSchoolXp(g: Game, n: number, why: string) {
  if (g.s.settings.xpSystem !== 'old_school') return;
  g.s.guild.oldSchoolXp.party = (g.s.guild.oldSchoolXp.party ?? 0) + n;
  g.log('info', `+${n} XP (${why}).`);
}
