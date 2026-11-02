import type { ClassId, Env, FoeCategory } from '../../engine/types';

export type ReactionType =
  | 'flee' | 'flee_outnumbered' | 'bribe' | 'fight' | 'fight_death' | 'peaceful' | 'ignore' | 'puzzle' | 'quest'
  | 'magic_challenge' | 'trade_info' | 'capture' | 'blood_offering' | 'trial' | 'offer_food' | 'sleeping' | 'trade'
  | 'buy_weapons' | 'info' | 'ignore_or_fight';

export interface Reaction {
  from: number;
  to: number;
  type: ReactionType;
  /** Bribe spec: '5ea' per foe gp, '60' flat gp, '6d6' rolled gp, 'all' all gp, 'all100' all gp min 100 or 1 magic item,
   *  'food4' food rations total, 'food1ea', 'magic' one magic item, 'scrolls2' 2 scrolls/potions, 'gem50' gem worth 50,
   *  'weapon2h' two-handed weapon, '15|food5' alternatives */
  bribe?: string;
}

/** Special rules handled by engine hooks. Parameters are inline. */
export type Special =
  | { id: 'infection' } // end of encounter 1-in-6 per wounded PC
  | { id: 'spell_penalty'; value: number; ranged?: boolean }
  | { id: 'poison_hit'; L: number | 'H' | 'H+1' | 'H+2'; extraDamage?: number; bonus?: Partial<Record<ClassId, 'L' | 'half' | 'reroll'>>; endOfCombat?: boolean; allHalf?: boolean }
  | { id: 'holy_water_kills'; n: number }
  | { id: 'holy_water_damage'; n: number }
  | { id: 'ranged_immune' }
  | { id: 'crushing_bonus'; value: number }
  | { id: 'arrow_penalty'; value: number }
  | { id: 'fear_magic' } // orcs
  | { id: 'no_magic_loot' }
  | { id: 'regenerate_minion'; chance: number } // trolls
  | { id: 'charge'; value: number } // first defense -1
  | { id: 'no_luck' }
  | { id: 'iron_eater' }
  | { id: 'breath'; chance: number; save: number | 'H+3'; damage: number | 'd3'; kind: 'fire' | 'spore' | 'poison'; allHalf?: boolean; replaceAttacks?: boolean; saveType?: 'defense' | 'save'; firstTurn?: boolean; halflingReroll?: boolean }
  | { id: 'gaze_start'; L: number; effect: 'damage' | 'petrify'; bonus?: Partial<Record<ClassId, 'L' | 'half'>> }
  | { id: 'web_no_flee' }
  | { id: 'gremlins' }
  | { id: 'mummy_rise' }
  | { id: 'flammable'; value: number }
  | { id: 'chaos_powers'; table: 'dungeon' | 'fiendish' }
  | { id: 'dragon_attack' } // young dragon 2 random targets
  | { id: 'echo_level' }
  | { id: 'egg_guard' }
  | { id: 'accumulate' } // vengeance cockroaches
  | { id: 'always_surprise_once' } // stalactomimics attack once
  | { id: 'call_wanderers'; chance: number } // screaming toads
  | { id: 'paralyze_limb' }
  | { id: 'light_defense'; value: number } // morlocks
  | { id: 'heavy_armor_bonus'; value: number; fromTurn?: number }
  | { id: 'flail' } // ignore shield
  | { id: 'ranged_volley'; L: number | 'H+3'; perFoe?: boolean; half?: boolean }
  | { id: 'fire_morale' } // cavemen
  | { id: 'magic_feeder' } // manataur
  | { id: 'battle_cry'; L: number } // hoary ogre
  | { id: 'regenerate_every'; turns: number; amount: number }
  | { id: 'silver_bonus'; value: 'tier' | number }
  | { id: 'siren_song'; L: 'H+2' }
  | { id: 'fire_bear' }
  | { id: 'drillworm' }
  | { id: 'wraith_drain' } // cavern wraith: if not hit, all PCs lose 1
  | { id: 'sludge' } // 1 attack per PC, lightning reduces L
  | { id: 'lightning_vulnerable' }
  | { id: 'minosaur' }
  | { id: 'cornucopia' }
  | { id: 'tar_spit' }
  | { id: 'cough'; L: number } // spore mites -1 attack
  | { id: 'glow' } // glowmaggots
  | { id: 'salt' }
  | { id: 'fireball_kills_all' }
  | { id: 'hallucinate'; L: number } // spore toads -1 def
  | { id: 'no_resurrect' }
  | { id: 'holy_morale' }
  | { id: 'disease_end'; L: number; bonus?: Partial<Record<ClassId, 'L' | 'half'>> }
  | { id: 'sleep_spores_start'; L: number }
  | { id: 'locusts' }
  | { id: 'toadstool_shield' }
  | { id: 'poison_start'; L: number; immune?: ClassId[] }
  | { id: 'claw_curse'; L: number } // fungus hag
  | { id: 'spore_storm'; L: number }
  | { id: 'bounce'; chance: number } // caplord armor
  | { id: 'warp_wood_vulnerable'; levelLoss: number }
  | { id: 'digest' } // shroom colossus
  | { id: 'no_corridor' }
  | { id: 'fire_bonus'; value: 'tier' | number }
  | { id: 'mimic' }
  | { id: 'paralyze_hit'; L: number }
  | { id: 'confuse'; L: number } // hallucinogenic horror
  | { id: 'hydra' }
  | { id: 'end_turn_rot'; L: number } // spore phantom
  | { id: 'druid_bonus' }
  | { id: 'stirge' }
  | { id: 'boil_burst' }
  | { id: 'first_turn_level'; value: number }
  | { id: 'petrify_hit'; L: number }
  | { id: 'revive_once'; on: number } // possessed dwarves
  | { id: 'frenzy' }
  | { id: 'riposte_on_one' }
  | { id: 'slaver_trap' }
  | { id: 'free_slaves' }
  | { id: 'skeleton_summon' }
  | { id: 'blademaster_call'; chance: number }
  | { id: 'lantern_out'; chance: number }
  | { id: 'level_drain_hit'; L: number }
  | { id: 'magic_only' }
  | { id: 'troll_regen' }
  | { id: 'crushing_penalty'; value: number }
  | { id: 'doppelganger' }
  | { id: 'dwarf_hate_death' }
  | { id: 'green_slime' }
  | { id: 'acid_cube' }
  | { id: 'flesh_golem' }
  | { id: 'mantlebeast' }
  | { id: 'statue' }
  | { id: 'milethia' }
  | { id: 'zurla' }
  | { id: 'masterwork_scimitar' }
  | { id: 'goblin_spider' }
  | { id: 'trained_bats' }
  | { id: 'bewitch' }
  | { id: 'jackal_reinforce' }
  | { id: 'lantern_bat' }
  | { id: 'shadow_light' }
  | { id: 'food_bribe_chance'; chance: number }
  | { id: 'ghorl_flee' }
  | { id: 'armor_ignored' }
  | { id: 'extra_damage_on_one'; value: number };

export interface FoeDef {
  id: string;
  name: string;
  env: Env | 'any';
  table: FoeCategory;
  source: 'dungeon' | 'caverns' | 'fungal' | 'fiendish' | 'adventure';
  /** Level = HCL + lv unless fixed set */
  lv: number;
  fixed?: number;
  max?: number;
  /** Minor: count dice expression */
  count?: string;
  /** Major life: number, 'T+3' (Tier+3), 'H+3' (HCL+3), with optional min e.g. 'H+2|4' */
  life?: number | string;
  attacks?: number | string;
  damage?: number | string;
  tags: string[];
  morale?: number;
  noMorale?: boolean;
  treasure?: { rolls?: number; mod?: number; none?: boolean; special?: string };
  reactions: Reaction[];
  immune?: string[];
  specials?: Special[];
  surprise?: number;
  hates?: ClassId[];
  noWandering?: boolean;
  event?: boolean;
  desc: string;
  art?: string;
  unique?: boolean;
}

/** Parse "1-3 flee; 4-6 fight; 2 bribe:5ea" */
export function rx(spec: string): Reaction[] {
  if (spec === 'fight') return [{ from: 1, to: 6, type: 'fight' }];
  if (spec === 'death') return [{ from: 1, to: 6, type: 'fight_death' }];
  return spec.split(';').map((part) => {
    const [range, kind] = part.trim().split(/\s+/);
    const [a, b] = range.split('-').map(Number);
    const [type, bribe] = kind.split(':');
    return { from: a, to: b ?? a, type: type as ReactionType, bribe };
  });
}
