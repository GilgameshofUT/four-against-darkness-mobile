import type { RollResult, RollSpec } from './dice';
import type { LogEntry } from './types';

export interface ChoiceOption<T = string> {
  value: T;
  label: string;
  desc?: string;
  disabled?: boolean | string; // string = reason
  icon?: string; // art path e.g. 'icons/luck'
  tone?: 'primary' | 'danger' | 'quiet' | 'good';
}

export interface ChoicePrompt<T = string> {
  title: string;
  text?: string;
  art?: string; // e.g. 'monsters/ogre' or 'features/fountain'
  options: ChoiceOption<T>[];
  /** allow dismissing (returns undefined) */
  cancellable?: boolean;
  who?: string; // hero id for portrait
  layout?: 'list' | 'grid' | 'heroes';
}

export interface RollPrompt extends RollSpec {
  who?: string; // hero id
  /** extra explanation under the dice, e.g. "Save vs L5 poison" */
  context?: string;
  /** pre-rolled result to animate (engine resolves then UI reveals on tap) */
  result?: RollResult;
}

export interface Io {
  /** Player taps to roll; resolves with the outcome after the reveal. */
  roll(p: RollPrompt, result: RollResult): Promise<void>;
  choose<T>(p: ChoicePrompt<T>): Promise<T>;
  /** Narrative beat with a Continue button. */
  pause(title: string, text: string, art?: string): Promise<void>;
  log(e: LogEntry): void;
  /** Immediately reflect state changes (UI refresh). */
  changed(): void;
  /** Called at safe points so the game can be saved and resumed. */
  checkpoint(label: string): void;
  /** Plain table roll display (no reroll), for tables like d66 / 2d6 content. */
  tableRoll?(label: string, dice: number[], total: number): Promise<void>;
}

/** Auto-play Io for tests and simulations. */
export class ScriptIo implements Io {
  logs: LogEntry[] = [];
  choices = 0;
  constructor(private pickFn: <T>(p: ChoicePrompt<T>) => T = (p) => firstEnabled(p)) {}
  async roll(_p?: RollPrompt, _r?: RollResult) {}
  async choose<T>(p: ChoicePrompt<T>): Promise<T> {
    this.choices++;
    if (this.choices > 200000) throw new Error('runaway choices: ' + p.title);
    return this.pickFn(p);
  }
  async pause(_t?: string, _x?: string, _a?: string) {}
  log(e: LogEntry) {
    this.logs.push(e);
  }
  changed() {}
  checkpoint() {}
}

export function firstEnabled<T>(p: ChoicePrompt<T>): T {
  const o = p.options.find((o) => !o.disabled);
  if (!o) throw new Error('No enabled option for prompt: ' + p.title + ' :: ' + p.options.map((x) => x.label).join('/'));
  return o.value;
}
