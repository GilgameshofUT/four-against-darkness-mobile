import type { GameState, Settings, Hero, ClassId } from './types';
import { makeRng } from './rng';
import { CLASSES } from '../data/classes';

export const SAVE_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  xpSystem: 'classic',
  doorTable: true,
  torchDuration: true,
  arrowTracking: true,
  tileLimit: 0,
  fiendishFoes: 'off',
  autoContinue: false,
  haptics: true,
  sound: true,
  caverns: true,
  fungal: true,
  traits: true,
};

export function newState(seed?: number): GameState {
  return {
    version: SAVE_VERSION,
    rng: makeRng(seed),
    uid: 0,
    settings: { ...DEFAULT_SETTINGS },
    guild: { roster: [], gold: 0, clues: 0, stash: [], graveyard: [], adventuresCompleted: 0, favors: 0, oldSchoolXp: {}, storedXp: {} },
    mode: 'title',
    party: [],
    log: [],
    logN: 0,
    partyGold: 0,
    clues: 0,
    xpTally: { minorEncounters: 0 },
  };
}

export function blankHero(id: string, name: string, classId: ClassId, portrait: string): Hero {
  const h: Hero = {
    id, name, classId, level: 1, portrait, traits: [], life: 0, bonusLife: 0, madness: 0, status: 'ok', inventory: [], equip: {},
    choices: {}, spells: [], spellbook: [], burnedPages: [], resources: {}, used: { adventure: {}, combat: {}, level: {} }, conditions: [],
    swornEnemies: [], survival: [], milestones: {}, milestonesDone: [], secrets: [], kills: { minorEncounters: 0, major: 0, total: 0 }, adventures: 0, createdAt: Date.now(),
  };
  h.life = CLASSES[classId].lifeBase + 1;
  return h;
}
