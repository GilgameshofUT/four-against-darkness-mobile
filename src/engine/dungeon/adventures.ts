import type { Game } from '../game';
import type { Foe, Tile } from '../types';
import { FOES } from '../../data/foes';
import { rollTreasure } from './treasure';
import { fightFoe } from './fight';

const WITCH_TABLES = {
  vermin: ['witch_rats', 'witch_rats', 'witch_rats', 'kobold_skeletons', 'kobold_skeletons', 'kobold_skeletons'],
  minion: ['trained_bats', 'kobold_scouts', 'milethia_zombies', 'icy_shadows', 'jackal_men', 'deep_hags'],
  weird: ['witch_iron_eater', 'witch_iron_eater', 'witch_iron_eater', 'witch_giant_spider', 'witch_giant_spider', 'witch_giant_spider'],
  boss: ['witch_mummy', 'witch_mummy', 'witch_mummy', 'witch_ogre', 'witch_ogre', 'witch_ogre'],
};

/** The Witch's Cave: Milethia appears from tile 4 (6+ on d6 + majors met) or automatically in tile 12. Returns true if handled. */
export async function witchRoom(g: Game, t: Tile): Promise<boolean> {
  const d = g.s.dungeon!;
  if (d.keywords.includes('milethia_met')) {
    if (t.content.type === 'encounter') return witchEncounter(g, t);
    return false;
  }
  if (t.enteredOrder! >= 12) {
    await meetMilethia(g);
    return true;
  }
  if (t.content.type === 'encounter') return witchEncounter(g, t);
  return false;
}

async function witchEncounter(g: Game, t: Tile): Promise<boolean> {
  const d = g.s.dungeon!;
  if (t.content.type !== 'encounter') return false;
  const table = WITCH_TABLES[t.content.table];
  const r = await g.tableRoll(`Milethia's Cave ${t.content.table}`, 'd6', { context: [...new Set(table)].map((id) => FOES[id].name).join(' / ') });
  const id = table[r - 1];
  const major = FOES[id].table === 'weird' || FOES[id].table === 'boss';
  if (major && !d.keywords.includes('milethia_met') && (t.enteredOrder ?? 0) >= 4) {
    d.majorFoesMet++;
    const roll = await g.tableRoll('Is it Milethia?', 'd6', { mods: [{ label: 'Major Foes met', value: d.majorFoesMet - 1 }], context: '6+: you find the witch' });
    if (roll >= 6) {
      await meetMilethia(g);
      return true;
    }
    await fightFoe(g, id, { noBossCheck: true });
    return true;
  }
  if (major) d.majorFoesMet++;
  await fightFoe(g, id, { noBossCheck: true });
  return true;
}

async function meetMilethia(g: Game) {
  const d = g.s.dungeon!;
  d.keywords.push('milethia_met');
  if (d.keywords.includes('milethia_secret')) {
    const spare = await g.choose('Milethia the Witch', [
      { value: 'fight', label: 'Fight her' },
      { value: 'spare', label: 'Spare her and reveal the truth', desc: 'Forfeit the bounty and her treasure; gain 2 XP rolls (different heroes).' },
    ], { art: 'monsters/milethia', text: 'You know why she cursed Parkalon. She wants only to free her son.' });
    if (spare === 'spare') {
      d.finalBossSlain = true;
      d.keywords.push('alternate_ending');
      const { grantXpRoll } = await import('../xp');
      await grantXpRoll(g, 'Alternate ending');
      await grantXpRoll(g, 'Alternate ending');
      await g.say('A different justice', 'You return to the city and reveal the truth about Parkalon to the authorities.', 'monsters/milethia');
      return;
    }
  }
  const res = await fightFoe(g, 'milethia', { noBossCheck: true, intro: 'Milethia the Witch rises from her cauldron, dagger in hand, curses on her lips!' });
  if (res?.outcome === 'won') {
    d.finalBossSlain = true;
    const { grantXpRoll } = await import('../xp');
    await grantXpRoll(g, 'Milethia defeated');
    g.s.dungeon!.keywords.push('bounty_100');
  }
}

export async function milethiaSecret(g: Game) {
  g.s.dungeon!.keywords.push('milethia_secret');
  await g.say("Milethia's Secret", '"To Milethia. The love we once shared is now only hatred. Do not dare approach our son again, or I will have you arrested for witchcraft… No longer yours, Parkalon."\n\nMilethia cursed the captain because he stole their child.', 'items/clue');
}

/** Unique treasures for specific foes. */
export async function specialTreasure(g: Game, f: Foe) {
  const tile = g.s.dungeon!.tiles[g.s.dungeon!.currentTile];
  switch (f.treasure.special) {
    case 'statue':
      g.addGold(g.roll('3d6x10') * (f.finalBoss ? 1 : 1), 'inside the statue');
      if (f.finalBoss) g.addGold(Math.max(0, 100 - 0), 'Final Boss');
      return;
    case 'caplord':
      await g.distribute(g.newItem('leafsteel_armor', { name: 'Fungal Armor', adventuresLeft: 3 }));
      await g.distribute(g.newItem('hand_weapon', { name: 'Sporeblade', damage: 'slashing' }));
      return;
    case 'goods': {
      const { tradeWithPickers } = await import('./events');
      return tradeWithPickers(g);
    }
    case 'kelak':
      return void (await g.distribute(g.newItem('hand_weapon', { name: 'Masterwork Scimitar', masterwork: true, damage: 'slashing', value: 100, data: { thin: true } })));
    case 'zurla':
      g.addGold(25, "Zurla's bag");
      const { randomSpell } = await import('./treasure');
      return void (await g.distribute(randomSpell(g, 'wizard')));
    case 'ghorl':
      g.addGold(6, "Ghorl's pouch");
      return void (await g.distribute(g.newItem('purple_crystal', { qty: g.roll('d6+2'), value: 1, name: 'Purple crystals' })));
    case 'clue2':
      return rollTreasure(g, { env: tile.env, mod: f.treasure.mod });
  }
}
