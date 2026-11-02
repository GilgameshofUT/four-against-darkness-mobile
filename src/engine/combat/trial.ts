import type { Game } from '../game';
import type { Foe, Hero } from '../types';
import { attackFoe } from './resolve';
import { resolveSwing } from './foeturn';
import { mainHand, weaponInfo, isAlive, inventoryCount } from '../hero';
import { foeAlive, isMinor } from '../foe';
import { cs } from './util';

/** Trial of Champions: d6 turns, random first, melee only. Returns true if the hero wins. */
export async function runTrial(g: Game, hero: Hero, group: Foe): Promise<boolean> {
  const c = cs(g);
  // Their champion: boss, or a minion 2 levels higher (one opponent with 1 Life x... treat as major with 1 Life? Book: minion 2L higher)
  const champ: Foe = { ...group, uid: g.uid('f'), count: 1, initialCount: 1, category: 'boss', level: isMinor(group) ? group.level + 2 : group.level, life: isMinor(group) ? 1 : group.life, maxLife: isMinor(group) ? 1 : group.maxLife, attacks: isMinor(group) ? 1 : group.attacks, levelMods: [], state: {} };
  const saved = c.foes;
  c.foes = [champ];
  c.trial = { heroId: hero.id, foeUid: champ.uid, turnsLeft: g.roll('d6'), heroDmg: 0, foeDmg: 0 };
  const turns = c.trial.turnsLeft;
  const foeFirst = g.d6() <= 3;
  await g.say('Trial of Champions', `${hero.name} faces their champion for ${turns} turns. ${foeFirst ? 'They strike first!' : `${hero.name} strikes first!`}`);
  let heroDmg = 0;
  let foeDmg = 0;
  const gladiator = hero.secrets.includes('gladiator') ? [{ label: 'Gladiator', value: 1 }] : [];
  for (let t = 0; t < turns && isAlive(hero) && foeAlive(champ); t++) {
    const order = foeFirst ? ['foe', 'hero'] : ['hero', 'foe'];
    for (const who of order) {
      if (!isAlive(hero) || !foeAlive(champ)) break;
      if (who === 'hero') {
        let w = mainHand(hero);
        if (weaponInfo(w)?.ranged) w = undefined;
        const before = champ.life;
        await attackFoe(g, hero, champ, { weapon: w, ranged: false, extraMods: gladiator, label: 'Trial strike' });
        heroDmg += before - Math.max(0, champ.life);
      } else {
        const before = hero.life;
        await resolveSwing(g, champ, hero, champ.damage);
        foeDmg += before - Math.max(0, hero.life);
      }
    }
  }
  c.foes = saved;
  c.trial = undefined;
  const won = isAlive(hero) && (!foeAlive(champ) || heroDmg > foeDmg);
  g.log(won ? 'good' : 'bad', `${hero.name} ${won ? 'wins' : 'loses'} the Trial of Champions (${heroDmg} vs ${foeDmg} damage).`);
  if (won && !foeAlive(champ) && isMinor(group)) group.count = Math.max(0, group.count - 1);
  void inventoryCount;
  return won;
}
