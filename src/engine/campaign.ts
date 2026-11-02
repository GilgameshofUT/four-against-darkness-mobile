import type { Game } from './game';
import type { Hero } from './types';
import { newDungeon } from './dungeon/generate';
import { maxLife, isAlive, inventoryCount, base } from './hero';
import { initResources } from './setup/create';
import { chooseSpellsFor, spellSlots } from './setup/spells';
import { levelUp } from './xp';

/** Prepare the selected party and enter a new dungeon. */
export async function startAdventure(g: Game, partyIds: string[], adventureKey = 'random') {
  g.s.party = [...partyIds];
  g.s.partyGold = 0;
  g.s.clues = g.s.guild.clues;
  g.s.log = [];
  for (const h of g.partyAll()) {
    h.used = { adventure: {}, combat: {}, level: {} };
    h.conditions = h.conditions.filter((c) => c.id === 'no_resurrect');
    initResources(h);
    h.life = maxLife(h);
    h.spells = h.spells.filter((s) => !s.temp).map((s) => ({ ...s, used: false }));
    if (h.spells.length !== spellSlots(h)) await chooseSpellsFor(g, h);
    h.justLeveled = false;
  }
  newDungeon(g, adventureKey);
  g.s.mode = 'dungeon';
  // Lantern bearer: first hero holding a lantern
  const bearer = g.party().find((h) => h.inventory.some((i) => i.base === 'lantern' && (i.uid === h.equip.main || i.uid === h.equip.off)));
  g.s.dungeon!.lanternBearer = bearer?.id;
  g.log('story', adventureKey === 'witch' ? "You enter Milethia's cave…" : 'You descend into the darkness…');
  g.io.checkpoint('start');
}

/** Wrap up an adventure: survivors return, loot to guild, recovery, XP. */
export async function endAdventure(g: Game, outcome: 'victory' | 'retreat' | 'wipe') {
  const d = g.s.dungeon;
  const party = g.partyAll();
  const alive = party.filter(isAlive);
  // Expiring items
  for (const h of party) h.inventory = h.inventory.filter((i) => !i.expires && !(i.data?.enchanted && (delete i.data.enchanted, false)));
  // Witch bounty
  if (d?.keywords.includes('bounty_100')) g.s.partyGold += 100;
  // Madness heals by 1 if a major foe was defeated
  if (d && d.majorFoesMet > 0 && outcome !== 'wipe') for (const h of alive) if (h.madness > 0) h.madness--;
  // Slow & Sure XP: one surviving hero levels up after a successful adventure
  if (g.s.settings.xpSystem === 'slow_sure' && outcome === 'victory' && alive.length) {
    const h = await g.pickHero('Slow & Sure: who gains a level?', alive.filter((x) => x.level < 4));
    if (h) await levelUp(g, h);
  }
  // Paladin tithe
  for (const h of alive.filter((x) => x.classId === 'paladin')) {
    const tithe = Math.min(g.s.partyGold, h.level * 10);
    g.s.partyGold -= tithe;
    g.log('info', `${h.name} tithes ${tithe} gp to the order.`);
  }
  g.s.guild.gold += g.s.partyGold;
  g.s.guild.clues = g.s.clues;
  for (const h of party) {
    h.adventures++;
    h.used = { adventure: {}, combat: {}, level: {} };
    if (isAlive(h)) {
      h.life = maxLife(h);
      if (h.classId === 'kukla') h.life = Math.min(h.life, h.life); // kuklas need repair: handled in town
    }
    // Leafsteel decay
    for (const it of h.inventory) if (it.adventuresLeft !== undefined) it.adventuresLeft--;
    h.inventory = h.inventory.filter((it) => it.adventuresLeft === undefined || it.adventuresLeft > 0);
  }
  const deaths = party.filter((h) => !isAlive(h)).map((h) => h.id);
  g.s.adventureResult = { outcome, goldGained: g.s.partyGold, xpRolls: [], deaths };
  g.s.guild.adventuresCompleted += outcome === 'victory' ? 1 : 0;
  g.s.mode = 'debrief';
  g.s.dungeon = undefined;
  g.s.partyGold = 0;
  g.io.checkpoint('debrief');
  void inventoryCount;
  void base;
}

/** Move the dead to the graveyard (unless resurrected). Insane heroes are gone forever. */
export function buryFallen(g: Game, ids: string[]) {
  for (const id of ids) {
    const h = g.s.guild.roster.find((x) => x.id === id);
    if (!h) continue;
    g.s.guild.roster = g.s.guild.roster.filter((x) => x !== h);
    g.s.guild.graveyard.push(h);
  }
}

export function resurrect(g: Game, h: Hero): boolean {
  if (g.s.guild.gold < 1000) return false;
  g.s.guild.gold -= 1000;
  const auto = h.level >= 6;
  const r = g.d6();
  const ok = auto || r <= h.level;
  if (ok) {
    h.status = 'ok';
    h.madness = 0;
    h.conditions = [];
    h.life = maxLife(h);
    h.milestones.resurrected = (h.milestones.resurrected ?? 0) + 1;
  }
  g.log(ok ? 'good' : 'bad', `Resurrection of ${h.name}: rolled ${r} vs L${h.level} — ${ok ? 'success!' : 'the gods refuse.'}`);
  return ok;
}
