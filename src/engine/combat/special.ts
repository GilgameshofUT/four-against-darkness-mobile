import type { Game } from '../game';
import type { Foe } from '../types';
import type { Reaction } from '../../data/foes';
import { foeLabel, foeLevel, isMinor, fdef, foeAlive } from '../foe';
import { inventoryCount, isAlive, weaponInfo, base, maxLife } from '../hero';
import { cs } from './util';
import { save } from '../checks';
import { stealthMods } from '../mods/save';
import { CLASSES } from '../../data/classes';

/** Non-combat reactions. Returns 'fight' to start a fight (foes first), 'continue' to fall through, or an outcome. */
export async function specialReaction(g: Game, f: Foe, r: Reaction): Promise<string | undefined> {
  const c = cs(g);
  const tile = g.s.dungeon?.tiles[g.s.dungeon.currentTile];
  const art = `monsters/${fdef(f).art ?? f.defId}`;
  switch (r.type) {
    case 'peaceful':
      f.fled = true;
      f.treasure.none = true;
      c.flags.nonViolent = true;
      if (tile) (tile.foeAttitude = 'peaceful'), (tile.foes = [f]);
      await g.say('Peaceful', `${foeLabel(f)} have no quarrel with you. You may pass through.`, art);
      return 'peaceful';
    case 'ignore':
    case 'ignore_or_fight': {
      if (r.type === 'ignore_or_fight' && f.defId === 'mud_centipedes' && tile?.feature === 'water_pool' && tile.featureState?.inspected) return 'fight';
      const choice = await g.choose(`${foeLabel(f)} ignore you`, [
        { value: 'pass', label: 'Move on', tone: 'primary' as const },
        { value: 'steal', label: 'Try to steal from them (Stealth)', desc: 'One item or half their gold. Failure: they fight, striking first.' },
        { value: 'attack', label: 'Attack anyway' },
      ], { art });
      if (choice === 'attack') return 'continue';
      if (choice === 'steal') {
        const thief = await g.pickHero('Who tries to steal?', g.party());
        if (thief) {
          const res = await g.heroRoll({ hero: thief, kind: 'stealth', label: 'Steal', mods: stealthMods(g, thief), target: foeLevel(g, f) });
          if (!res.success) return 'fight';
          c.flags.stealLoot = true;
        }
      }
      f.fled = true;
      if (!c.flags.stealLoot) f.treasure.none = true;
      c.flags.nonViolent = true;
      if (tile) (tile.foeAttitude = 'ignore'), (tile.foes = [f]);
      return 'peaceful';
    }
    case 'offer_food':
      for (const h of g.party()) g.heal(h, 1, 'food and rest');
      f.fled = true;
      f.treasure.none = true;
      await g.say('Friends!', `${foeLabel(f)} share food and tend your wounds.`, art);
      return 'peaceful';
    case 'info':
      g.s.dungeon?.noSurprise?.push({ env: 'caverns', reason: 'morlock informant' });
      f.fled = true;
      f.treasure.none = true;
      await g.say('Information', 'A morlock offers to betray its kin: you cannot be surprised by morlocks in these caverns.', art);
      return 'peaceful';
    case 'trade': {
      const { tradeWithPickers } = await import('../dungeon/events');
      await tradeWithPickers(g);
      f.fled = true;
      f.treasure.none = true;
      return 'peaceful';
    }
    case 'buy_weapons': {
      if (g.party().some((h) => h.classId === 'dwarf' || h.classId === 'elf')) return 'fight';
      const ws = g.party().flatMap((h) => h.inventory.filter((i) => weaponInfo(i) && i.uid !== h.equip.main).map((i) => ({ h, i })));
      if (ws.length) {
        const sell = await g.choose('The cave orcs want to buy weapons', [...ws.map(({ i }) => ({ value: i.uid, label: `Sell ${i.name} (${base(i)?.price ?? 5} gp)` })), { value: '', label: 'Refuse — fight' }]);
        if (sell) {
          const owner = ws.find((w) => w.i.uid === sell)!;
          owner.h.inventory = owner.h.inventory.filter((i) => i !== owner.i);
          g.s.partyGold += base(owner.i)?.price ?? 5;
          f.fled = true;
          f.treasure.none = true;
          return 'peaceful';
        }
      }
      return 'fight';
    }
    case 'sleeping':
      f.state.sleepingDragon = true;
      await g.say('Asleep!', `${f.name} is asleep. All heroes get +2 on their first attack.`, art);
      return 'continue';
    case 'puzzle': {
      const solver = await g.pickHero('Who tries to solve the riddle?', g.party());
      if (!solver) return 'fight';
      const res = await save(g, solver, { type: 'puzzle', target: f.level, label: 'Solve the puzzle' });
      if (res.success) {
        f.fled = true;
        f.treasure.none = true;
        return 'puzzle';
      }
      return 'fight';
    }
    case 'quest': {
      const accept = await g.yesNo(`${foeLabel(f)} offer a Quest`, 'Accept? If you refuse, they leave.', 'Accept', 'Refuse', art);
      f.fled = true;
      f.treasure.none = true;
      if (accept) {
        const { startQuest } = await import('../dungeon/quest');
        await startQuest(g, tile?.id);
        if (tile) (tile.foeAttitude = 'quest_giver'), (tile.foes = [{ ...f, fled: false }]);
      }
      return 'quest';
    }
    case 'magic_challenge': {
      const casters = g.party().filter((h) => CLASSES[h.classId].tags.includes('spellcaster') && h.level > 0);
      if (!casters.length) return 'fight';
      const accept = await g.yesNo('Magic challenge!', `${f.name} challenges your spellcaster to a duel of wills. Lose and the caster loses a level.`, 'Accept', 'Refuse (fight)', art);
      if (!accept) return 'fight';
      const h = (await g.pickHero('Who duels?', casters))!;
      const res = await g.heroRoll({ hero: h, kind: 'spell', label: 'Magic duel', mods: [{ label: 'Casting', value: h.level }], target: f.level });
      if (res.success) {
        f.fled = true;
        c.majorDefeated.push(f.uid);
        return 'challenge_won';
      }
      h.level = Math.max(0, h.level - 1);
      h.life = Math.min(h.life, maxLife(h));
      g.log('bad', `${h.name} loses the duel and a level!`);
      return 'fight';
    }
    case 'trade_info': {
      const opts = [{ value: 'sell', label: `Share information (+${g.s.clues * 25} gp)`, disabled: g.s.clues ? false : 'No Clues' }, { value: 'buy', label: 'Buy 1 Clue (100 gp)', disabled: g.s.partyGold >= 100 ? false : 'Not enough gold' }, { value: '', label: 'Done' }];
      for (;;) {
        const p = await g.choose(`${foeLabel(f)} trade information`, opts as never, { art });
        if (!p) break;
        if (p === 'sell') g.s.partyGold += g.s.clues * 25, (opts[0].disabled = 'Already shared');
        if (p === 'buy' && g.spendGold(100)) g.s.clues++;
      }
      if (f.defId === 'deep_hags' && !g.s.clues) void 0;
      f.fled = true;
      f.treasure.none = true;
      return 'peaceful';
    }
    case 'blood_offering': {
      const blood = g.party().find((h) => h.inventory.some((i) => i.base === 'chicken_blood'));
      const donors = g.party().filter((h) => h.classId !== 'kukla' && h.life > 2);
      const opts = [...donors.map((h) => ({ value: h.id, label: `${h.name} gives blood (−2 Life)`, desc: `${h.life} Life` }))];
      if (blood) opts.unshift({ value: 'jar', label: 'Offer the jar of chicken blood', desc: '' });
      opts.push({ value: '', label: 'Refuse — fight!', desc: '' });
      const p = await g.choose(`${foeLabel(f)} demand a blood offering`, opts, { art });
      if (!p) return 'fight';
      if (p === 'jar') blood!.inventory = blood!.inventory.filter((i) => i.base !== 'chicken_blood');
      else await g.damage(g.hero(p), 2, 'blood offering', { noReduce: true });
      f.fled = true;
      f.treasure.none = true;
      return 'peaceful';
    }
    case 'capture':
      c.flags.capture = true;
      return 'fight';
    case 'trial': {
      const champ = await g.pickHero('Trial of Champions: choose your champion', g.party().filter((h) => !h.traits.includes('challenge')).length ? g.party() : g.party(), 'A duel lasting d6 turns. No magic, no ranged attacks, no help.');
      if (!champ) return 'fight';
      const pal = g.party().find((h) => h.traits.includes('challenge'));
      const hero = pal ?? champ;
      const { runTrial } = await import('./trial');
      const won = await runTrial(g, hero, f);
      if (won) {
        f.fled = true;
        f.treasure.none = true;
        if (tile) (tile.foeAttitude = 'trial_won'), (tile.foes = [{ ...f, fled: false }]);
        return 'trial_won';
      }
      f.state.trialPenalty = true;
      const leave = await g.yesNo('You lost the trial', 'Leave the tile, or fight them at +1 L.', 'Leave', 'Fight!');
      return leave ? 'trial_lost' : 'fight';
    }
  }
  void isMinor;
  void inventoryCount;
  void isAlive;
  void foeAlive;
  return 'continue';
}
