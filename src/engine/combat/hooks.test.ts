import { describe, it, expect } from 'vitest';
import { Game } from '../game';
import { ScriptIo } from '../io';
import { newState } from '../state';
import { buildHero } from '../setup/create';
import { STARTING_KITS } from '../../data/starting';
import { TRAITS } from '../../data/traits';
import { makeFoe } from '../foe';
import { armor, hasShieldInHand } from '../hero';
import { onHeroHit } from './hooks';

class CapIo extends ScriptIo {
  pauses: { title: string; text: string }[] = [];
  override async pause(title?: string, text?: string) {
    this.pauses.push({ title: title ?? '', text: text ?? '' });
  }
}

function warriorGame(seed: number) {
  const io = new CapIo();
  const g = new Game(newState(seed), io);
  const kit = STARTING_KITS.warrior[0];
  const { hero } = buildHero(g.s.rng, {
    name: 'W', classId: 'warrior', portrait: 'warrior_1',
    traits: [TRAITS.warrior[0].id], kit: kit.id, damage: {}, choices: {},
  });
  g.s.guild.roster.push(hero);
  g.s.party = [hero.id];
  g.s.combat = { id: 't', foes: [], turn: 1 } as never;
  return { g, io, hero };
}

describe('iron eater gear loss', () => {
  it('devouring a shield demands a click acknowledgement', async () => {
    const { g, io, hero } = warriorGame(7);
    expect(hasShieldInHand(hero)).toBeTruthy();
    const foe = makeFoe(g, 'iron_eater');
    g.s.combat!.foes = [foe];
    await onHeroHit(g, foe, hero, 0, {} as never);
    expect(hasShieldInHand(hero)).toBeUndefined();
    expect(hero.inventory.some((i) => i.base === 'shield')).toBe(false);
    expect(io.pauses).toHaveLength(1);
    expect(io.pauses[0].title).toMatch(/devour/i);
  });

  it('devouring heavy armor demands a click acknowledgement', async () => {
    const { g, io, hero } = warriorGame(8);
    hero.inventory.push({ uid: 'ha1', base: 'heavy_armor', name: 'Heavy Armor' });
    hero.equip.armor = 'ha1';
    expect(armor(hero)?.base).toBe('heavy_armor');
    const foe = makeFoe(g, 'iron_eater');
    g.s.combat!.foes = [foe];
    await onHeroHit(g, foe, hero, 0, {} as never);
    expect(armor(hero)).toBeUndefined();
    // Shield survives when armor goes first.
    expect(hasShieldInHand(hero)).toBeTruthy();
    expect(io.pauses).toHaveLength(1);
  });

  it('no metal: gobbles gold with no modal', async () => {
    const { g, io, hero } = warriorGame(9);
    hero.inventory = hero.inventory.filter((i) => i.base === 'light_armor');
    hero.equip.main = undefined;
    hero.equip.off = undefined;
    g.s.partyGold = 50;
    const foe = makeFoe(g, 'iron_eater');
    g.s.combat!.foes = [foe];
    await onHeroHit(g, foe, hero, 0, {} as never);
    expect(g.s.partyGold).toBeLessThan(50);
    expect(io.pauses).toHaveLength(0);
  });
});
