import type { Game } from '../game';
import type { Foe, Hero } from '../types';
import { defenseMods, type DefenseCtx } from '../mods/defense';
import { foeLevel, fspecial, foeAlive, isMinor, hasTag } from '../foe';
import { maxLife, isAlive } from '../hero';
import { cs, hc, liveFoes, marching } from './util';
import { onHeroHit, onHeroMissed, foeTurnStart, foeTurnEnd } from './hooks';

interface Swing {
  foe: Foe;
  dmg: number;
}

/** Build the list of individual attacks the foes make this turn. */
function swings(g: Game): Swing[] {
  const out: Swing[] = [];
  for (const f of liveFoes(g)) {
    if (f.state.asleep || f.state.skipTurn || f.state.held) continue;
    if (f.state.noAttackTurn === cs(g).turn) continue;
    if (f.defId === 'stalactomimics' && f.state.attacked) continue;
    if (f.defId === 'cavern_sludge' || f.defId === 'acid_cube' || f.defId === 'lurking_mantlebeast' || f.defId === 'cornucopia_of_chaos') continue;
    let n = isMinor(f) ? f.count : f.attacks;
    if (f.defId === 'fungus_hydra') n = Math.max(1, (f.state.heads as number) ?? f.attacks);
    if (f.defId === 'land_siren') n = 1 + (f.state.sleepers as number ?? 0);
    if (f.state.skipAttacks) n = Math.max(0, n - (f.state.skipAttacks as number));
    for (let i = 0; i < n; i++) out.push({ foe: f, dmg: f.damage });
  }
  return out;
}

/** Targets that may be attacked (corridor front 2, ambush rear 2). */
function targetable(g: Game): Hero[] {
  const c = cs(g);
  const order = marching(g).filter((h) => !hc(g, h).hidden || false);
  const invis = order.filter((h) => !c.heroes[h.id]?.fled);
  if (!c.corridor) return invis;
  const n = c.narrow ? 1 : 2;
  if (c.ambush && !c.flags.ambushTurned) return invis.slice(-n);
  return invis.slice(0, n);
}

export async function foeTurn(g: Game, opts: { flee?: boolean; withdraw?: boolean } = {}) {
  const c = cs(g);
  if (!opts.flee && !opts.withdraw) await foeTurnStart(g);
  if (!liveFoes(g).length || !g.party().length) return;
  let list = swings(g);
  if (c.corridor && !opts.flee && !opts.withdraw) list = list.slice(0, c.narrow ? 2 : 2); // max two foes attack in a corridor
  if (opts.flee || opts.withdraw) list = liveFoes(g).flatMap((f) => (isMinor(f) ? Array(f.count).fill({ foe: f, dmg: f.damage }) : [{ foe: f, dmg: f.damage }]));
  if (!list.length) {
    if (!opts.flee && !opts.withdraw) await foeTurnEnd(g);
    return;
  }
  const targets = opts.flee || opts.withdraw ? marching(g) : targetable(g);
  const plan = await assign(g, list, targets, !!opts.flee);
  for (const [heroId, sw] of plan) {
    const h = g.hero(heroId);
    if (!isAlive(h)) continue;
    await resolveSwing(g, sw.foe, h, sw.dmg, { fleeing: opts.flee, withdrawing: opts.withdraw });
    if (!g.party().length) return;
  }
  if (!opts.flee && !opts.withdraw) await foeTurnEnd(g);
}

/** Assign attacks following book rules; player decides where rules allow a choice. */
async function assign(g: Game, list: Swing[], targets: Hero[], fleeing: boolean): Promise<[string, Swing][]> {
  const c = cs(g);
  const plan: [string, Swing][] = [];
  if (!targets.length) return plan;
  // Paladin Challenge: a foe that is challenged attacks only the paladin
  const challenger = targets.find((h) => h.traits.includes('challenge') && c.flags[`challenge_${h.id}`]);
  const pending: Swing[] = [];
  for (const s of list) {
    if (challenger && c.flags[`challenge_${challenger.id}`] === s.foe.uid) plan.push([challenger.id, s]);
    else if (s.foe.state.phantomTarget) plan.push(['__phantom', s]);
    else pending.push(s);
  }
  if (fleeing) {
    // Most wounded first, then hated, then random
    const sorted = [...targets].sort((a, b) => maxLife(b) - b.life - (maxLife(a) - a.life));
    pending.forEach((s, i) => {
      if (i < targets.length) plan.push([sorted[i].id, s]);
    });
    return plan.filter(([id]) => id !== '__phantom');
  }
  // Wandering monsters in a room on turn 1 / hate: extras to lowest life or hated
  const n = targets.length;
  if (pending.length <= n) {
    // each foe a different PC; player chooses who's spared
    let pool = [...targets];
    if (pending.length < n) {
      const spared = await choosePool(g, pending.length, pool, `Foes attack ${pending.length} of your heroes`, 'Choose who is attacked (each foe must attack a different hero).');
      pool = spared;
    }
    pending.forEach((s, i) => plan.push([pool[i].id, s]));
  } else {
    const base = Math.floor(pending.length / n);
    let idx = 0;
    for (const h of targets) for (let k = 0; k < base; k++) plan.push([h.id, pending[idx++]]);
    const extras = pending.slice(idx);
    for (const s of extras) {
      const hated = s.foe.hates ? targets.filter((h) => s.foe.hates!.includes(h.classId)) : [];
      let tgt: Hero;
      if (hated.length) tgt = hated[0];
      else if (s.foe.wandering && c.turn === 1) tgt = [...targets].sort((a, b) => a.life - b.life)[0];
      else if (s.foe.defId === 'icy_shadows' && g.s.dungeon?.lanternBearer && targets.some((t) => t.id === g.s.dungeon!.lanternBearer)) tgt = g.hero(g.s.dungeon.lanternBearer);
      else {
        const pick = await g.pickHero(`Extra attack from ${s.foe.name}`, targets, 'You decide who receives the extra attack.');
        tgt = pick ?? targets[0];
      }
      plan.push([tgt.id, s]);
    }
  }
  return plan.filter(([id]) => id !== '__phantom');
}

async function choosePool(g: Game, count: number, pool: Hero[], title: string, text: string): Promise<Hero[]> {
  const chosen: Hero[] = [];
  let remaining = [...pool];
  // Wizards/frail heroes protected first: player picks those attacked
  for (let i = 0; i < count; i++) {
    const h = await g.pickHero(`${title} (${i + 1}/${count})`, remaining, text);
    if (!h) break;
    chosen.push(h);
    remaining = remaining.filter((x) => x !== h);
  }
  return chosen;
}

/** One foe attack against one hero: Defense roll, damage & effects. */
export async function resolveSwing(g: Game, f: Foe, h: Hero, dmg: number, ctx: DefenseCtx = {}) {
  const c = cs(g);
  const x = hc(g, h);
  // Mirror images absorb attacks automatically
  if (x.mirrorImages > 0 && !hasTag(f, 'artificial')) {
    x.mirrorImages--;
    g.log('combat', `${f.name} strikes a mirror image of ${h.name}! (${x.mirrorImages} left)`);
    return;
  }
  // Sleeping PCs are hit automatically
  if (x.asleep) {
    g.log('bad', `${f.name} strikes the sleeping ${h.name}!`);
    await onHeroHit(g, f, h, dmg, ctx);
    return;
  }
  // Interventions before the roll: guardian stance, phantom reflex, escape, ring
  const swap = await guardianIntervention(g, f, h);
  if (swap) h = swap;
  if (h.traits.includes('phantom_reflex') && !g.isSpent(h, 'combat', 'phantom_reflex') && !hasTag(f, 'artificial') && x.mirrorImages === 0) {
    if (await g.yesNo(`${h.name}: Phantom Reflex?`, `An illusionary double takes ${f.name}'s attack (automatic miss).`, 'Use it', 'No')) {
      g.spend(h, 'combat', 'phantom_reflex');
      g.log('good', `${f.name} hits ${h.name}'s phantom double.`);
      return;
    }
  }
  const ring = h.inventory.find((i) => i.base === 'ring_teleport' && !i.used);
  const escapeSpell = h.spells.find((s) => s.id === 'escape' && !s.used);
  const L = foeLevel(g, f, { attacking: true, vsHero: h.id });
  const mods = defenseMods(g, h, f, { ...ctx, melee: !ctx.ranged });
  const res = await g.heroRoll({ hero: h, kind: 'defense', label: `Defend vs ${f.name}`, mods, target: L, mode: 'gt', context: `Must roll higher than ${L}`, noLuck: !!fspecial(f, 'no_luck'), ranged: ctx.ranged });
  x.firstAttackReceived = true;
  if (fspecial(f, 'charge')) c.flags[`charged_${h.id}`] = true;
  if (res.success) {
    await onHeroMissed(g, f, h, res.exploded, res.total - L);
    return;
  }
  if (ring || escapeSpell) {
    const opts = [];
    if (ring) opts.push({ value: 'ring', label: 'Ring of Teleportation', desc: 'Automatically pass; teleport out until the fight ends.' });
    if (escapeSpell) opts.push({ value: 'escape', label: 'Cast Escape', desc: 'Teleport back to the dungeon entrance.' });
    opts.push({ value: '', label: 'Take the hit', tone: 'quiet' as const });
    const pick = await g.choose(`${h.name} is about to be hit!`, opts, { who: h.id });
    if (pick === 'ring') {
      h.inventory = h.inventory.filter((i) => i !== ring);
      x.fled = true;
      c.flags[`teleported_${h.id}`] = true;
      g.log('good', `${h.name} vanishes in a flash of blue light!`);
      return;
    }
    if (pick === 'escape') {
      escapeSpell!.used = true;
      x.fled = true;
      c.flags[`escaped_${h.id}`] = true;
      g.log('good', `${h.name} teleports to the dungeon entrance!`);
      return;
    }
  }
  if (res.natural === 1 && f.defId === 'flesh_golem') dmg = 2;
  if (res.natural === 1 && f.defId === 'minosaur') {
    x.knockedDown = true;
    g.log('bad', `${h.name} is knocked down!`);
  }
  if (res.natural === 1 && f.defId === 'drillworm') await drillLoss(g, h);
  await onHeroHit(g, f, h, dmg, ctx);
}

export async function foeSingleAttack(g: Game, f: Foe, h: Hero) {
  await resolveSwing(g, f, h, f.damage);
}

async function guardianIntervention(g: Game, f: Foe, h: Hero): Promise<Hero | undefined> {
  const c = cs(g);
  const order = marching(g);
  const i = order.indexOf(h);
  const partnerIdx = i % 2 === 0 ? i + 1 : i - 1;
  const partner = order[partnerIdx];
  const opts: { value: string; label: string; desc?: string }[] = [];
  if (partner && partner.traits.includes('guardian_stance') && isAlive(partner)) opts.push({ value: partner.id, label: `${partner.name}: Guardian Stance`, desc: `Take the hit for ${h.name}.` });
  // Warhound loyal: 5-6 takes hit (automatic)
  const comp = h.companion;
  if (comp?.id === 'warhound' && comp.life > 0 && g.d6() >= 5) {
    comp.life -= f.damage;
    g.log('combat', `${comp.name} the warhound leaps in front of ${h.name}!${comp.life <= 0 ? ' The loyal hound falls.' : ''}`);
    return undefined;
  }
  if (!opts.length) return;
  const pick = await g.choose(`${f.name} attacks ${h.name}`, [...opts, { value: '', label: 'No' }], {});
  void c;
  return pick ? g.hero(pick) : undefined;
}

async function drillLoss(g: Game, h: Hero) {
  const cands = h.inventory.filter((i) => ['shield', 'scroll', 'healing_potion', 'lantern'].includes(i.base) || i.uid === h.equip.main || i.base === 'food');
  if (!cands.length) return;
  const pick = await g.choose(`${h.name} must lose an item to the drill`, cands.map((i) => ({ value: i.uid, label: i.name })), { who: h.id });
  const it = h.inventory.find((i) => i.uid === pick)!;
  if (it.base === 'food') h.inventory = h.inventory.filter((i) => i.base !== 'food');
  else if (!it.base.includes('magic')) h.inventory = h.inventory.filter((i) => i !== it);
  g.log('bad', `The drillworm destroys ${h.name}'s ${it.name}.`);
}

export function anyFoesCanAct(g: Game) {
  return liveFoes(g).some((f) => foeAlive(f));
}
