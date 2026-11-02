import type { ClassId, CoreClass } from '../engine/types';

export type Bonus = 'L' | 'half' | 'tier' | 'none' | 'one';
export type WeaponCat = 'light' | 'hand' | 'two' | 'bow' | 'sling' | 'crossbow' | 'firearm' | 'stars' | 'javelin';

export interface ClassDef {
  id: ClassId;
  name: string;
  role: string;
  blurb: string;
  difficulty: 1 | 2 | 3;
  core: boolean;
  rare?: boolean;
  lifeBase: number;
  wealth: string;
  attackMelee: Bonus;
  attackRanged: Bonus;
  defense: Bonus;
  stealth: Bonus;
  savesAs: CoreClass;
  armor: { light: boolean; heavy: boolean; shield: boolean };
  weapons: WeaponCat[];
  /** Cast from scrolls bonus: 'L' (+L), 'one' (+1 as L1 caster), 'none' (cannot) */
  scroll: Bonus;
  canUseMagicItems: boolean;
  tags: string[]; // fighter, spellcaster, forester, small, unliving, elf...
  strengths: string[];
}

const ALL: WeaponCat[] = ['light', 'hand', 'two', 'bow', 'sling', 'crossbow', 'stars', 'javelin'];
const ALL_FIRE: WeaponCat[] = [...ALL, 'firearm'];
const LIGHTR: WeaponCat[] = ['light', 'sling', 'stars', 'javelin'];

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: { id: 'warrior', name: 'Warrior', role: 'Fighter', blurb: 'Trained soldier. Adds +L to every attack and can use any armor or weapon.', difficulty: 1, core: true, lifeBase: 6, wealth: '2d6', attackMelee: 'L', attackRanged: 'L', defense: 'none', stealth: 'none', savesAs: 'warrior', armor: { light: true, heavy: true, shield: true }, weapons: ALL_FIRE, scroll: 'one', canUseMagicItems: true, tags: ['fighter'], strengths: ['Attack', 'Toughness', 'Bashing doors'] },
  barbarian: { id: 'barbarian', name: 'Barbarian', role: 'Fighter', blurb: 'The toughest hero, with Rage attacks. Shuns magic and cannot read.', difficulty: 1, core: true, lifeBase: 7, wealth: 'd6', attackMelee: 'L', attackRanged: 'L', defense: 'none', stealth: 'half', savesAs: 'barbarian', armor: { light: true, heavy: false, shield: true }, weapons: ALL, scroll: 'none', canUseMagicItems: false, tags: ['fighter'], strengths: ['Life', 'Rage', 'Poison Saves'] },
  elf: { id: 'elf', name: 'Elf', role: 'Fighter / Caster', blurb: 'Sword-wielding mage. +L to attacks and to wizard spells, but no shield when casting.', difficulty: 2, core: true, lifeBase: 4, wealth: '2d6', attackMelee: 'L', attackRanged: 'L', defense: 'none', stealth: 'one', savesAs: 'elf', armor: { light: true, heavy: true, shield: true }, weapons: ALL, scroll: 'L', canUseMagicItems: true, tags: ['fighter', 'spellcaster', 'elf'], strengths: ['Versatile', 'Spells', 'Bow'] },
  dwarf: { id: 'dwarf', name: 'Dwarf', role: 'Fighter', blurb: 'Hard-hitting and greedy. Smells gold, hates goblins, good vs giants.', difficulty: 1, core: true, lifeBase: 5, wealth: '3d6', attackMelee: 'L', attackRanged: 'none', defense: 'none', stealth: 'half', savesAs: 'dwarf', armor: { light: true, heavy: true, shield: true }, weapons: ALL_FIRE, scroll: 'one', canUseMagicItems: true, tags: ['fighter'], strengths: ['Melee', 'Gold Sense', 'Gems'] },
  cleric: { id: 'cleric', name: 'Cleric', role: 'Healer', blurb: 'Heals and blesses with prayers. Smites the undead at +L.', difficulty: 1, core: true, lifeBase: 4, wealth: 'd6', attackMelee: 'half', attackRanged: 'half', defense: 'none', stealth: 'half', savesAs: 'cleric', armor: { light: true, heavy: true, shield: true }, weapons: ['light', 'hand', 'two', 'sling'], scroll: 'one', canUseMagicItems: true, tags: [], strengths: ['Healing', 'Blessing', 'Undead'] },
  rogue: { id: 'rogue', name: 'Rogue', role: 'Specialist', blurb: 'Disarms traps, picks locks, dodges blows. Deadly against outnumbered foes.', difficulty: 2, core: true, lifeBase: 3, wealth: '3d6', attackMelee: 'none', attackRanged: 'none', defense: 'L', stealth: 'L', savesAs: 'rogue', armor: { light: true, heavy: false, shield: false }, weapons: ['light', 'sling', 'stars', 'javelin'], scroll: 'one', canUseMagicItems: true, tags: [], strengths: ['Traps', 'Locks', 'Stealth', 'Defense'] },
  wizard: { id: 'wizard', name: 'Wizard', role: 'Caster', blurb: 'Frail but powerful: Fireball, Sleep, Lightning. Best at puzzles.', difficulty: 2, core: true, lifeBase: 2, wealth: '4d6', attackMelee: 'none', attackRanged: 'none', defense: 'none', stealth: 'none', savesAs: 'wizard', armor: { light: false, heavy: false, shield: false }, weapons: ['light', 'sling'], scroll: 'L', canUseMagicItems: true, tags: ['spellcaster'], strengths: ['Area spells', 'Puzzles', 'Magic Saves'] },
  halfling: { id: 'halfling', name: 'Halfling', role: 'Specialist', blurb: 'Lucky, stealthy cook. Luck points reroll anything; great Saves.', difficulty: 1, core: true, lifeBase: 3, wealth: '2d6', attackMelee: 'none', attackRanged: 'none', defense: 'none', stealth: 'L', savesAs: 'halfling', armor: { light: true, heavy: false, shield: false }, weapons: ['light', 'sling'], scroll: 'one', canUseMagicItems: true, tags: ['small'], strengths: ['Luck', 'Saves', 'Meals', 'Stealth'] },
  acrobat: { id: 'acrobat', name: 'Acrobat', role: 'Specialist', blurb: 'Nimble tumbler with Trick points: evade, distract, flip kick.', difficulty: 3, core: false, lifeBase: 3, wealth: 'd6', attackMelee: 'half', attackRanged: 'half', defense: 'L', stealth: 'L', savesAs: 'rogue', armor: { light: false, heavy: false, shield: false }, weapons: LIGHTR, scroll: 'one', canUseMagicItems: true, tags: [], strengths: ['Defense', 'Tricks', 'Falls'] },
  assassin: { id: 'assassin', name: 'Assassin', role: 'Fighter / Specialist', blurb: 'Hides in shadows to mark a target, then strikes for triple damage.', difficulty: 2, core: false, lifeBase: 3, wealth: '5d6', attackMelee: 'L', attackRanged: 'L', defense: 'none', stealth: 'L', savesAs: 'rogue', armor: { light: true, heavy: false, shield: false }, weapons: ALL_FIRE, scroll: 'one', canUseMagicItems: true, tags: ['fighter'], strengths: ['Burst damage', 'Stealth', 'Locks'] },
  bulwark: { id: 'bulwark', name: 'Bulwark', role: 'Defender', blurb: 'A living wall of shield and steel. Heals last.', difficulty: 2, core: false, rare: true, lifeBase: 7, wealth: 'd6', attackMelee: 'half', attackRanged: 'tier', defense: 'half', stealth: 'none', savesAs: 'warrior', armor: { light: true, heavy: true, shield: true }, weapons: ALL, scroll: 'one', canUseMagicItems: true, tags: [], strengths: ['Life', 'Defense', 'Protecting allies'] },
  druid: { id: 'druid', name: 'Druid', role: 'Caster', blurb: 'Nature magic: bear form, summon beast, spiderweb. Has an animal companion.', difficulty: 3, core: false, lifeBase: 3, wealth: '2d6', attackMelee: 'half', attackRanged: 'half', defense: 'none', stealth: 'half', savesAs: 'cleric', armor: { light: true, heavy: false, shield: true }, weapons: ['light', 'sling', 'bow', 'javelin'], scroll: 'half', canUseMagicItems: true, tags: ['spellcaster', 'forester'], strengths: ['Summons', 'Companion', 'Vermin'] },
  gnome: { id: 'gnome', name: 'Gnome', role: 'Specialist / Caster', blurb: 'Gadgeteer with grenades, smoke bombs and one illusion spell.', difficulty: 3, core: false, lifeBase: 4, wealth: '4d6', attackMelee: 'none', attackRanged: 'none', defense: 'half', stealth: 'none', savesAs: 'rogue', armor: { light: true, heavy: false, shield: false }, weapons: ['light', 'sling', 'hand', 'bow', 'firearm'], scroll: 'one', canUseMagicItems: true, tags: ['spellcaster', 'small'], strengths: ['Gadgets', 'Traps', 'Poison resistance'] },
  illusionist: { id: 'illusionist', name: 'Illusionist', role: 'Caster', blurb: 'Distracting lights, mirror images and phantasmal binding.', difficulty: 3, core: false, lifeBase: 2, wealth: '3d6', attackMelee: 'none', attackRanged: 'none', defense: 'none', stealth: 'half', savesAs: 'wizard', armor: { light: false, heavy: false, shield: false }, weapons: LIGHTR, scroll: 'L', canUseMagicItems: true, tags: ['spellcaster'], strengths: ['Debuffs', 'Light source', 'Defense spells'] },
  kukla: { id: 'kukla', name: 'Kukla', role: 'Specialist', blurb: 'A living doll: immune to poison, cannot be healed by magic, prehensile hair.', difficulty: 3, core: false, rare: true, lifeBase: 5, wealth: '3d6', attackMelee: 'none', attackRanged: 'none', defense: 'half', stealth: 'half', savesAs: 'rogue', armor: { light: false, heavy: false, shield: false }, weapons: LIGHTR, scroll: 'one', canUseMagicItems: true, tags: ['unliving', 'small'], strengths: ['Immunities', 'Locks', 'Secret compartment'] },
  light_gladiator: { id: 'light_gladiator', name: 'Light Gladiator', role: 'Fighter', blurb: 'Two light blades, two attacks a turn, or parry.', difficulty: 2, core: false, lifeBase: 5, wealth: 'd6', attackMelee: 'half', attackRanged: 'none', defense: 'half', stealth: 'none', savesAs: 'warrior', armor: { light: true, heavy: false, shield: false }, weapons: ['light'], scroll: 'one', canUseMagicItems: true, tags: [], strengths: ['Two attacks', 'Parry', 'Counters'] },
  mushroom_monk: { id: 'mushroom_monk', name: 'Mushroom Monk', role: 'Fighter', blurb: 'Fungal martial artist: flurries of blows and choking spores.', difficulty: 3, core: false, rare: true, lifeBase: 4, wealth: 'd6', attackMelee: 'half', attackRanged: 'half', defense: 'half', stealth: 'half', savesAs: 'cleric', armor: { light: false, heavy: false, shield: false }, weapons: ALL, scroll: 'one', canUseMagicItems: true, tags: [], strengths: ['Martial arts', 'Spores', 'Immunities'] },
  paladin: { id: 'paladin', name: 'Paladin', role: 'Fighter / Healer', blurb: 'Holy warrior with prayer points for healing and rerolls. Never retreats.', difficulty: 2, core: false, lifeBase: 6, wealth: 'd6', attackMelee: 'L', attackRanged: 'L', defense: 'none', stealth: 'none', savesAs: 'warrior', armor: { light: true, heavy: true, shield: true }, weapons: ALL, scroll: 'one', canUseMagicItems: true, tags: ['fighter'], strengths: ['Attack', 'Healing', 'Fear immunity'] },
  ranger: { id: 'ranger', name: 'Ranger', role: 'Fighter', blurb: 'Hunter with a Sworn Enemy and dual-wielding or double shots outdoors.', difficulty: 2, core: false, lifeBase: 6, wealth: '2d6', attackMelee: 'L', attackRanged: 'L', defense: 'none', stealth: 'half', savesAs: 'warrior', armor: { light: true, heavy: false, shield: true }, weapons: ['light', 'hand', 'bow', 'sling', 'crossbow', 'stars', 'javelin'], scroll: 'one', canUseMagicItems: true, tags: ['fighter', 'forester'], strengths: ['Sworn Enemy', 'Two weapons', 'Tracking'] },
  swashbuckler: { id: 'swashbuckler', name: 'Swashbuckler', role: 'Fighter', blurb: 'Two attacks a turn and Panache earned with every kill.', difficulty: 2, core: false, lifeBase: 4, wealth: '2d6', attackMelee: 'half', attackRanged: 'half', defense: 'half', stealth: 'half', savesAs: 'rogue', armor: { light: false, heavy: false, shield: false }, weapons: ['light', 'hand', 'sling', 'firearm', 'stars', 'javelin'], scroll: 'one', canUseMagicItems: true, tags: [], strengths: ['Two attacks', 'Panache', 'Style'] },
};

export const CLASS_ORDER: ClassId[] = [
  'warrior', 'barbarian', 'dwarf', 'elf', 'cleric', 'rogue', 'wizard', 'halfling',
  'paladin', 'ranger', 'assassin', 'swashbuckler', 'light_gladiator', 'bulwark', 'acrobat',
  'druid', 'illusionist', 'gnome', 'mushroom_monk', 'kukla',
];
