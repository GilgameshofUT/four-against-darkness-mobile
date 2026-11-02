import type { SpellList } from '../engine/types';

export type SpellTarget = 'foe' | 'foes' | 'ally' | 'self' | 'party' | 'none';

export interface SpellDef {
  id: string;
  list: SpellList;
  name: string;
  desc: string;
  target: SpellTarget;
  /** requires a spellcasting roll vs target L */
  roll: boolean;
  /** usable outside combat */
  outOfCombat?: boolean;
  /** usable in combat */
  inCombat?: boolean;
  fire?: boolean;
  illusion?: boolean;
  outdoorsOnly?: boolean;
  natureOnly?: boolean;
  d12?: number; // index on the d12 random table
}

const s = (o: SpellDef): SpellDef => ({ inCombat: true, ...o });

export const SPELLS: Record<string, SpellDef> = {
  // Wizard basic (d6 table order)
  blessing: s({ id: 'blessing', list: 'wizard', name: 'Blessing', target: 'ally', roll: false, outOfCombat: true, desc: 'Removes a curse, petrification or similar condition. Automatic. Elves cannot cast it.' }),
  escape: s({ id: 'escape', list: 'wizard', name: 'Escape', target: 'self', roll: false, desc: 'The caster teleports to the first tile of the dungeon. Can replace a Defense roll. Automatic.' }),
  lightning: s({ id: 'lightning', list: 'wizard', name: 'Lightning', target: 'foe', roll: true, desc: 'Spellcasting roll vs L: slays 1 Minor Foe or deals 2 damage to a Major Foe.' }),
  fireball: s({ id: 'fireball', list: 'wizard', name: 'Fireball', target: 'foes', roll: true, fire: true, desc: 'Vs Minor Foes: slays (roll - their L) Foes, minimum 1 even on a miss. Vs a Major Foe: 1 damage.' }),
  protection: s({ id: 'protection', list: 'wizard', name: 'Protection', target: 'ally', roll: false, desc: '+1 Defense to the caster or an ally until the end of the encounter. Automatic.' }),
  sleep: s({ id: 'sleep', list: 'wizard', name: 'Sleep', target: 'foes', roll: true, desc: 'Puts to sleep one Major Foe or d6+L Minor Foes. Not vs Unliving, dragons or L11+.' }),
  // Druid (d12)
  disperse_vermin: s({ id: 'disperse_vermin', list: 'druid', name: 'Disperse Vermin', target: 'foes', roll: true, d12: 1, desc: 'Melee-style attack vs Vermin adding 2×L. Dispersed, not killed (no treasure).' }),
  summon_beast: s({ id: 'summon_beast', list: 'druid', name: 'Summon Beast', target: 'none', roll: false, d12: 2, desc: 'A beast (L3 warrior, 5 Life, 1 attack) fights for the party until the end of the encounter.' }),
  water_jet: s({ id: 'water_jet', list: 'druid', name: 'Water Jet', target: 'foe', roll: true, d12: 3, desc: 'On a hit: 2 damage to a fire creature, disperse 2 Vermin, knock out 1 Minion, or distract a Major Foe so the party can flee freely.' }),
  bear_form: s({ id: 'bear_form', list: 'druid', name: 'Bear Form', target: 'self', roll: false, d12: 4, desc: 'Become a bear until the end of combat: fights as a warrior of your L (min 3) with 8 Life. Half the damage taken carries over.' }),
  warp_wood: s({ id: 'warp_wood', list: 'druid', name: 'Warp Wood', target: 'foe', roll: false, outOfCombat: true, d12: 5, desc: 'Destroy a wooden door or open a chest. 2 automatic damage to wooden or plant creatures.' }),
  barkskin: s({ id: 'barkskin', list: 'druid', name: 'Barkskin', target: 'ally', roll: false, d12: 6, desc: '+2 Defense for the encounter (-2 vs fire, -2 agility Saves).' }),
  lightning_strike: s({ id: 'lightning_strike', list: 'druid', name: 'Lightning Strike', target: 'foe', roll: true, outdoorsOnly: true, d12: 7, desc: 'As Lightning, but only outdoors.' }),
  spiderweb: s({ id: 'spiderweb', list: 'druid', name: 'Spiderweb', target: 'foes', roll: false, d12: 8, desc: "One Major Foe or d6 Minor Foes are entangled: -1 L for the encounter. Not fire creatures, spiders or elementals." }),
  entangle: s({ id: 'entangle', list: 'druid', name: 'Entangle', target: 'foes', roll: false, outdoorsOnly: true, d12: 9, desc: 'As Spiderweb, but only in forests, swamps or jungles.' }),
  subdual: s({ id: 'subdual', list: 'druid', name: 'Subdual', target: 'party', roll: false, d12: 10, desc: 'Allies ignore the -1 for Subdual attacks this encounter.' }),
  forest_pathway: s({ id: 'forest_pathway', list: 'druid', name: 'Forest Pathway', target: 'none', roll: false, outdoorsOnly: true, inCombat: false, d12: 11, desc: 'Vegetation parts for the party. Outdoors only.' }),
  alter_weather: s({ id: 'alter_weather', list: 'druid', name: 'Alter Weather', target: 'none', roll: false, outdoorsOnly: true, d12: 12, desc: 'Outdoors only: summon fog, wind or storm; 2 damage to fire/air elementals.' }),
  // Illusionist (d12)
  illusionary_armor: s({ id: 'illusionary_armor', list: 'illusionist', name: 'Illusionary Armor', target: 'self', roll: false, illusion: true, d12: 1, desc: '+Tier Defense until the end of the encounter (not vs Foes immune to illusions).' }),
  mirror_image: s({ id: 'mirror_image', list: 'illusionist', name: 'Illusionary Mirror Image', target: 'self', roll: false, illusion: true, d12: 2, desc: 'Tier+1 images each absorb one attack aimed at you.' }),
  illusionary_servant: s({ id: 'illusionary_servant', list: 'illusionist', name: 'Illusionary Servant', target: 'none', roll: false, illusion: true, outOfCombat: true, d12: 3, desc: 'A servant carries up to 200gp of treasure and extra gear.' }),
  disbelief: s({ id: 'disbelief', list: 'illusionist', name: 'Disbelief', target: 'none', roll: false, d12: 4, outOfCombat: true, desc: 'Dispel all illusions; invisible Foes become visible (their L -2). Reveals invisible gremlins.' }),
  phantasmal_binding: s({ id: 'phantasmal_binding', list: 'illusionist', name: 'Phantasmal Binding', target: 'foe', roll: true, illusion: true, d12: 5, desc: 'Hold a target for Tier turns: attacked at +2, damage may be Subdual.' }),
  illusionary_fog: s({ id: 'illusionary_fog', list: 'illusionist', name: 'Illusionary Fog', target: 'none', roll: false, illusion: true, d12: 6, desc: 'Suspends ranged and gaze attacks; +2 Defense when fleeing or withdrawing.' }),
  glamour_mask: s({ id: 'glamour_mask', list: 'illusionist', name: 'Glamour Mask', target: 'ally', roll: false, illusion: true, outOfCombat: true, d12: 7, desc: 'Reroll a Reaction roll, or impersonate an authority.' }),
  shadow_strike: s({ id: 'shadow_strike', list: 'illusionist', name: 'Shadow Strike', target: 'foe', roll: true, illusion: true, d12: 8, desc: 'On a hit, Tier Subdual damage to a Major Foe or slays Tier Minor Foes.' }),
  specter_swarm: s({ id: 'specter_swarm', list: 'illusionist', name: 'Specter Swarm', target: 'self', roll: false, illusion: true, d12: 9, desc: 'Foes must roll Morale or be unable to attack you this encounter.' }),
  mirage_of_fortune: s({ id: 'mirage_of_fortune', list: 'illusionist', name: 'Mirage of Fortune', target: 'foes', roll: true, illusion: true, d12: 10, desc: 'On a hit, counts as a paid Bribe for Foes with a Bribe Reaction.' }),
  illusionary_banquet: s({ id: 'illusionary_banquet', list: 'illusionist', name: 'Illusionary Banquet', target: 'none', roll: false, illusion: true, outOfCombat: true, inCombat: false, d12: 11, desc: 'Creates Tier+3 illusionary Food rations.' }),
  illusionary_sword: s({ id: 'illusionary_sword', list: 'illusionist', name: 'Illusionary Sword', target: 'self', roll: false, illusion: true, d12: 12, desc: 'For Tier+3 turns attack at +L with a magical (Subdual) sword.' }),
};

export const WIZARD_BASIC = ['blessing', 'escape', 'lightning', 'fireball', 'protection', 'sleep'];
export const DRUID_SPELLS = Object.values(SPELLS).filter((x) => x.list === 'druid').sort((a, b) => a.d12! - b.d12!).map((x) => x.id);
export const ILLUSIONIST_SPELLS = Object.values(SPELLS).filter((x) => x.list === 'illusionist').sort((a, b) => a.d12! - b.d12!).map((x) => x.id);
