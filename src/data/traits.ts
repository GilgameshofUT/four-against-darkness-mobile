import type { ClassId } from '../engine/types';

export interface TraitDef {
  id: string;
  name: string;
  desc: string;
  /** how often it can be used (for UI badges) */
  uses?: 'adventure' | 'combat' | 'encounter' | 'passive' | 'level';
}

const t = (id: string, name: string, uses: TraitDef['uses'], desc: string): TraitDef => ({ id, name, uses, desc });

export const TRAITS: Record<ClassId, TraitDef[]> = {
  acrobat: [
    t('graceful_dodge', 'Graceful Dodge', 'combat', 'Once per combat, reduce damage from a physical attack by 1 (to a minimum of 0).'),
    t('quick_climber', 'Quick Climber', 'passive', '+Tier on Climbing Saves.'),
    t('master_of_evasion', 'Master of Evasion', 'passive', 'Use the Evade trick without spending Trick points.'),
    t('distracting_feint', 'Distracting Feint', 'combat', 'Once per combat, a Foe skips its next attack. Must be in melee; not from the rear in a corridor.'),
    t('acrobat_distract', 'Distract', 'combat', "Once per combat, for a single turn, reduce a Foe's L by 1. Must be in melee."),
    t('quick_draw', 'Quick Draw Talent', 'passive', 'Swap weapons and still attack in the same turn.'),
  ],
  assassin: [
    t('deadly_precision', 'Deadly Precision', 'adventure', 'Once per adventure, +2 damage on a successful attack vs an unaware Foe (needs a Stealth Save vs its L). Not with Hide in Shadows.'),
    t('poison_expert', 'Poison Expert', 'passive', '+1 on Saves to craft, handle or resist poison.'),
    t('silent_step', 'Silent Step', 'passive', '+Tier to Stealth Saves.'),
    t('lethal_dodge', 'Lethal Dodge', 'passive', 'When your Defense roll Explodes, make an immediate melee attack against that Foe.'),
    t('quick_escape', 'Quick Escape', 'level', 'Once per level per adventure, disengage from a Foe without being attacked.'),
    t('deception', 'Deception', 'passive', '+L on social Saves to bluff, lie or impersonate.'),
  ],
  barbarian: [
    t('beast_slayer', 'Beast Slayer', 'passive', '+1 to Attack vs Weird Monsters.'),
    t('berserk_fighting', 'Berserk Fighting', 'adventure', 'Once per adventure, +1 damage on all attacks for a whole combat. Afterwards -1 to Attack for 6 tiles or until you Rest.'),
    t('herbal_knowledge', 'Herbal Knowledge', 'adventure', 'Once per adventure, prepare herbs to heal d3 Life (not where nothing grows).'),
    t('survival_instinct', 'Survival Instinct', 'adventure', 'Once per adventure, avoid 1 Wandering Monster encounter or 1 Trap before it is played.'),
    t('tough_skinned', 'Tough Skinned', 'combat', 'Once per combat, reduce damage from a single attack by 1.'),
    t('literate', 'Literate', 'passive', 'You can read: gain Clues and information from written texts (still no scroll spells).'),
  ],
  bulwark: [
    t('shieldwall', 'Shieldwall', 'adventure', 'Once per adventure, if you and an adjacent ally both carry shields, both gain +1 Defense vs melee for the encounter.'),
    t('guardian_stance', 'Guardian Stance', 'passive', 'When an adjacent ally is attacked, you may take the hit instead (you roll Defense).'),
    t('iron_will', 'Iron Will', 'passive', 'Reroll failed Saves vs Madness and mental effects. Ignore your first Madness point each adventure.'),
    t('shield_bash', 'Shield Bash', 'combat', 'Once per combat, after a successful Defense roll, attack with your shield at +L in the Foes\' turn.'),
    t('brace_for_impact', 'Brace for Impact', 'combat', 'Once per combat, reduce damage from a single attack by 1.'),
    t('stubborn_endurance', 'Stubborn Endurance', 'adventure', 'Once per adventure, when a blow leaves you at 1 or 0 Life, stay at 2 Life instead.'),
  ],
  cleric: [
    t('blessed_touch', 'Blessed Touch', 'adventure', 'Once per adventure, use 1 turn to heal Tier Life on someone you can touch.'),
    t('sacred_defense', 'Sacred Defense', 'passive', '+1 Defense vs Demons and Undead.'),
    t('divine_protection', 'Divine Protection', 'adventure', 'Once per adventure, +1 to Defense and Saves for one whole combat.'),
    t('holy_resilience', 'Holy Resilience', 'passive', '+1 Life (another at L10).'),
    t('chant_of_valor', 'Chant of Valor', 'adventure', 'Once per adventure, free action: all allies +1 to Attack this turn.'),
    t('strength_of_spirit', 'Strength of Spirit', 'adventure', 'Once per adventure, when a blow drops you to 0 or below, stay at 1 Life.'),
  ],
  dwarf: [
    t('axe_mastery', 'Axe Mastery', 'passive', '+1 to Attack with an axe in melee. You may throw axes as ranged slashing weapons at +L.'),
    t('underground_explorer', 'Underground Explorer', 'passive', '+1 on Search rolls in dungeons and caverns.'),
    t('gold_nose', 'Gold Nose', 'adventure', 'Once per adventure, a random gp amount or variable gem is found at its maximum value.'),
    t('stubborn_resolve', 'Stubborn Resolve', 'adventure', 'Once per adventure: reroll a failed Save vs poison or magic, reroll a failed Defense, or avoid 1 Madness.'),
    t('gem_appraiser', 'Gem Appraiser', 'passive', 'Gems and jewels sell for +30% (instead of +20%).'),
    t('tough_as_stone', 'Tough as Stone', 'combat', 'Reduce damage by 1 from the first physical attack you receive each combat.'),
  ],
  druid: [
    t('wildform', 'Wildform', 'adventure', 'Once per adventure, become a small animal for 1 encounter: +1/2L Defense, cannot attack, automatically evade melee.'),
    t('beast_friend', 'Beast Friend', 'passive', 'Alter Reaction rolls of natural Animals by 1.'),
    t('verdant_blessing', 'Verdant Blessing', 'adventure', 'Once per adventure, restore d3 Life in a natural environment (fungal grottoes count; dungeons do not).'),
    t('leafsteel_familiarity', 'Leafsteel Familiarity', 'passive', '+1 Defense when wearing leafsteel armor.'),
    t('natures_bounty', "Nature's Bounty", 'adventure', 'Once per adventure in the wilds or fungal grottoes, find 2 Food rations or herbs healing 1 Life.'),
    t('rootbind', 'Rootbind', 'adventure', 'Once per adventure, a Foe loses its next turn (not flying, incorporeal or shapeless Foes).'),
  ],
  elf: [
    t('bladesong', 'Bladesong', 'adventure', 'Once per adventure, +1 on all Attack rolls with swords, spears or bows for an encounter.'),
    t('forest_born', 'Forest Born', 'passive', '+1 to navigate/search forests; once per outdoor adventure prevent surprise by Wandering Monsters.'),
    t('fey_grace', 'Fey Grace', 'combat', 'Once per combat, reduce melee damage by 1; you may disengage and flee without being attacked.'),
    t('spellwoven', 'Spellwoven', 'adventure', 'Once per adventure, cast a spell without spending it.'),
    t('silver_tongue', 'Silver Tongue', 'passive', '+Tier on Saves to persuade, woo or negotiate.'),
    t('elidras_melody', "Elidra's Melody", 'adventure', 'Once per adventure, stop a creature attacking for a turn, or reroll a Reaction roll.'),
  ],
  gnome: [
    t('fixer', 'Fixer', 'passive', 'L+8 gadget points (instead of L+6).'),
    t('illusionists_trick', "Illusionist's Trick", 'adventure', 'Once per adventure, cast any illusionist spell without using a slot.'),
    t('clockwork_specialist', 'Clockwork Armor Specialist', 'passive', 'In clockwork armor, +1 Defense vs the first attack each combat.'),
    t('trap_expert', 'Trap Expert', 'passive', '+Tier to disarm Traps and pick locks (also with gadgets).'),
    t('keen_nose', 'Keen Nose', 'adventure', '+2 vs gases. Once per adventure, cancel the Foes surprising the party.'),
    t('clockwork_grenadier', 'Clockwork Grenadier', 'adventure', 'Once per adventure, throw a 2-damage grenade before melee (not if surprised).'),
  ],
  halfling: [
    t('lucky_sidestep', 'Lucky Sidestep', 'level', 'Once per adventure per level, reroll a failed Save.'),
    t('nimble_dodge', 'Nimble Dodge', 'passive', '+1 to Defense rolls.'),
    t('sling_skill', 'Sling Skill', 'passive', '+Tier to Attack with slings.'),
    t('iron_stomach', 'Iron Stomach', 'passive', 'Immune to ingested poison, +Tier vs poison and gases, +1 Life.'),
    t('fungi_forager', 'Fungi Forager', 'adventure', 'Once per adventure near mushrooms: a rare specimen (3d6gp), an extra Nourishing Meal, healing d6 Life, or double mushroom rations.'),
    t('comforting_cook', 'Comforting Cook', 'passive', 'When you Rest (using 1 Food), you and one ally recover 1 extra Life.'),
  ],
  illusionist: [
    t('phantom_reflex', 'Phantom Reflex', 'combat', 'Once per combat, an Illusionary Double takes a hit for you (not vs artificial Foes).'),
    t('glamour_specialist', 'Glamour Specialist', 'passive', '+Tier on social Saves using disguise illusions.'),
    t('misdirection', 'Misdirection', 'adventure', 'Once per adventure, a Foe attacks a phantom (defends at +your L) until it is hit.'),
    t('shadow_adept', 'Shadow Adept', 'passive', '+Tier when casting Shadow Strike; its damage counts as magical.'),
    t('hazy_veil', 'Hazy Veil', 'adventure', 'Once per adventure, +Tier Defense until the end of the encounter.'),
    t('spectral_trickster', 'Spectral Trickster', 'adventure', 'Once per adventure after casting an illusion, vanish: flee without attack or make an out-of-turn attack at +Tier.'),
  ],
  kukla: [
    t('hair_mastery', 'Hair Mastery', 'adventure', 'Once per adventure, disarm a Trap or open a lock with your hair at +L.'),
    t('hidden_blade', 'Hidden Blade', 'encounter', 'Once per encounter, free action surprise attack with +Tier damage.'),
    t('unyielding_form', 'Unyielding Form', 'adventure', 'Once per adventure, ignore up to 2 damage during a single combat.'),
    t('creepy_charm', 'Creepy Charm', 'passive', 'Reroll the Reaction roll of living Foes.'),
    t('hair_bind', 'Hair Bind', 'adventure', 'Once per adventure, restrain a human-sized or smaller Foe for 2 turns (its L -2).'),
    t('clockwork_reflexes', 'Clockwork Reflexes', 'passive', 'Reroll failed Saves vs Traps and failed Defense vs ranged attacks.'),
  ],
  light_gladiator: [
    t('blade_mastery', 'Blade Mastery', 'combat', 'Once per combat, reroll a failed melee Attack.'),
    t('quick_feint', 'Quick Feint', 'adventure', "Once per adventure, forgo an attack to reduce a Foe's L by 2 vs your next attack."),
    t('arena_reflexes', 'Arena Reflexes', 'combat', 'Once per combat, after a successful Defense, flee melee without being attacked.'),
    t('nimble_step', 'Nimble Step', 'passive', '+Tier on Saves to avoid Traps and area dangers.'),
    t('twin_strike_precision', 'Twin Strike Precision', 'passive', 'If both your attacks hit the same Foe, +1 damage.'),
    t('opportunist', 'Opportunist', 'combat', 'Once per combat, after a successful Defense, free off-hand attack on that Foe.'),
  ],
  mushroom_monk: [
    t('abundant_spores', 'Abundant Spores', 'passive', 'Use Spores one additional time per adventure.'),
    t('high_kicks', 'High Kicks', 'passive', 'Unarmed kicks ignore the -1; on a 1 you fall and lose your next turn.'),
    t('poisonous_flesh', 'Poisonous Flesh', 'combat', 'Once per combat, a living Foe that bites you takes 1 damage 2 turns later.'),
    t('fruitful', 'Fruitful', 'adventure', 'Once per adventure, your body sprouts d3 Food rations.'),
    t('slow_regeneration', 'Slow Regeneration', 'adventure', 'Recover 1 extra Life per adventure.'),
    t('tough_cap', 'Tough Cap', 'passive', '+1 to Defense rolls.'),
  ],
  paladin: [
    t('armor_mastery', 'Armor Mastery', 'combat', 'Once per combat in heavy armor, reduce damage from a physical attack by 1.'),
    t('mounted_fighter', 'Mounted Fighter', 'passive', '+Tier to Attack while mounted.'),
    t('challenge', 'Challenge', 'passive', 'Force a Foe to target only you for the whole combat.'),
    t('oathbound', 'Oathbound', 'passive', '+L on Saves vs effects forcing you to attack an ally or flee.'),
    t('paladin_shield_wall', 'Shield Wall', 'passive', 'With a shield, adjacent to an ally with a shield: both +1 Defense.'),
    t('encouraging_presence', 'Encouraging Presence', 'passive', 'Leading the Marching Order, all allies +Tier vs Fear, Terror and Madness.'),
  ],
  ranger: [
    t('deadeye', 'Deadeye', 'passive', '+1 to ranged attacks with bows and crossbows.'),
    t('track_master', 'Track Master', 'passive', 'Save +L vs Foe L to ignore surprise from Wandering Monsters.'),
    t('forager', 'Forager', 'adventure', 'Once per adventure (where possible), find 4 Rations or herbs healing d6 Life.'),
    t('beast_whisperer', 'Beast Whisperer', 'passive', 'Alter Reaction rolls of wild Animals by 2.'),
    t('snare_master', 'Snare Master', 'adventure', 'Once per adventure, automatically disarm an outdoor snare.'),
    t('stealth_master', 'Stealth Master', 'passive', '+Tier to Stealth outdoors.'),
  ],
  rogue: [
    t('knife_fighter', 'Knife Fighter', 'passive', '+Tier to Attack with daggers and throwing knives.'),
    t('evasion', 'Evasion', 'adventure', 'Once per adventure, automatically succeed a Save to avoid damage or an effect.'),
    t('shadow_walker', 'Shadow-walker', 'passive', '+Tier to Stealth.'),
    t('delicate_touch', 'Delicate Touch', 'passive', '+Tier to lockpicking and disarming Traps.'),
    t('street_thug', 'Street Thug', 'passive', '+1 Life. May use hand weapons and starts with one.'),
    t('backstabber', 'Backstabber', 'passive', 'Your +L vs outnumbered Foes also applies vs Major Foes.'),
  ],
  swashbuckler: [
    t('flourishing_strike', 'Flourishing Strike', 'combat', 'Once per combat, after a hit, make another off-hand attack.'),
    t('daring_escape', 'Daring Escape', 'adventure', 'Once per adventure, disengage without being attacked; an ally gets +1 on their next Attack.'),
    t('riposte', 'Riposte', 'combat', 'Once per combat, when a Foe misses you, counterattack with your off-hand.'),
    t('lucky_hat', 'Lucky Hat', 'adventure', 'Once per adventure, reroll a failed Defense at +1. On a 1, the hat is destroyed.'),
    t('taunt', 'Taunt', 'combat', "Once per combat, a Foe's L is reduced by Tier on its next turn (not Weird Monsters or Unliving)."),
    t('blade_dance', 'Blade Dance', 'adventure', 'Once per adventure, spend any Panache for +1 each to your next Attack and Defense.'),
  ],
  warrior: [
    t('good_shot', 'Good Shot', 'passive', '+1 to ranged Attack rolls.'),
    t('shield_expert', 'Shield Expert', 'adventure', 'Once per adventure with a shield, reduce damage from one attack by 1.'),
    t('power_strike', 'Power Strike', 'adventure', 'Once per adventure, after an Attack roll, inflict +1 damage.'),
    t('team_tactics', 'Intuitive Team Tactics', 'combat', "Once per combat, +1 to an ally's Attack or Defense roll (not if surprised)."),
    t('tight_guard', 'Tight Guard', 'passive', '+1 Defense vs the first attack targeting you each combat.'),
    t('weapon_training', 'Sword/Mace Training', 'passive', '+Tier to Attack with your chosen sword or mace.'),
  ],
  wizard: [
    t('arcane_memory', 'Arcane Memory', 'passive', '+1 spell slot.'),
    t('keen_observer', 'Keen Observer', 'passive', '+1 on Search rolls.'),
    t('spell_efficiency', 'Spell Efficiency', 'adventure', 'Once per adventure, cast a spell without spending it.'),
    t('sygilist', 'Sygilist', 'passive', '+Tier when casting from scrolls or inscriptions.'),
    t('scrapper', 'Scrapper', 'passive', '+1 Defense; ignore the -1 with your chosen light weapon.'),
    t('specialist', 'Specialist', 'passive', '+Tier when casting your chosen spell (Lightning, Sleep or Fireball).'),
  ],
};

export function findTrait(id: string): TraitDef | undefined {
  for (const list of Object.values(TRAITS)) {
    const t = list.find((x) => x.id === id);
    if (t) return t;
  }
}
