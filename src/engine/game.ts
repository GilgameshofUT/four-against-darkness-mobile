import { resolveRoll, finish, type Mod, type RollResult, type DieSize, TIER_DIE, d, rollExpr } from './dice';
import type { ChoiceOption, Io } from './io';
import type { GameState, Hero, LogEntry, Item } from './types';
import { isAlive, tierOf, inventoryCount, base } from './hero';
import { int } from './rng';

export type RollKind = 'attack' | 'defense' | 'save' | 'stealth' | 'spell' | 'search' | 'xp' | 'treasure' | 'other';
export type SaveType =
  | 'trap' | 'poison' | 'gas' | 'magic' | 'gaze' | 'fear' | 'mental' | 'disease' | 'breath' | 'puzzle' | 'fall'
  | 'petrify' | 'engulf' | 'confusion' | 'social' | 'lock' | 'bash' | 'generic' | 'madness' | 'sleep';

export interface HeroRollOpts {
  hero: Hero;
  kind: RollKind;
  label: string;
  mods: Mod[];
  target?: number;
  mode?: 'gte' | 'gt';
  die?: DieSize;
  explode?: boolean;
  explodeBonus?: number;
  keepBestOf?: number;
  saveType?: SaveType;
  context?: string;
  noReroll?: boolean;
  melee?: boolean;
  ranged?: boolean;
  /** Halfling auto reroll granted by the specific save ("halflings may reroll") */
  freeReroll?: boolean;
  /** Called to measure outcome quality (kills/damage) so post-roll boosts can be offered */
  quality?: (total: number) => number;
  /** suppress luck in minotaur encounters */
  noLuck?: boolean;
}

export class Game {
  constructor(public s: GameState, public io: Io) {}

  get rng() {
    return this.s.rng;
  }
  hero(id: string): Hero {
    const h = this.s.guild.roster.find((x) => x.id === id);
    if (!h) throw new Error('no hero ' + id);
    return h;
  }
  partyAll(): Hero[] {
    return this.s.party.map((id) => this.hero(id));
  }
  party(): Hero[] {
    return this.partyAll().filter(isAlive);
  }
  hcl(): number {
    const lv = this.party().map((h) => h.level);
    return Math.max(1, ...(lv.length ? lv : [1]));
  }
  tier(): number {
    return tierOf(this.hcl());
  }
  uid(prefix = 'u'): string {
    return `${prefix}${++this.s.uid}`;
  }
  d6() {
    return d(this.rng, 6);
  }
  roll(expr: string) {
    return rollExpr(this.rng, expr);
  }
  chance(x: number, of = 6) {
    return int(this.rng, 1, of) <= x;
  }

  log(kind: LogEntry['kind'], text: string, extra: Partial<LogEntry> = {}) {
    const e: LogEntry = { n: ++this.s.logN, kind, text, ...extra };
    this.s.log.push(e);
    if (this.s.log.length > 400) this.s.log.splice(0, this.s.log.length - 400);
    this.io.log(e);
  }

  async say(title: string, text: string, art?: string) {
    this.log('story', `${title}: ${text}`);
    await this.io.pause(title, text, art);
  }

  async choose<T>(title: string, options: ChoiceOption<T>[], extra: { text?: string; art?: string; who?: string; layout?: 'list' | 'grid' | 'heroes'; cancellable?: boolean } = {}): Promise<T> {
    this.io.changed();
    return this.io.choose({ title, options, ...extra });
  }

  async yesNo(title: string, text?: string, yes = 'Yes', no = 'No', art?: string): Promise<boolean> {
    return this.choose(title, [{ value: true, label: yes, tone: 'primary' }, { value: false, label: no, tone: 'quiet' }], { text, art });
  }

  async pickHero(title: string, heroes: Hero[], text?: string, cancellable = false): Promise<Hero | undefined> {
    if (!heroes.length) return undefined;
    if (heroes.length === 1 && !cancellable) return heroes[0];
    const opts: ChoiceOption<string>[] = heroes.map((h) => ({ value: h.id, label: h.name, desc: `L${h.level} ${h.classId.replace('_', ' ')} · ${h.life} Life`, icon: `portraits/${h.portrait}` }));
    if (cancellable) opts.push({ value: '', label: 'Never mind', tone: 'quiet' });
    const id = await this.choose(title, opts, { text, layout: 'heroes' });
    return id ? this.hero(id) : undefined;
  }

  /** Table roll the player taps for (treasure, reactions, morale...). */
  async tableRoll(label: string, expr: string, opts: { context?: string; who?: string; mods?: Mod[]; target?: number; atMost?: boolean; outcome?: [string, string] } = {}): Promise<number> {
    const m = expr.match(/^(\d*)d(\d+)$/);
    let faces: number[];
    if (m && Number(m[2]) === 6) faces = Array.from({ length: m[1] ? Number(m[1]) : 1 }, () => this.d6());
    else faces = [this.roll(expr)];
    const res = finish({ label, explode: false, mods: opts.mods }, 6, faces);
    if (opts.target !== undefined) {
      res.target = opts.target;
      res.mode = 'gte';
      res.success = opts.atMost ? res.total <= opts.target : res.total >= opts.target;
      res.atMost = opts.atMost;
      res.outcomeText = opts.outcome ? (res.success ? opts.outcome[0] : opts.outcome[1]) : undefined;
    }
    await this.io.roll({ label, context: opts.context, who: opts.who }, res);
    this.log('roll', `${label}: ${faces.join('+')}${res.modTotal ? (res.modTotal > 0 ? ' +' : ' ') + res.modTotal : ''} = ${res.total}`, { roll: res });
    return res.total;
  }

  /** d66 table roll */
  async d66Roll(label: string): Promise<number> {
    const a = this.d6();
    const b = this.d6();
    const res = finish({ label, explode: false }, 6, [a, b]);
    res.total = a * 10 + b;
    await this.io.roll({ label, context: 'd66: first die = tens' }, res);
    return res.total;
  }

  // ---- Hero rolls with reroll / boost offers ----
  dieFor(h: Hero): DieSize {
    return TIER_DIE[tierOf(h.level)];
  }

  async heroRoll(o: HeroRollOpts): Promise<RollResult> {
    const h = o.hero;
    const mods = [...o.mods];
    // Pre-roll: talisman for saves
    if (o.kind === 'save' && o.target !== undefined) {
      const tal = h.inventory.find((i) => i.base === 'talisman' && !i.used);
      if (tal) {
        const use = await this.yesNo(`${h.name}: use Talisman?`, `+1 to this ${o.label} (target ${o.target}). The talisman is then spent.`, 'Use (+1)', 'Save it');
        if (use) {
          tal.used = true;
          h.inventory = h.inventory.filter((i) => i !== tal);
          mods.push({ label: 'Talisman', value: 1 });
        }
      }
    }
    const spec = {
      label: o.label,
      die: o.die ?? this.dieFor(h),
      explode: o.explode ?? true,
      explodeBonus: o.explodeBonus,
      mods,
      target: o.target,
      mode: o.mode ?? (o.kind === 'defense' ? 'gt' : 'gte'),
      // Book: "A Defense roll of 1 is always a failure"; Stealth: "A roll of 1 or below is always a failure".
      naturalOneFails: o.kind === 'defense' || o.kind === 'stealth',
      keepBestOf: o.keepBestOf,
    } as const;
    let res = resolveRoll(this.rng, spec);
    await this.io.roll({ ...spec, who: h.id, context: o.context }, res);

    if (!o.noReroll) res = await this.offerRerolls(o, spec, res);
    if (res.success === false && o.target !== undefined) res = await this.offerBoosts(o, res);
    this.log('roll', `${h.name} — ${o.label}: ${describe(res)}`, { roll: res, who: h.id });
    return res;
  }

  private async offerRerolls(o: HeroRollOpts, spec: Parameters<typeof resolveRoll>[1], res: RollResult): Promise<RollResult> {
    const h = o.hero;
    const failed = res.success === false;
    const improvable = o.kind === 'attack' && res.success && o.quality && res.natural < 6;
    if (!failed && !improvable && o.kind !== 'treasure') return res;
    if (o.kind === 'treasure') return res;
    if (!failed) return res; // only offer rerolls on failures (keeps prompts light)
    const sources = this.rerollSources(o);
    if (o.freeReroll && h.classId === 'halfling') sources.unshift({ id: 'free', label: 'Halfling reroll', desc: 'This danger allows halflings a free reroll.' });
    if (!sources.length) return res;
    const pick = await this.choose<string>(`${h.name} failed: ${o.label}`, [
      ...sources.map((s) => ({ value: s.id, label: s.label, desc: s.desc, tone: 'primary' as const })),
      { value: '', label: 'Accept the result', tone: 'quiet' },
    ], { who: h.id, text: `Rolled ${res.total} vs ${o.target}${spec.mode === 'gt' ? ' (must beat)' : ''}.` });
    if (!pick) return res;
    let extraMods: Mod[] = [];
    if (pick === 'evasion') {
      this.spend(h, 'adventure', 'evasion');
      const r2 = { ...res, success: true, autoFail: false, label: res.label + ' (Evasion)' };
      this.log('good', `${h.name} uses Evasion and avoids it!`);
      return r2;
    }
    this.consumeReroll(h, pick);
    if (pick === 'lucky_hat') extraMods = [{ label: 'Lucky Hat', value: 1 }];
    const r2 = resolveRoll(this.rng, { ...spec, mods: [...(spec.mods ?? []), ...extraMods] });
    r2.rerolled = true;
    await this.io.roll({ ...spec, label: spec.label + ' (reroll)', who: h.id, context: o.context }, r2);
    if (pick === 'lucky_hat' && r2.natural === 1) {
      h.conditions.push({ id: 'no_hat', label: 'Lost lucky hat' });
      this.log('bad', `${h.name}'s plumed hat is destroyed!`);
    }
    return r2;
  }

  rerollSources(o: HeroRollOpts): { id: string; label: string; desc?: string }[] {
    const h = o.hero;
    const out: { id: string; label: string; desc?: string }[] = [];
    const luckOk = ['attack', 'defense', 'save', 'search', 'treasure', 'stealth'].includes(o.kind) && !o.noLuck;
    if (luckOk && h.classId === 'halfling' && (h.resources.luck ?? 0) > 0) out.push({ id: 'luck', label: `Spend Luck (${h.resources.luck} left)` });
    const amulet = h.inventory.find((i) => i.base === 'amulet' && !i.used);
    if (luckOk && amulet) out.push({ id: 'amulet', label: 'Use Amulet (1 Luck)' });
    const shoe = h.inventory.find((i) => i.base === 'horseshoe' && !i.used);
    if (shoe && h.classId !== 'barbarian') out.push({ id: 'horseshoe', label: 'Lucky Horseshoe' });
    if (o.kind === 'save') {
      if (h.classId === 'paladin' && (h.resources.prayer ?? 0) > 0) out.push({ id: 'paladin_prayer', label: `Paladin prayer (${h.resources.prayer} left)` });
      if (h.traits.includes('lucky_sidestep') && (h.used.level.lucky_sidestep ?? 0) < h.level) out.push({ id: 'lucky_sidestep', label: 'Lucky Sidestep' });
      if (h.classId === 'acrobat' && (h.resources.trick ?? 0) > 0 && ['trap', 'fall', 'generic', 'breath', 'engulf'].includes(o.saveType ?? 'generic'))
        out.push({ id: 'leap', label: 'Trick: Leap out of Harm', desc: 'Not vs spells, gas, poison or gaze.' });
      if (h.traits.includes('stubborn_resolve') && !this.isSpent(h, 'adventure', 'stubborn_resolve') && ['poison', 'magic'].includes(o.saveType ?? ''))
        out.push({ id: 'stubborn_resolve', label: 'Stubborn Resolve' });
      if (h.traits.includes('evasion') && !this.isSpent(h, 'adventure', 'evasion')) out.push({ id: 'evasion', label: 'Evasion (auto-success)' });
    }
    if (o.kind === 'defense') {
      if (h.traits.includes('stubborn_resolve') && !this.isSpent(h, 'adventure', 'stubborn_resolve')) out.push({ id: 'stubborn_resolve', label: 'Stubborn Resolve' });
      if (h.traits.includes('lucky_hat') && !this.isSpent(h, 'adventure', 'lucky_hat') && !h.conditions.some((c) => c.id === 'no_hat'))
        out.push({ id: 'lucky_hat', label: 'Lucky Hat (reroll at +1)' });
    }
    if (o.kind === 'attack' && o.melee && h.traits.includes('blade_mastery') && !this.isSpent(h, 'combat', 'blade_mastery'))
      out.push({ id: 'blade_mastery', label: 'Blade Mastery' });
    return out;
  }

  consumeReroll(h: Hero, id: string) {
    switch (id) {
      case 'luck':
        h.resources.luck--;
        break;
      case 'amulet':
      case 'horseshoe': {
        const it = h.inventory.find((i) => i.base === id && !i.used)!;
        h.inventory = h.inventory.filter((i) => i !== it);
        break;
      }
      case 'paladin_prayer':
        h.resources.prayer--;
        break;
      case 'lucky_sidestep':
        h.used.level.lucky_sidestep = (h.used.level.lucky_sidestep ?? 0) + 1;
        break;
      case 'leap':
        h.resources.trick--;
        break;
      case 'stubborn_resolve':
      case 'lucky_hat':
        this.spend(h, 'adventure', id);
        break;
      case 'blade_mastery':
        this.spend(h, 'combat', id);
        break;
    }
    this.log('info', `${h.name} rerolls (${id.replace('_', ' ')}).`);
  }

  /** +N bonuses offered after a failed roll when they would turn it into a success. */
  private async offerBoosts(o: HeroRollOpts, res: RollResult): Promise<RollResult> {
    const h = o.hero;
    const need = (o.mode ?? (o.kind === 'defense' ? 'gt' : 'gte')) === 'gt' ? o.target! + 1 - res.total : o.target! - res.total;
    if (res.autoFail || need <= 0) return res;
    const boosts: { id: string; label: string; value: number; from?: Hero }[] = [];
    if (h.classId === 'swashbuckler' && (o.kind === 'attack' || o.kind === 'defense') && (h.resources.panache ?? 0) > 0 && need <= 1)
      boosts.push({ id: 'panache', label: 'Spend 1 Panache (+1)', value: 1 });
    if (o.kind === 'attack' || o.kind === 'defense') {
      for (const ally of this.party()) {
        if (ally !== h && ally.traits.includes('team_tactics') && !this.isSpent(ally, 'combat', 'team_tactics') && need <= 1 && !this.s.combat?.foesFirstSurprise)
          boosts.push({ id: 'team_tactics', label: `${ally.name}: Team Tactics (+1)`, value: 1, from: ally });
      }
    }
    if (!boosts.length) return res;
    const pick = await this.choose<string>(`${h.name}: just short!`, [
      ...boosts.map((b) => ({ value: b.id + (b.from ? ':' + b.from.id : ''), label: b.label, tone: 'primary' as const })),
      { value: '', label: 'Accept the result', tone: 'quiet' },
    ], { who: h.id, text: `Rolled ${res.total}; need ${need} more.` });
    if (!pick) return res;
    const [id, fromId] = pick.split(':');
    const b = boosts.find((x) => x.id === id)!;
    if (id === 'panache') h.resources.panache--;
    if (id === 'team_tactics') this.spend(this.hero(fromId), 'combat', 'team_tactics');
    const mods = [...res.mods, { label: b.label.replace(/ \(.+\)$/, ''), value: b.value }];
    const total = res.total + b.value;
    const success = (o.mode ?? (o.kind === 'defense' ? 'gt' : 'gte')) === 'gt' ? total > o.target! : total >= o.target!;
    return { ...res, mods, modTotal: res.modTotal + b.value, total, success };
  }

  // ---- usage tracking ----
  isSpent(h: Hero, scope: 'adventure' | 'combat' | 'level', key: string, max = 1): boolean {
    return (h.used[scope][key] ?? 0) >= max;
  }
  spend(h: Hero, scope: 'adventure' | 'combat' | 'level', key: string) {
    h.used[scope][key] = (h.used[scope][key] ?? 0) + 1;
  }

  // ---- gold & items ----
  goldCapacity(): number {
    return this.party().length * 200;
  }
  addGold(n: number, source = '') {
    if (n <= 0) return;
    const cap = this.goldCapacity() - this.carriedTreasureWeight();
    const take = Math.max(0, Math.min(n, cap));
    this.s.partyGold += take;
    this.log('loot', `+${take} gp${source ? ' (' + source + ')' : ''}${take < n ? ` — ${n - take} gp left behind (too heavy)` : ''}`);
  }
  carriedTreasureWeight(): number {
    let w = this.s.partyGold;
    for (const h of this.party()) w += inventoryCount(h, 'spare_parts') * 10;
    return w;
  }
  spendGold(n: number): boolean {
    if (this.s.partyGold < n) return false;
    this.s.partyGold -= n;
    return true;
  }

  newItem(baseId: string, extra: Partial<Item> = {}): Item {
    const b = base({ base: baseId } as Item);
    return { uid: this.uid('i'), base: baseId, name: b?.name ?? baseId, ...extra };
  }

  give(h: Hero, it: Item) {
    const b = base(it);
    if (b?.stack) {
      const ex = h.inventory.find((i) => i.base === it.base && !i.used);
      if (ex) {
        ex.qty = (ex.qty ?? 1) + (it.qty ?? 1);
        return;
      }
    }
    h.inventory.push(it);
  }

  /** Let the player choose who receives an item (respecting class restrictions). */
  async distribute(it: Item, why = ''): Promise<Hero | undefined> {
    const heroes = this.party();
    if (!heroes.length) return;
    const opts = heroes.map((h) => {
      const no = canCarry(h, it);
      return { value: h.id, label: h.name, desc: no ?? `L${h.level} ${h.classId.replace('_', ' ')}`, disabled: no ? no : false, icon: `portraits/${h.portrait}` };
    });
    if (opts.every((o) => o.disabled)) {
      this.log('info', `No one can carry the ${it.name}; it is left behind.`);
      return;
    }
    const id = await this.choose<string>(`Who takes the ${it.name}?`, [...opts, { value: '', label: 'Leave it', tone: 'quiet' as const }], { text: why, layout: 'heroes', art: itemArt(it) });
    if (!id) return;
    const h = this.hero(id);
    this.give(h, it);
    this.log('loot', `${h.name} takes ${it.name}${it.qty && it.qty > 1 ? ' ×' + it.qty : ''}.`);
    return h;
  }

  // ---- damage & healing ----
  /** Apply damage to a hero; returns true if they died. Handles death-preventing traits. */
  async damage(h: Hero, n: number, source: string, opts: { physical?: boolean; noReduce?: boolean } = {}): Promise<boolean> {
    if (n <= 0 || !isAlive(h)) return false;
    const { applyDamage } = await import('./effects');
    return applyDamage(this, h, n, source, opts);
  }

  heal(h: Hero, n: number, source: string, opts: { magical?: boolean } = {}): number {
    if (!isAlive(h) || n <= 0) return 0;
    if (h.classId === 'kukla' && source !== 'repair') {
      this.log('info', `${h.name} is a doll — healing has no effect.`);
      return 0;
    }
    const { maxLife } = heroMod;
    const before = h.life;
    h.life = Math.min(maxLife(h), h.life + n);
    const got = h.life - before;
    if (got > 0) this.log('good', `${h.name} heals ${got} Life (${source}).`);
    void opts;
    return got;
  }
}

import * as heroMod from './hero';
import { canUseItem } from './hero';

export function canCarry(h: Hero, it: Item): string | undefined {
  const b = base(it);
  if (!b) return;
  if (b.magic && h.classId === 'barbarian' && b.kind !== 'weapon') return "Won't carry magic";
  if (b.magic && h.classId === 'barbarian') return "Won't carry magic";
  if (b.maxPerHero && inventoryCount(h, it.base) >= b.maxPerHero) return `Already has one`;
  if (it.base === 'food' && inventoryCount(h, 'food') + (it.qty ?? 1) > 10) return 'Max 10 rations';
  void canUseItem;
  return;
}

export function itemArt(it: Item): string {
  const b = base(it);
  return `items/${b?.icon ?? 'scroll'}`;
}

export function describe(r: RollResult): string {
  const faces = r.faces.join('+');
  const mods = r.mods.map((m) => `${m.value >= 0 ? '+' : ''}${m.value} ${m.label}`).join(' ');
  const tgt = r.target !== undefined ? ` vs ${r.mode === 'gt' ? '>' : ''}${r.target} → ${r.success ? 'success' : 'fail'}${r.autoFail ? ' (natural 1)' : ''}` : '';
  return `[${faces}]${r.exploded ? '!' : ''} ${mods} = ${r.total}${tgt}`;
}

export function tierOfParty(g: Game) {
  return tierOf(g.hcl());
}
