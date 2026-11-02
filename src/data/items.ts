import type { DamageType } from '../engine/types';

export type WeaponClass = 'light' | 'hand' | 'two' | 'bow' | 'sling' | 'crossbow' | 'handgun' | 'rifle' | 'stars' | 'javelin';
export type ItemKind = 'weapon' | 'armor' | 'shield' | 'gear' | 'consumable' | 'magic' | 'valuable' | 'scroll' | 'mushroom' | 'key';

export interface ItemBase {
  id: string;
  name: string;
  kind: ItemKind;
  price?: number; // shop price in gp (undefined = not sold)
  resale?: number;
  icon: string;
  desc: string;
  weapon?: { cls: WeaponClass; ranged: boolean; hands: 1 | 2; mod: number; damage?: DamageType; chooseDamage?: boolean };
  defense?: number;
  armorType?: 'light' | 'heavy' | 'leafsteel' | 'clockwork' | 'elven';
  metallic?: boolean;
  magic?: boolean;
  stack?: boolean;
  /** Counts toward the 3-weapon carry limit */
  weaponSlots?: number;
  freeAction?: boolean;
  maxPerHero?: number;
}

const W = (
  id: string, name: string, price: number, icon: string, cls: WeaponClass, ranged: boolean, hands: 1 | 2, mod: number,
  desc: string, damage?: DamageType, chooseDamage = false,
): ItemBase => ({
  id, name, kind: 'weapon', price, icon, desc, weapon: { cls, ranged, hands, mod, damage, chooseDamage },
  weaponSlots: cls === 'two' ? 2 : 1,
});

export const ITEM_BASES: Record<string, ItemBase> = {
  light_weapon: W('light_weapon', 'Light Weapon', 5, 'light_weapon_slashing', 'light', false, 1, -1, '-1 to Attack. Dagger, knife, club or staff. The -1 is ignored in narrow corridors.', undefined, true),
  hand_weapon: W('hand_weapon', 'Hand Weapon', 6, 'hand_weapon_slashing', 'hand', false, 1, 0, 'Sword, axe, mace or hammer.', undefined, true),
  two_handed: W('two_handed', 'Two-Handed Weapon', 15, 'two_handed_slashing', 'two', false, 2, 1, '+1 to Attack; net -1 in narrow corridors. Needs both hands.', undefined, true),
  bow: W('bow', 'Bow', 15, 'bow', 'bow', true, 2, 0, 'Shoot once before melee. Needs both hands to use.', 'slashing'),
  sling: W('sling', 'Sling', 4, 'sling', 'sling', true, 2, -1, '-1 to Attack. Shoot once before melee.', 'crushing'),
  crossbow: W('crossbow', 'Crossbow', 15, 'crossbow', 'crossbow', true, 2, 1, '+1 to Attack. Spend 1 turn reloading after each shot.', 'slashing'),
  handgun: W('handgun', 'Handgun', 30, 'handgun', 'handgun', true, 1, 2, '+2 to Attack. On a 1 it explodes (1 damage). Reload takes 2 turns. Attracts Wandering Monsters.', 'slashing'),
  rifle: W('rifle', 'Black Powder Rifle', 90, 'rifle', 'rifle', true, 2, 3, '+3 to Attack. On a 1 it explodes (1 damage). Reload takes 2 turns. Attracts Wandering Monsters.', 'slashing'),
  throwing_stars: { ...W('throwing_stars', 'Throwing Stars', 2, 'throwing_stars', 'stars', true, 1, -1, '-1 to Attack, never more than 1 damage. Throw 2 per turn.', 'slashing'), stack: true },
  javelin: W('javelin', 'Javelin', 5, 'light_weapon_slashing', 'javelin', true, 1, -1, 'Light thrown slashing weapon (-1).', 'slashing'),
  nunchaku: W('nunchaku', 'Nunchaku', 5, 'nunchaku', 'hand', false, 1, 0, 'Crushing hand weapon favoured by mushroom monks.', 'crushing'),
  bo_staff: W('bo_staff', 'Bo Staff', 5, 'bo_staff', 'hand', false, 1, 0, 'Crushing hand weapon favoured by mushroom monks.', 'crushing'),
  stake: W('stake', 'Stake', 6, 'stake', 'light', false, 1, -1, 'Light weapon; counts as a hand weapon vs vampires.', 'slashing'),
  crowbar: { ...W('crowbar', 'Crowbar', 10, 'crowbar', 'light', false, 1, -1, 'Crushing light weapon. +1 to bash doors.', 'crushing') },
  torch_weapon: W('torch_weapon', 'Torch (as weapon)', 0, 'torch', 'light', false, 1, -1, '', 'crushing'),
  ten_foot_pole: { ...W('ten_foot_pole', "10' Pole", 2, 'ten_foot_pole', 'two', false, 2, 0, '+1 to Saves vs Traps (not party-wide or random ones). Reroll Search results of 2-4.', 'crushing') },
  shield: { id: 'shield', name: 'Shield', kind: 'shield', price: 5, icon: 'shield', desc: '+1 Defense, -1 Stealth. Needs one hand.', defense: 1, metallic: false },
  light_armor: { id: 'light_armor', name: 'Light Armor', kind: 'armor', price: 10, icon: 'light_armor', desc: '+1 Defense. Non-metallic. -1 to Swimming Saves.', defense: 1, armorType: 'light' },
  heavy_armor: { id: 'heavy_armor', name: 'Heavy Armor', kind: 'armor', price: 30, icon: 'heavy_armor', desc: '+2 Defense. Metallic. -1 Stealth, -2 Swimming/Climbing.', defense: 2, armorType: 'heavy', metallic: true },
  leafsteel_armor: { id: 'leafsteel_armor', name: 'Leafsteel Armor', kind: 'armor', icon: 'leafsteel_armor', desc: '+2 Defense, counts as light armor. The leaves dry out after 3 adventures.', defense: 2, armorType: 'leafsteel', resale: 20 },
  clockwork_armor: { id: 'clockwork_armor', name: 'Clockwork Armor', kind: 'armor', price: 25, icon: 'clockwork_armor', desc: 'Light, metallic. A gnome may spend 1 gadget point to raise it to +3 Defense for the encounter.', defense: 1, armorType: 'clockwork', metallic: true },
  lantern: { id: 'lantern', name: 'Lantern', kind: 'gear', price: 4, icon: 'lantern', desc: 'Light source; needs a hand (or a lantern hook on a shield).' },
  torch: { id: 'torch', name: 'Torches', kind: 'gear', price: 1, icon: 'torch', desc: 'A bundle of 12. Each lasts 6 tiles. Can be used as a light crushing weapon (+2 vs flammable Foes).', stack: true },
  rope: { id: 'rope', name: 'Rope', kind: 'gear', price: 4, icon: 'rope', desc: '+1 to Climbing Saves. Binds subdued Foes.' },
  bandage: { id: 'bandage', name: 'Bandage', kind: 'consumable', price: 5, icon: 'bandage', desc: 'Heals 1 Life. One per hero per adventure, not in combat.', stack: true },
  healing_potion: { id: 'healing_potion', name: 'Healing Potion', kind: 'magic', price: 100, resale: 100, icon: 'healing_potion', desc: 'Heals all damage. Free action. One per hero per adventure.', magic: true, freeAction: true },
  holy_water: { id: 'holy_water', name: 'Holy Water', kind: 'consumable', price: 30, icon: 'holy_water', desc: 'Thrown (1 turn, no free hand needed): automatic damage to undead and demons.', maxPerHero: 1 },
  food: { id: 'food', name: 'Food Ration', kind: 'consumable', price: 1, icon: 'food_ration', desc: 'Feeds one person for a day. Max 10 per hero. Useful as bribes.', stack: true },
  lantern_hook: { id: 'lantern_hook', name: 'Lantern Hook', kind: 'gear', price: 2, icon: 'lantern', desc: 'Hang a lantern on your shield to free a hand.' },
  oil_flask: { id: 'oil_flask', name: 'Flask of Oil', kind: 'consumable', price: 10, icon: 'oil_flask', desc: 'Throw (1 turn) to make a Foe Flammable: torches and fire spells hit it at +2.', maxPerHero: 1 },
  scroll_blessing: { id: 'scroll_blessing', name: 'Scroll of Blessing', kind: 'scroll', price: 100, resale: 50, icon: 'scroll', desc: 'Read (1 turn) to cast Blessing.', magic: true },
  bag_of_nails: { id: 'bag_of_nails', name: 'Bag of Nails', kind: 'consumable', price: 4, icon: 'bag_of_nails', desc: 'One use. Nail a door shut while Resting.', stack: true },
  amulet: { id: 'amulet', name: 'Amulet', kind: 'magic', price: 15, icon: 'amulet', desc: 'Grants 1 Luck point (reroll). Discard after use. One per hero.', magic: true, maxPerHero: 1 },
  talisman: { id: 'talisman', name: 'Talisman', kind: 'magic', price: 10, icon: 'talisman', desc: '+1 to a single Save (choose before rolling). One per hero.', magic: true, maxPerHero: 1 },
  herbal_tonic: { id: 'herbal_tonic', name: 'Herbal Tonic', kind: 'consumable', price: 20, icon: 'herbal_tonic', desc: 'Removes paralysis (1 turn).' },
  scroll_tube: { id: 'scroll_tube', name: 'Scroll Tube', kind: 'gear', price: 4, icon: 'scroll_tube', desc: 'Protects one scroll from destruction.' },
  gremlin_repellant: { id: 'gremlin_repellant', name: 'Gremlin Repellant', kind: 'consumable', price: 5, icon: 'gremlin_repellant', desc: 'Coat one item before an adventure: gremlins will not steal it.', stack: true },
  wolfsbane: { id: 'wolfsbane', name: 'Wolfsbane', kind: 'consumable', price: 10, icon: 'wolfsbane', desc: 'Throw at a werecreature (1 turn) to force a Morale roll.' },
  good_lockpicks: { id: 'good_lockpicks', name: 'Good Lockpicks', kind: 'gear', price: 25, icon: 'lockpicks', desc: '+1 to lockpicking Saves.' },
  lockpicks: { id: 'lockpicks', name: 'Lockpicks', kind: 'gear', icon: 'lockpicks', desc: 'Tools of the trade.', resale: 2 },
  berserker_mushroom: { id: 'berserker_mushroom', name: "Berserker's Mushroom", kind: 'consumable', price: 15, icon: 'berserker_mushroom', desc: 'Free action: +1 to melee Attack for the encounter, then lose 1 Life.', freeAction: true },
  quiver: { id: 'quiver', name: 'Quiver (12 arrows)', kind: 'gear', price: 6, icon: 'bow', desc: 'Replacement quiver. Max 4.', stack: true },
  shot_bag: { id: 'shot_bag', name: 'Bag of Shot (12)', kind: 'gear', price: 20, icon: 'handgun', desc: 'Black powder and bullets. Max 4.', stack: true },
  spellbook: { id: 'spellbook', name: 'Spellbook', kind: 'gear', icon: 'spellbook', desc: "A wizard's personal grimoire." },
  contraption: { id: 'contraption', name: 'Gnome Contraption', kind: 'gear', icon: 'gadget', desc: 'Gears and lenses used to study an illusionist spell. With precision tools (resale 15gp).', resale: 15 },
  red_ring: { id: 'red_ring', name: 'Red Ring', kind: 'gear', icon: 'red_ring', desc: 'A drop of deadly ingestive poison.', resale: 5 },
  green_ring: { id: 'green_ring', name: 'Green Ring', kind: 'gear', icon: 'green_ring', desc: 'Reviving fluid for a dead kukla (once in her lifetime).', resale: 5 },
  spare_parts: { id: 'spare_parts', name: 'Kukla Spare Parts', kind: 'magic', price: 10, icon: 'gadget', desc: 'Repairs 4 Life of a kukla during a long break. Counts as 10gp of treasure.', magic: true, stack: true },
  // Loot / magic
  gem: { id: 'gem', name: 'Gem', kind: 'valuable', icon: 'gem', desc: 'A precious stone.' },
  jewelry: { id: 'jewelry', name: 'Jewelry', kind: 'valuable', icon: 'jewelry', desc: 'A fine piece of jewelry.' },
  scroll: { id: 'scroll', name: 'Scroll', kind: 'scroll', icon: 'scroll', desc: 'A spell ready to cast (1 turn). Casting destroys it.', magic: true },
  prism: { id: 'prism', name: 'Prism', kind: 'scroll', icon: 'prism', desc: 'An illusionist spell etched on crystal.', magic: true },
  bark: { id: 'bark', name: 'Bark', kind: 'scroll', icon: 'bark', desc: 'A druid spell inscribed on bark.', magic: true },
  wand_of_sleep: { id: 'wand_of_sleep', name: 'Wand of Sleep', kind: 'magic', icon: 'wand_of_sleep', desc: 'Spend 1 charge to cast Sleep (+L). Wizards, illusionists and elves only. Resale 30gp/charge.', magic: true },
  ring_teleport: { id: 'ring_teleport', name: 'Ring of Teleportation', kind: 'magic', icon: 'ring_teleport', desc: 'Automatically pass one Defense roll, teleporting out of the combat. One use. Resale 50gp unused.', magic: true, resale: 50 },
  fools_gold: { id: 'fools_gold', name: "Fools' Gold", kind: 'magic', icon: 'fools_gold', desc: 'Automatically satisfies the next Bribe demand. One use. Resale 20gp.', magic: true, resale: 20 },
  magic_weapon: { id: 'magic_weapon', name: 'Magic Weapon', kind: 'weapon', icon: 'magic_weapon', desc: '', magic: true },
  magic_armor: { id: 'magic_armor', name: 'Magic Armor', kind: 'armor', icon: 'heavy_armor', desc: '', magic: true },
  magic_shield: { id: 'magic_shield', name: 'Magic Shield', kind: 'shield', icon: 'shield', desc: '', magic: true, defense: 1 },
  ring_protection: { id: 'ring_protection', name: 'Ring of Protection', kind: 'magic', icon: 'ring_teleport', desc: 'Permanent Defense bonus. Not for barbarians.', magic: true },
  fireball_staff: { id: 'fireball_staff', name: 'Fireball Staff', kind: 'magic', icon: 'fireball_staff', desc: 'Spend 1 charge to cast Fireball (+L). Wizards only. Resale 60gp/charge.', magic: true, weaponSlots: 1 },
  wand_of_power: { id: 'wand_of_power', name: 'Wand of Power', kind: 'magic', icon: 'wand_of_power', desc: 'Wizards only. Spend charges for +1 each to a spellcasting roll (decide before rolling). Resale 20gp/charge.', magic: true },
  enchanted_paint: { id: 'enchanted_paint', name: 'Enchanted Paint', kind: 'magic', icon: 'enchanted_paint', desc: 'Paint a door to create a new passage, or paint a mundane item worth up to 15gp. 1-in-6 chance it runs out. Resale 80gp.', magic: true, resale: 80 },
  prayer_beads: { id: 'prayer_beads', name: 'Prayer Beads', kind: 'magic', icon: 'prayer_beads', desc: 'A cleric may use a bead when praying: 4-6 the Prayer is not spent. Resale 15gp/bead.', magic: true },
  acid_vial: { id: 'acid_vial', name: 'Acid Vial', kind: 'consumable', icon: 'acid_vial', desc: 'Throw: on 2+ deals 1 damage (not undead/golems); on 1 it splashes you. Resale 15gp.', resale: 15 },
  book_of_skalitos: { id: 'book_of_skalitos', name: 'Book of Skalitos', kind: 'magic', icon: 'book_of_skalitos', desc: 'Counts as one scroll of each basic wizard spell. Resale 650gp if unused.', magic: true, resale: 650 },
  shield_of_warning: { id: 'shield_of_warning', name: 'Shield of Warning', kind: 'shield', icon: 'shield', desc: 'Its +1 counts even when surprised, fleeing, or vs Foes that ignore shields. Resale 200gp.', magic: true, defense: 1, resale: 200 },
  arrow_slaying: { id: 'arrow_slaying', name: 'Arrow of Slaying', kind: 'magic', icon: 'arrow_slaying', desc: 'Automatically inflicts 3 damage on its designated Foe. Needs a bow.', magic: true },
  holy_symbol_healing: { id: 'holy_symbol_healing', name: 'Holy Symbol of Healing', kind: 'magic', icon: 'holy_symbol', desc: 'Clerics heal +2 with the Healing prayer. Resale 700gp.', magic: true, resale: 700 },
  horseshoe: { id: 'horseshoe', name: 'Lucky Horseshoe', kind: 'magic', icon: 'horseshoe', desc: 'Reroll a single die roll once. Not for barbarians. Resale 10gp.', magic: true, resale: 10 },
  disinfectant: { id: 'disinfectant', name: 'Disinfectant Paste', kind: 'consumable', icon: 'disinfectant', desc: 'Restores 1 Life lost to infection, poison or disease (not in combat). Resale 7gp.', resale: 7 },
  glittering_crystal: { id: 'glittering_crystal', name: 'Glittering Crystal', kind: 'gear', icon: 'crystal', desc: 'Glows like a lantern; worn around the neck, freeing a hand. Resale 25gp.', resale: 25 },
  map_fragment: { id: 'map_fragment', name: 'Map Fragment', kind: 'gear', icon: 'map_fragment', desc: 'Once, reveal the contents of the next tile before entering (caverns only).' },
  miners_ointment: { id: 'miners_ointment', name: "Miners' Ointment", kind: 'consumable', icon: 'ointment', desc: 'Ignore one Wandering Monster arrival or invisible gremlins. Resale 20gp.', resale: 20 },
  miners_amulet: { id: 'miners_amulet', name: "Miners' Amulet", kind: 'magic', icon: 'amulet', desc: 'Worn by the hero in position 1: ignore 1 Trap in the caverns per adventure. Resale 30gp.', magic: true, resale: 30 },
  chicken_blood: { id: 'chicken_blood', name: 'Jar of Chicken Blood', kind: 'consumable', icon: 'acid_vial', desc: 'Satisfies a Blood Offering.' },
  blade_poison: { id: 'blade_poison', name: 'Blade Poison', kind: 'consumable', icon: 'acid_vial', desc: 'Envenom a slashing weapon or arrow: +1 Attack vs the first Foe you fight (not poison-immune Foes).' },
  salt: { id: 'salt', name: 'Bag of Salt', kind: 'consumable', price: 2, icon: 'food_ration', desc: 'Thrown at fungus leeches, kills 2.' },
  // Mushrooms
  mushroom: { id: 'mushroom', name: 'Rare Mushroom', kind: 'mushroom', icon: 'mushroom', desc: '' },
  purple_crystal: { id: 'purple_crystal', name: 'Purple Crystals', kind: 'valuable', icon: 'crystal', desc: 'Pretty but nearly worthless crystals.' },
};

export const SHOP_LIST = Object.values(ITEM_BASES).filter((b) => b.price !== undefined && b.price > 0 && !['torch_weapon', 'javelin'].includes(b.id));
