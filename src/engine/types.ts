import type { RngState } from './rng';
import type { Mod, RollResult } from './dice';

export type ClassId =
  | 'acrobat' | 'assassin' | 'barbarian' | 'bulwark' | 'cleric' | 'dwarf' | 'druid' | 'elf' | 'gnome' | 'halfling'
  | 'illusionist' | 'kukla' | 'light_gladiator' | 'mushroom_monk' | 'paladin' | 'ranger' | 'rogue' | 'swashbuckler'
  | 'warrior' | 'wizard';
export type CoreClass = 'warrior' | 'barbarian' | 'elf' | 'dwarf' | 'cleric' | 'rogue' | 'wizard' | 'halfling';
export type Env = 'dungeon' | 'caverns' | 'fungal';
export type DamageType = 'crushing' | 'slashing';
export type SpellList = 'wizard' | 'druid' | 'illusionist';
export type FoeCategory = 'vermin' | 'minion' | 'weird' | 'boss';

export interface Item {
  uid: string;
  base: string; // key into ITEM_BASES
  name: string;
  qty?: number;
  damage?: DamageType;
  magicAttack?: number;
  magicDefense?: number;
  charges?: number;
  masterwork?: boolean;
  silvered?: boolean;
  gilded?: boolean;
  /** gp value for gems/jewelry, resale for special items */
  value?: number;
  spell?: { list: SpellList; id: string };
  envenomed?: boolean;
  repellant?: boolean;
  lanternHook?: boolean;
  broken?: boolean;
  /** for one-use things that were used */
  used?: boolean;
  /** e.g. quest targets, arrow of slaying target foe id */
  data?: Record<string, unknown>;
  /** item disappears at end of adventure */
  expires?: boolean;
  /** adventures remaining (leafsteel leaves) */
  adventuresLeft?: number;
}

export interface Equip {
  main?: string; // item uid
  off?: string;
  armor?: string;
  backShield?: string;
  neck?: string; // amulet / glittering crystal
}

export type HeroStatus = 'ok' | 'dead' | 'petrified' | 'insane' | 'captured' | 'eaten';

export interface Condition {
  id: string; // e.g. 'cursed', 'contaminated', 'bear_trap', 'poisoned_food', 'cordyceps'
  label: string;
  /** ends at: 'adventure' | 'combat' | 'tiles:N' | 'blessing' | 'rest' */
  until?: string;
  tilesLeft?: number;
  turnsLeft?: number;
  value?: number;
}

export interface PreparedSpell {
  id: string;
  list: SpellList;
  used: boolean;
  /** spellwoven / temporary slots */
  temp?: boolean;
}

export interface Hero {
  id: string;
  name: string;
  classId: ClassId;
  level: number;
  portrait: string;
  traits: string[];
  life: number;
  bonusLife: number; // permanent extra max life (traits)
  madness: number;
  status: HeroStatus;
  inventory: Item[];
  equip: Equip;
  /** chosen weapon damage types etc. */
  choices: Record<string, string>;
  spells: PreparedSpell[];
  /** Wizard spellbook: spell ids known beyond the basic six */
  spellbook: string[];
  burnedPages: string[];
  resources: Record<string, number>;
  /** once-per-X usage counters: key -> uses. Cleared by scope. */
  used: { adventure: Record<string, number>; combat: Record<string, number>; level: Record<string, number> };
  conditions: Condition[];
  swornEnemies: string[];
  survival: string[];
  milestones: Record<string, number>;
  milestonesDone: string[];
  secrets: string[]; // discovered secret benefits (e.g. 'terrifying_secret')
  companion?: Companion;
  /** XP roll gained this adventure just now (cannot get another XP roll immediately) */
  justLeveled?: boolean;
  kills: { minorEncounters: number; major: number; total: number };
  adventures: number;
  createdAt: number;
  notes?: string;
  /** Druid's L1 learned druid spell for ranger etc */
  rangerSpell?: string;
}

export interface Companion {
  id: string; // hawk, owl, warhound...
  name: string;
  life: number;
  maxLife: number;
  armor?: boolean;
  free?: boolean; // druid companion
}

export interface Foe {
  uid: string;
  defId: string;
  name: string;
  category: FoeCategory;
  level: number;
  baseLevel: number;
  /** Minor foes: count remaining. Major: 1 */
  count: number;
  initialCount: number;
  life: number; // major only
  maxLife: number;
  attacks: number;
  damage: number;
  tags: string[];
  morale: number; // modifier
  moraleChecked: boolean;
  noMorale: boolean;
  treasure: { rolls: number; mod: number; none?: boolean; special?: string };
  reduced: boolean; // major foe reduced by 1 L at half life
  finalBoss?: boolean;
  fled?: boolean;
  subdued?: number; // minor foes subdued
  levelMods: Mod[]; // temporary L modifiers (distract etc.)
  state: Record<string, number | boolean | string>;
  surprise?: number; // x-in-6
  hates?: ClassId[];
  wandering?: boolean;
}

export interface TileShape {
  id: string;
  corridor: boolean;
  rows: string[];
}

export interface Connector {
  id: string;
  /** floor cell inside this tile */
  x: number;
  y: number;
  /** outward direction */
  dx: number;
  dy: number;
  door: boolean;
  /** linked tile id, undefined = dead end/unexplored-generated */
  to?: string;
  toConnector?: string;
  deadEnd?: boolean;
  exit?: boolean; // dungeon entrance
  doorState?: DoorState;
  hiddenDoor?: boolean; // secret door, revealed by search
  blocked?: boolean; // rolling boulder etc.
}

export interface DoorState {
  kind: 'normal' | 'locked' | 'magic' | 'iron' | 'illusionary' | 'trapped' | 'lever';
  level: number;
  open: boolean;
  rolled: boolean;
  destroyed?: boolean;
  nailed?: boolean;
}

export type TileContent =
  | { type: 'empty'; clue?: boolean }
  | { type: 'treasure' }
  | { type: 'trap_treasure' }
  | { type: 'special_event' }
  | { type: 'special_feature' }
  | { type: 'encounter'; table: FoeCategory; dragon?: boolean }
  | { type: 'entrance' }
  | { type: 'adventure'; key: string };

export interface Tile {
  id: string;
  shapeId: string;
  corridor: boolean;
  env: Env;
  region: string;
  cells: [number, number][];
  connectors: Connector[];
  content: TileContent;
  /** pre-rolled foe definition for encounters */
  foeDefId?: string;
  explored: boolean;
  visited: boolean;
  searched: boolean;
  cleared: boolean;
  resolved: boolean;
  feature?: string;
  featureState?: Record<string, unknown>;
  /** foes left behind (withdrew / peaceful / bribed) */
  foes?: Foe[];
  foeAttitude?: 'peaceful' | 'bribed' | 'ignore' | 'hostile' | 'deal' | 'quest_giver' | 'trial_won';
  droppedItems?: Item[];
  notes: string[];
  index: number; // order in which tile was generated
  enteredOrder?: number;
  secret?: boolean; // created via secret door
  treasureDouble?: boolean;
  treasureMod?: number;
  label?: string; // adventure room number
  echo?: boolean;
  cavernFeature?: string;
}

export interface Region {
  id: string;
  env: Env;
  width: number;
  height: number;
  /** entry tile id */
  start: string;
  /** link back to parent tile */
  parentTile?: string;
}

export interface Dungeon {
  regions: Region[];
  tiles: Record<string, Tile>;
  currentTile: string;
  previousTile?: string;
  tilesEntered: number;
  majorFoesMet: number;
  finalBossFound: boolean;
  finalBossSlain: boolean;
  minorEncounters: number;
  uniqueEvents: string[];
  marchingOrder: string[]; // hero ids
  lanternBearer?: string;
  quest?: QuestState;
  restUsed: boolean;
  wanderingBonus: number; // firearms
  adventureKey?: string; // 'random' | 'witch' | 'crystals'
  keywords: string[];
  ladyInWhite?: 'met' | 'refused';
  noSurprise?: { env: Env | 'all'; reason: string }[];
  saveBonusEnv?: { env: Env; value: number }[];
}

export interface QuestState {
  id: number; // 1..6
  label: string;
  giverTile?: string;
  target?: string; // foe def id or item
  amount?: number;
  progress: number;
  complete: boolean;
  rewarded: boolean;
}

export interface LogEntry {
  n: number;
  kind: 'info' | 'roll' | 'good' | 'bad' | 'combat' | 'loot' | 'story' | 'level';
  text: string;
  roll?: RollResult;
  who?: string;
}

export interface Settings {
  xpSystem: 'classic' | 'slow_sure' | 'old_school' | 'slower';
  doorTable: boolean;
  torchDuration: boolean;
  arrowTracking: boolean;
  tileLimit: number; // 0 = off
  fiendishFoes: 'off' | 'mixed' | 'replace';
  autoContinue: boolean;
  haptics: boolean;
  sound: boolean;
  caverns: boolean;
  fungal: boolean;
  traits: boolean;
}

export interface Guild {
  roster: Hero[];
  gold: number; // guild treasury (heroes' shared stash between adventures)
  clues: number;
  stash: Item[];
  graveyard: Hero[];
  adventuresCompleted: number;
  potionRecipe?: boolean;
  favors: number;
  oldSchoolXp: Record<string, number>;
  storedXp: Record<string, number>;
}

export interface GameState {
  version: number;
  rng: RngState;
  uid: number;
  settings: Settings;
  guild: Guild;
  mode: 'title' | 'guild' | 'dungeon' | 'debrief';
  party: string[]; // hero ids in current adventure
  dungeon?: Dungeon;
  combat?: import('./combat/types').CombatState;
  log: LogEntry[];
  logN: number;
  /** party gold during an adventure */
  partyGold: number;
  clues: number;
  xpTally: { minorEncounters: number };
  adventureResult?: AdventureResult;
}

export interface AdventureResult {
  outcome: 'victory' | 'retreat' | 'wipe';
  goldGained: number;
  xpRolls: { hero: string; reason: string; success?: boolean }[];
  deaths: string[];
}
