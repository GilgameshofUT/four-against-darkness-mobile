import type { Foe } from '../types';

export interface HeroCombat {
  acted: boolean;
  skipTurns: number;
  /** turns remaining to reload crossbow/firearm */
  reload: number;
  /** used ranged weapon this fight in a room -> must draw melee */
  needsDraw: boolean;
  defenseMods: { label: string; value: number; vsMelee?: boolean; until?: 'combat' | 'turn' | 'next' }[];
  attackMods: { label: string; value: number; until?: 'combat' | 'turn' | 'next'; foe?: string }[];
  mirrorImages: number;
  marked?: string; // assassin hide-in-shadows target uid
  hidden?: boolean;
  parry?: boolean;
  asleep?: boolean;
  engulfed?: boolean;
  webbed?: boolean; // goblin spider
  knockedDown?: boolean;
  confused?: boolean;
  firstAttackReceived?: boolean;
  noExplode?: boolean;
  fled?: boolean;
  illusorySword?: number;
  counterBonus?: { foe: string; value: number };
  wildform?: boolean;
  stirged?: boolean;
  bound?: boolean;
}

export interface Ally {
  id: string;
  name: string;
  kind: 'beast' | 'companion' | 'servant' | 'phantom';
  level: number;
  life: number;
  attackBonus: number;
  defenseBonus: number;
  heroId?: string; // owner
  art?: string;
}

export interface CombatState {
  id: string;
  foes: Foe[];
  turn: number;
  corridor: boolean;
  narrow: boolean;
  /** Foes surprised the party (acted first, roll reactions) */
  foesFirstSurprise: boolean;
  /** Wandering monster ambush: attacks from rear, no shield on first defense */
  ambush: boolean;
  /** party surprised the foes (stealth/secret door): foe L -1 first turn */
  partySurprise: boolean;
  heroes: Record<string, HeroCombat>;
  allies: Ally[];
  over: boolean;
  outcome?: 'won' | 'fled' | 'withdrew' | 'wipe' | 'peaceful' | 'bribed' | 'evaded' | 'quest' | 'deal' | 'trial_won' | 'trial_lost' | 'challenge_won' | 'puzzle';
  flags: Record<string, number | boolean | string>;
  /** spells cast this combat for orc morale etc. */
  hitThisTurn: string[];
  trial?: { heroId: string; foeUid: string; turnsLeft: number; heroDmg: number; foeDmg: number };
  /** accumulated XP-relevant info */
  minorDefeated: boolean;
  majorDefeated: string[];
  fireUsedThisTurn?: boolean;
  wanderingBonus?: number;
}
