import type { Game } from '../game';
import type { Foe } from '../types';
import { fspecial, foeAlive, makeFoe, isMinor } from '../foe';
import { saveAll, save, randomHero } from '../checks';
import { addCondition, removeCond, gainMadness } from '../effects';
import { isAlive, base } from '../hero';
import { cs, hc, liveFoes } from './util';
import { petrify } from './hooks';

/** Effects "at the beginning of the encounter", before anything else. */
export async function combatStart(g: Game) {
  const c = cs(g);
  for (const f of [...c.foes]) {
    const gz = fspecial(f, 'gaze_start');
    if (gz) {
      g.log('combat', `${f.name}'s gaze sweeps the party!`);
      for (const h of g.party()) {
        const r = await save(g, h, { type: 'gaze', target: gz.L, label: `Save vs L${gz.L} gaze`, bonuses: gz.bonus });
        if (!r.success) {
          if (gz.effect === 'petrify') petrify(g, h);
          else await g.damage(h, 1, 'gaze');
        } else if (gz.effect === 'petrify') h.milestones.gaze = (h.milestones.gaze ?? 0) + 1;
      }
    }
    const cp = fspecial(f, 'chaos_powers');
    if (cp) {
      const r = await g.tableRoll(`${f.name}'s dark power`, 'd6', { context: cp.table === 'dungeon' ? '1-3 none · 4 evil eye · 5 energy drain · 6 hellfire' : '1-4 evil eye · 5 drain · 6 hellfire' });
      const power = cp.table === 'dungeon' ? (r <= 3 ? 'none' : r === 4 ? 'evil_eye' : r === 5 ? 'energy_drain' : 'hellfire') : r <= 4 ? 'evil_eye' : r === 5 ? 'energy_drain' : 'hellfire';
      c.flags.chaosPower = power;
      if (power === 'evil_eye') {
        for (const out of await saveAll(g, { type: 'magic', target: 4, label: 'Save vs L4 magic (evil eye)' }))
          if (!out.success) addCondition(out.hero, { id: 'evil_eye', label: 'Evil Eye (-1 Defense)', until: 'combat' });
      }
      if (power === 'hellfire') {
        const L = cp.table === 'dungeon' ? 6 : 5;
        for (const out of await saveAll(g, { type: 'magic', target: L, label: `Save vs L${L} hellfire`, bonuses: { cleric: 'half' } }))
          if (!out.success) await g.damage(out.hero, 2, 'hellfire blast');
      }
      if (power === 'energy_drain') g.log('combat', 'Its touch drains life force (Save vs L4 when hit).');
    }
    const bc = fspecial(f, 'battle_cry');
    if (bc) {
      for (const h of g.party()) {
        if (h.classId === 'paladin') continue;
        const r = await save(g, h, { type: 'fear', target: bc.L, label: 'Save vs L4 fear (battle cry)' });
        if (!r.success) hc(g, h).noExplode = true;
      }
    }
    const ss = fspecial(f, 'siren_song');
    if (ss) {
      let sleepers = 0;
      for (const h of g.party()) {
        if (h.classId === 'kukla') continue;
        const r = await save(g, h, { type: 'magic', target: g.hcl() + 2, label: 'Save vs siren song', bonuses: { all: 'half', halfling: 'reroll' } });
        if (!r.success) {
          hc(g, h).asleep = true;
          sleepers++;
        }
      }
      f.state.sleepers = sleepers;
    }
    const sp = fspecial(f, 'sleep_spores_start');
    if (sp) for (const h of g.party()) {
      const r = await save(g, h, { type: 'magic', target: sp.L, label: 'Save vs L3 sleep spores' });
      if (!r.success) hc(g, h).skipTurns = 1;
    }
    const ps = fspecial(f, 'poison_start');
    if (ps) for (const h of g.party()) {
      if (ps.immune?.includes(h.classId)) continue;
      const r = await save(g, h, { type: 'poison', target: ps.L, label: `Save vs L${ps.L} poison` });
      if (!r.success) await g.damage(h, 1, 'spores');
    }
    if (f.defId === 'trained_bats') {
      const h = randomHero(g);
      if (h) addCondition(h, { id: 'trained_bats', label: 'Harried by bats', until: 'combat' });
    }
    if (f.defId === 'deep_hags' && g.d6() <= f.count) {
      const h = randomHero(g);
      if (h) addCondition(h, { id: 'bewitched', label: 'Bewitched (-2 Attack)', until: 'combat' });
    }
    const lo = fspecial(f, 'lantern_out');
    if (lo && g.chance(lo.chance) && g.s.dungeon) {
      c.flags.darkness = true;
      g.log('bad', 'An unnatural chill snuffs out every flame!');
    }
    if (f.defId === 'doppelganger') {
      const h = randomHero(g);
      if (h) {
        c.flags.mimic = h.id;
        g.log('combat', `The doppelganger takes the form of ${h.name}!`);
      }
    }
    if (f.defId === 'cornucopia_of_chaos') c.foes.push(makeFoe(g, 'azure_gremlins', { count: g.roll('d6+1') }));
    if (f.defId === 'toadstool_knights') f.state.shields = f.count;
    if (fspecial(f, 'ranged_volley')) await volley(g, f);
  }
}

async function volley(g: Game, f: Foe) {
  const v = fspecial(f, 'ranged_volley')!;
  const L = typeof v.L === 'number' ? v.L : g.hcl() + 3;
  const n = v.half ? Math.max(1, Math.floor(f.count / 2)) : f.count;
  const { resolveSwing } = await import('./foeturn');
  const fake = { ...f, level: L, levelMods: [] } as Foe;
  g.log('combat', `${n} ${f.name} loose missiles before melee!`);
  cs(g).flags.rangedPhase = true;
  const heroes = g.party();
  for (let i = 0; i < n && heroes.length; i++) {
    const h = heroes[i % heroes.length];
    if (isAlive(h)) await resolveSwing(g, fake, h, 1, { ranged: true });
  }
  cs(g).flags.rangedPhase = false;
}

/** At the start of the foes' turn. */
export async function foeTurnStart(g: Game) {
  const c = cs(g);
  for (const f of liveFoes(g)) {
    // Breath weapons
    const br = fspecial(f, 'breath');
    if (br) {
      const fire = br.firstTurn ? !f.state.breathed : br.chance >= 6 || g.d6() <= br.chance;
      if (fire && (!br.firstTurn || !f.state.breathed)) {
        f.state.breathed = true;
        g.log('combat', `${f.name} unleashes its ${br.kind} breath!`);
        const L = typeof br.save === 'number' ? br.save : g.hcl() + 3;
        for (const h of g.party()) {
          const bonuses = { ...(br.allHalf ? { all: 'half' as const } : {}), ...(br.halflingReroll ? { halfling: 'reroll' as const } : {}) };
          const r = await save(g, h, { type: br.kind === 'fire' ? 'breath' : 'poison', target: L, label: `Save vs L${L} ${br.kind} breath`, bonuses });
          if (!r.success) await g.damage(h, br.damage === 'd3' ? g.roll('d3') : br.damage, `${br.kind} breath`);
        }
        if (br.replaceAttacks || br.firstTurn) f.state.noAttackTurn = c.turn;
        // breath destroys mirror images
        for (const h of g.party()) hc(g, h).mirrorImages = 0;
      }
    }
    if (f.defId === 'fire_bear' && (!f.state.breathed || f.state.breatheNext)) {
      f.state.breathed = true;
      f.state.breatheNext = false;
      f.state.noAttackTurn = c.turn;
      const { defenseMods } = await import('../mods/defense');
      for (const h of g.party()) {
        const r = await g.heroRoll({ hero: h, kind: 'defense', label: 'Dodge fire breath', mods: defenseMods(g, h, f), target: g.hcl() + 3, mode: 'gt' });
        if (!r.success) await g.damage(h, 2, 'fire breath');
      }
    }
    if (f.defId === 'cave_dragon' && !f.state.tar) {
      f.state.tar = true;
      f.state.noAttackTurn = c.turn;
      const { defenseMods } = await import('../mods/defense');
      for (const h of g.party()) {
        const r = await g.heroRoll({ hero: h, kind: 'defense', label: 'Dodge the tar', mods: defenseMods(g, h, f), target: g.hcl() + 3, mode: 'gt' });
        if (!r.success) {
          addCondition(h, { id: 'tarred', label: 'Covered in tar', until: 'combat' });
          if (r.natural === 1) addCondition(h, { id: 'tar_eyes', label: 'Tar in eyes', until: 'combat' });
        }
      }
    } else if (f.defId === 'cave_dragon') {
      for (const h of g.party()) {
        const tar = h.conditions.some((x) => x.id === 'tarred');
        const r = await save(g, h, { type: 'breath', target: g.hcl() + 3, label: 'Save vs fire breath', bonuses: tar ? {} : { all: 'L', halfling: 'reroll' } });
        if (!r.success) await g.damage(h, 1, 'fire breath');
      }
    }
    const storm = fspecial(f, 'spore_storm');
    if (storm && !f.state.stormed) {
      f.state.stormed = true;
      f.state.noAttackTurn = c.turn;
      for (const h of g.party()) {
        const r = await save(g, h, { type: 'poison', target: storm.L, label: 'Save vs L5 spore storm', bonuses: { all: 'half', halfling: 'reroll' } });
        if (!r.success) addCondition(h, { id: 'blinded', label: 'Blinded by spores', until: 'combat' });
      }
    }
    if (f.defId === 'chimaera') void 0;
    const hal = fspecial(f, 'hallucinate');
    if (hal && g.d6() === 1) {
      g.log('combat', 'A spore toad belches hallucinogenic spores!');
      for (const out of await saveAll(g, { type: 'magic', target: hal.L, label: 'Save vs L2 magic' })) if (!out.success) addCondition(out.hero, { id: 'hallucinating', label: 'Hallucinating', until: 'combat' });
    }
    const conf = fspecial(f, 'confuse');
    if (conf) {
      const h = randomHero(g);
      if (h) {
        const r = await save(g, h, { type: 'mental', target: conf.L, label: 'Save vs L3 magic (hallucination)' });
        if (!r.success) hc(g, h).confused = true;
      }
    }
    if (f.defId === 'milethia') await milethiaAct(g, f);
    if (f.defId === 'zurla') f.state.zurla = true;
    if (f.defId === 'acid_cube') await acidCube(g, f);
    if (f.defId === 'cavern_sludge') await sludge(g, f);
    if (f.defId === 'lurking_mantlebeast') await mantle(g, f);
    if (f.defId === 'goblin_spider' && c.flags.spiderVictim) {
      const v = g.hero(c.flags.spiderVictim as string);
      if (isAlive(v)) await g.damage(v, 1, 'strangling web');
      f.state.noAttackTurn = c.turn;
    }
    if (f.defId === 'cornucopia_of_chaos') {
      const n = g.roll('d6');
      const ex = c.foes.find((x) => x.defId === 'azure_gremlins' && foeAlive(x));
      if (ex) (ex.count += n), (ex.initialCount += n);
      else c.foes.push(makeFoe(g, 'azure_gremlins', { count: n }));
      g.log('combat', `The Cornucopia spews ${n} more azure gremlins!`);
    }
    if (f.state.poisonedAt === c.turn) {
      f.life -= 1;
      g.log('combat', `${f.name} reels from poisonous flesh (1 damage).`);
    }
  }
  // Doppelganger confusion: others must Save to be able to attack
  if (c.flags.mimic) for (const h of g.party()) if (h.id !== c.flags.mimic) {
    const r = await save(g, h, { type: 'confusion', target: 4, label: 'Save vs L4 confusion' });
    hc(g, h).confused = !r.success;
  }
}

async function milethiaAct(g: Game, f: Foe) {
  const c = cs(g);
  const r = await g.tableRoll("Milethia's action", 'd6', { context: '1-3 dagger · 4-6 curse' });
  if (r <= 3) return; // normal L4 dagger attack handled as swing (she has L5 but dagger is L4)
  f.state.noAttackTurn = c.turn;
  const cursed = (c.flags.cursedBy as string) ?? '';
  const targets = g.party().filter((h) => !cursed.includes(h.id)).sort((a, b) => b.life - a.life);
  const h = targets[0];
  if (!h) return;
  const res = await save(g, h, { type: 'magic', target: 5, label: "Save vs L5 Milethia's curse", bonuses: { cleric: 'L', wizard: 'L' } });
  c.flags.cursedBy = cursed + h.id + ',';
  if (!res.success) addCondition(h, { id: 'witch_curse', label: "Milethia's curse", until: 'combat' });
}

async function acidCube(g: Game, f: Foe) {
  for (const h of g.party()) {
    const x = hc(g, h);
    if (x.engulfed) {
      await g.damage(h, 1, 'acid');
      continue;
    }
    const L = cs(g).flags[`meleed_${f.uid}_${h.id}`] ? 4 : 2;
    const r = await save(g, h, { type: 'engulf', target: L, label: `Save vs L${L} engulf` });
    if (!r.success) {
      x.engulfed = true;
      g.log('bad', `${h.name} is engulfed by the acid cube!`);
    }
  }
}

async function sludge(g: Game, f: Foe) {
  const { resolveSwing } = await import('./foeturn');
  for (const h of g.party()) await resolveSwing(g, f, h, 1);
}

async function mantle(g: Game, f: Foe) {
  if (!f.state.dropped) {
    f.state.dropped = true;
    for (const h of g.party()) {
      const r = await save(g, h, { type: 'engulf', target: 3, label: 'Save vs L3 (mantlebeast drops)', bonuses: { elf: 'one', rogue: 'one' }, agility: true });
      if (!r.success) hc(g, h).engulfed = true;
    }
  }
  for (const h of g.party()) if (hc(g, h).engulfed) await g.damage(h, 1, 'smothering');
}

/** End of the foes' turn: regeneration, curses, stirges. */
export async function foeTurnEnd(g: Game) {
  const c = cs(g);
  for (const f of c.foes) {
    if (f.state.pendingRegen && foeAlive(f) === false && isMinor(f)) void 0;
    if (f.state.pendingRegen) {
      const n = f.state.pendingRegen as number;
      let back = 0;
      for (let i = 0; i < n; i++) if (g.d6() <= 2) back++;
      f.state.pendingRegen = 0;
      if (back) {
        f.count += back;
        f.fled = false;
        g.log('bad', `${back} troll${back > 1 ? 's' : ''} regenerate${back > 1 ? '' : 's'} and rise again!`);
      }
    }
    if (f.state.pendingRevive) {
      f.count += f.state.pendingRevive as number;
      g.log('bad', `${f.state.pendingRevive} possessed dwarves rise again!`);
      f.state.pendingRevive = 0;
    }
    if (f.state.reinforce) {
      f.count += f.state.reinforce as number;
      g.log('bad', `${f.state.reinforce} more jackal-men arrive!`);
      f.state.reinforce = 0;
    }
    if (!foeAlive(f)) continue;
    const rg = fspecial(f, 'regenerate_every');
    if (rg && c.turn % rg.turns === 0 && f.life < f.maxLife) {
      f.life += rg.amount;
      g.log('bad', `${f.name} regenerates.`);
    }
    if (fspecial(f, 'troll_regen') && f.life < f.maxLife && f.state.burnedThisTurn !== c.turn && f.state.acidThisTurn !== c.turn) {
      f.life += 1;
      g.log('bad', `${f.name} regenerates 1 Life.`);
    }
    if (f.defId === 'fungus_hydra' && !f.state.burned) {
      const regrow = ((f.state.regrow as unknown) as number[]) ?? [];
      const due = regrow.filter((t) => t <= c.turn).length;
      if (due) {
        f.state.heads = Math.min(f.attacks, ((f.state.heads as number) ?? 0) + due);
        f.state.regrow = regrow.filter((t) => t > c.turn) as unknown as string;
        g.log('bad', `${due} hydra head${due > 1 ? 's' : ''} regrow!`);
      }
    }
    if (f.defId === 'skeletal_demon' && c.flags.summonSkeletons) {
      const n = c.flags.summonSkeletons as number;
      c.flags.summonSkeletons = 0;
      c.foes.push(makeFoe(g, 'armored_skeletons', { count: n }));
      g.log('bad', `${n} armored skeleton${n > 1 ? 's' : ''} claw out of the floor!`);
    }
  }
  if (c.flags.mummyRise) {
    const id = c.flags.mummyRise as string;
    c.flags.mummyRise = false;
    const m = makeFoe(g, 'risen_mummy');
    m.name = `${g.hero(id).name} (Mummy)`;
    m.level = g.hero(id).level + 2;
    c.foes.push(m);
    g.hero(id).conditions.push({ id: 'no_resurrect', label: 'Became a mummy' });
    g.log('bad', `${g.hero(id).name} rises as a mummy!`);
  }
  for (const h of g.party()) {
    const x = hc(g, h);
    if (h.conditions.some((k) => k.id === 'witch_curse')) {
      const k = h.conditions.find((q) => q.id === 'witch_curse')!;
      if (k.turnsLeft && k.turnsLeft > 0) k.turnsLeft--;
      else await g.damage(h, 1, "Milethia's curse", { noReduce: true });
    }
    if (x.stirged && liveFoes(g).some((f) => f.defId === 'stirges')) await g.damage(h, 1, 'stirge drain', { noReduce: true });
    if (c.flags[`rot_${h.id}`]) {
      c.flags[`rot_${h.id}`] = false;
      await g.damage(h, 1, 'spore rot', { noReduce: true });
    }
    if (f_wraith(g) && !c.hitThisTurn.some((u) => c.foes.find((f) => f.uid === u)?.defId === 'cavern_wraith')) await g.damage(h, 1, 'wraith chill', { noReduce: true });
  }
  for (const f of c.foes) if (f.state.noAttackTurn === c.turn) delete f.state.noAttackTurn;
  void base;
  void removeCond;
  void gainMadness;
}

function f_wraith(g: Game) {
  return liveFoes(g).some((f) => f.defId === 'cavern_wraith');
}
