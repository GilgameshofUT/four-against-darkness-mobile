import type { Game } from '../game';
import type { Hero } from '../types';
import { save, saveAll, byPosition, randomHero } from '../checks';
import { defenseMods } from '../mods/defense';
import { addCondition, isMetal } from '../effects';
import { hasShieldInHand, isAlive, tierOf, mainHand, offHand } from '../hero';
import { cs } from '../combat/util';

/** Who may try to spot & disarm a trap before it triggers (positions 1-2). */
function disarmers(g: Game): { h: Hero; bonus: number; label: string }[] {
  const order = (g.s.dungeon?.marchingOrder ?? []).map((id) => g.hero(id)).filter(isAlive).slice(0, 2);
  const out: { h: Hero; bonus: number; label: string }[] = [];
  for (const h of order) {
    const T = tierOf(h.level);
    let b = -1;
    if (h.classId === 'rogue') b = h.level;
    if (h.classId === 'assassin') b = 0;
    if (h.classId === 'gnome') b = h.level;
    if (h.classId === 'kukla') b = Math.floor(h.level / 2);
    if (b < 0) continue;
    if (h.traits.includes('delicate_touch') || h.traits.includes('trap_expert')) b += T;
    out.push({ h, bonus: b, label: h.classId });
  }
  return out;
}

export async function trap(g: Game, env = g.s.dungeon!.tiles[g.s.dungeon!.currentTile].env) {
  const d = g.s.dungeon!;
  // Ways to avoid a trap entirely before it is played
  const instinct = g.party().find((h) => h.traits.includes('survival_instinct') && !g.isSpent(h, 'adventure', 'survival_instinct'));
  const miner = env === 'caverns' && byPosition(g, 1)?.inventory.some((i) => i.base === 'miners_amulet' && !i.used) && !d.keywords.includes('miners_amulet_used');
  const monkWarn = env === 'fungal' && d.keywords.includes('mycelium_warning');
  if (monkWarn) {
    d.keywords = d.keywords.filter((k) => k !== 'mycelium_warning');
    g.log('good', 'The mycelial network warned you: you avoid a trap.');
    return;
  }
  const avoid: { value: string; label: string }[] = [];
  if (instinct) avoid.push({ value: 'instinct', label: `${instinct.name}: Survival Instinct` });
  if (miner) avoid.push({ value: 'miner', label: "Miners' Amulet" });
  if (avoid.length) {
    const p = await g.choose('A trap!', [...avoid, { value: '', label: 'Face it' }], { art: 'features/trap_beartrap' });
    if (p === 'instinct') return void (g.spend(instinct!, 'adventure', 'survival_instinct'), g.log('good', 'Your instincts lead you around the trap.'));
    if (p === 'miner') return void (d.keywords.push('miners_amulet_used'), g.log('good', 'The amulet glows and you step around the trap.'));
  }
  const r = await g.tableRoll(`${env === 'dungeon' ? 'Dungeon' : env === 'caverns' ? 'Caverns' : 'Fungal'} Trap`, 'd6');
  const H = g.hcl();
  const kind = env === 'dungeon' ? dungeonTrapL(r, H) : env === 'caverns' ? caveTrapL(r, H) : fungalTrapL(r, H);
  // Rogue/disarmer may spot it first (dungeon traps; book also allows elsewhere)
  for (const dz of disarmers(g)) {
    const res = await g.heroRoll({ hero: dz.h, kind: 'save', label: `Spot & disarm (${kind.name})`, mods: [{ label: 'Trap skill', value: dz.bonus }], target: kind.L, saveType: 'trap', context: `Save vs trap L${kind.L}` });
    if (res.success) {
      g.log('good', `${dz.h.name} spots the ${kind.name} and disarms it!`);
      return;
    }
    break;
  }
  if (env === 'dungeon') return dungeonTrap(g, r, H);
  if (env === 'caverns') return caveTrap(g, r, H);
  return fungalTrap(g, r, H);
}

function dungeonTrapL(r: number, H: number) {
  return [{ name: 'dart trap', L: H + 1 }, { name: 'poison gas', L: H + 2 }, { name: 'trapdoor', L: H + 3 }, { name: 'bear trap', L: H + 3 }, { name: 'spear trap', L: H + 4 }, { name: 'falling stone', L: H + 4 }][r - 1];
}
function caveTrapL(r: number, H: number) {
  return [{ name: 'falling stalactite', L: H + 2 }, { name: 'rockslide', L: H + 2 }, { name: 'hidden pit', L: H + 1 }, { name: 'swinging log', L: H }, { name: 'spore patch', L: H + 1 }, { name: 'rolling boulder', L: H + 1 }][r - 1];
}
function fungalTrapL(r: number, H: number) {
  return [{ name: 'sleep spores', L: H }, { name: 'spore cloud', L: H + 1 }, { name: 'slime patch', L: H }, { name: 'mycelium snare', L: H + 3 }, { name: 'shrieking mushroom', L: 4 }, { name: 'cordyceps', L: H + 3 }][r - 1];
}

async function trapDefense(g: Game, h: Hero, L: number, label: string, opts: { noShield?: boolean; halflingReroll?: boolean } = {}) {
  const mods = defenseMods(g, h, undefined, { noShield: opts.noShield, trap: true });
  return g.heroRoll({ hero: h, kind: 'defense', label, mods, target: L, mode: 'gt', freeReroll: opts.halflingReroll, context: `Defense vs L${L}` });
}

async function dungeonTrap(g: Game, r: number, H: number) {
  switch (r) {
    case 1: {
      const h = randomHero(g)!;
      await g.say('Dart trap!', `Darts hiss out of the walls toward ${h.name}!`, 'features/trap_dart');
      const res = await trapDefense(g, h, H + 1, 'Dodge the darts', { halflingReroll: true });
      if (!res.success) await g.damage(h, 1, 'dart');
      return;
    }
    case 2:
      await g.say('Poison gas!', 'Green gas fills the room!', 'features/trap_gas');
      for (const o of await saveAll(g, { type: 'gas', target: H + 2, label: `Save vs L${H + 2} poison gas`, bonuses: { barbarian: 'L', halfling: 'L' } })) if (!o.success) await g.damage(o.hero, 1, 'poison gas');
      return;
    case 3: {
      const h = byPosition(g, 1)!;
      await g.say('Trapdoor!', `The floor opens beneath ${h.name}!`, 'features/trap_trapdoor');
      const res = await save(g, h, { type: 'trap', target: H + 3, label: `Save vs L${H + 3} trapdoor`, trapKind: 'trapdoor', bonuses: { halfling: 'one', elf: 'one', rogue: 'L' } });
      if (!res.success) {
        await g.damage(h, 1, 'fall');
        if (g.party().length <= 1 && isAlive(h)) {
          h.status = 'dead';
          g.log('bad', `${h.name} is trapped alone in the pit and perishes.`);
        } else g.log('info', 'Your companions haul them out of the pit.');
      }
      return;
    }
    case 4: {
      const h = byPosition(g, 1)!;
      await g.say('Bear trap!', `Steel jaws snap at ${h.name}'s foot!`, 'features/trap_beartrap');
      const res = await save(g, h, { type: 'trap', target: H + 3, label: `Save vs L${H + 3} bear trap`, bonuses: { halfling: 'one', elf: 'one', rogue: 'L' } });
      if (!res.success) {
        await g.damage(h, 1, 'bear trap');
        addCondition(h, { id: 'bear_trap', label: 'Wounded foot (−1 Atk/Def)', until: 'heal' });
      }
      return;
    }
    case 5: {
      await g.say('Spear trap!', 'Spears thrust out of the walls!', 'features/trap_spears');
      const pool = [...g.party()];
      for (let i = 0; i < 2 && pool.length; i++) {
        const h = pool.splice(Math.floor(g.d6() / 7 * pool.length), 1)[0];
        const res = await trapDefense(g, h, H + 4, 'Dodge the spears');
        if (!res.success) await g.damage(h, 1, 'spear');
      }
      return;
    }
    default: {
      const h = byPosition(g, 4)!;
      await g.say('Falling stone!', `A huge stone drops toward ${h.name}!`, 'features/trap_stone');
      const res = await trapDefense(g, h, H + 4, 'Dodge the stone', { noShield: true });
      if (!res.success) await g.damage(h, 2, 'falling stone');
    }
  }
}

async function caveTrap(g: Game, r: number, H: number) {
  const base = { all: 'half' as const, rogue: 'L' as const, halfling: 'half' as const };
  const reroll = { halfling: 'reroll' as const };
  switch (r) {
    case 1: {
      const h = randomHero(g)!;
      await g.say('Stalactite!', `A stalactite plummets toward ${h.name}!`, 'features/stalactites');
      const res = await save(g, h, { type: 'trap', target: H + 2, label: 'Save vs stalactite', bonuses: base });
      if (!res.success) await g.damage(h, 1, 'stalactite');
      return;
    }
    case 2:
      await g.say('Rockslide!', 'Loose stones cascade down the tunnel!', 'features/rockslide');
      for (const o of await saveAll(g, { type: 'trap', target: H + 2, label: 'Save vs rockslide', bonuses: { ...base, gnome: 'L', dwarf: 'L' } })) if (!o.success) await g.damage(o.hero, 1, 'rockslide');
      return;
    case 3: {
      const h = byPosition(g, 1)!;
      await g.say('Hidden pit!', `${h.name} steps onto a hidden pit!`, 'features/trap_trapdoor');
      const res = await save(g, h, { type: 'trap', target: H + 1, label: 'Save vs hidden pit', bonuses: base, trapKind: 'pit' });
      if (!res.success) {
        await g.damage(h, 1, 'fall');
        if (g.s.clues >= 1 && (await g.yesNo('Something at the bottom…', 'Spend 1 Clue to find a Secret Passage at the bottom of the pit?'))) {
          g.s.clues--;
          g.s.dungeon!.keywords.push('pit_passage');
        }
      }
      return;
    }
    case 4: {
      await g.say('Swinging log!', 'A huge log swings from the ceiling!', 'features/swinging_log');
      for (const id of g.s.dungeon!.marchingOrder) {
        const h = g.hero(id);
        if (!isAlive(h)) continue;
        const res = await save(g, h, { type: 'trap', target: H, label: 'Save vs swinging log', bonuses: base });
        if (!res.success) {
          await g.damage(h, 2, 'log');
          break;
        }
      }
      return;
    }
    case 5: {
      if (byPosition(g, 1)?.classId === 'mushroom_monk') return void g.log('good', 'The mushroom monk guides you safely past the spores.');
      const h = randomHero(g)!;
      await g.say('Toxic spores!', `${h.name} steps on a patch of mushrooms!`, 'features/spore_trap');
      const res = await save(g, h, { type: 'poison', target: H + 1, label: 'Save vs spores', bonuses: { ...base, ranger: 'L', druid: 'L', mushroom_monk: 'immune' } });
      if (!res.success) addCondition(h, { id: 'spore_sick', label: 'Spore sickness (−1 Saves)', tilesLeft: 6 });
      return;
    }
    default: {
      await g.say('Rolling boulder!', 'A giant boulder rumbles toward you!', 'features/rolling_boulder');
      const n = g.roll('d3');
      const order = g.s.dungeon!.marchingOrder.map((id) => g.hero(id)).filter(isAlive);
      const fromBack = await g.choose('Where does it come from?', [{ value: false, label: 'From the front' }, { value: true, label: 'From the back' }]);
      const hit = fromBack ? order.slice(-n) : order.slice(0, n);
      for (const h of hit) {
        const res = await save(g, h, { type: 'trap', target: H + 1, label: 'Save vs rolling boulder', bonuses: base });
        if (!res.success) await g.damage(h, 2, 'boulder');
      }
      g.s.dungeon!.keywords.push('boulder_block');
    }
  }
  void reroll;
}

async function fungalTrap(g: Game, r: number, H: number) {
  const immune = { mushroom_monk: 'immune' as const, kukla: 'immune' as const };
  switch (r) {
    case 1: {
      const h = randomHero(g)!;
      await g.say('Sleep spores!', 'A cloud of drowsy spores!', 'features/spore_trap');
      const t = await save(g, h, { type: 'trap', target: H, label: 'Save vs sleep spore trap' });
      if (t.success) return;
      const outs = await saveAll(g, { type: 'sleep', target: H, label: 'Save vs sleep spores', bonuses: { ...immune, halfling: 'L', all: 'half' } });
      if (outs.every((o) => !o.success)) {
        for (const o of outs) o.hero.status = 'dead';
        g.log('bad', 'The whole party falls asleep in the spores… and never wakes.');
      } else g.log('info', 'The sleepers are shaken awake.');
      return;
    }
    case 2: {
      const h = randomHero(g)!;
      await g.say('Spore cloud!', `${h.name} steps on a purple puffball!`, 'features/spore_trap');
      const t = await save(g, h, { type: 'trap', target: H + 1, label: 'Save vs puffball' });
      if (t.success) return;
      const p = await save(g, h, { type: 'poison', target: H + 3, label: 'Save vs toxic spores', bonuses: { ...immune, halfling: 'L', barbarian: 'L', all: 'half' } });
      if (!p.success) {
        await g.damage(h, 1, 'spores');
        if (g.d6() === 1) g.s.dungeon!.keywords.push('call_wanderers');
      }
      return;
    }
    case 3: {
      const h = byPosition(g, 1)!;
      await g.say('Slime patch!', `${h.name} slips on fungal slime!`, 'features/slime_patch');
      const t = await save(g, h, { type: 'trap', target: H, label: 'Save vs slime patch', agility: true });
      if (!t.success && g.d6() === 1) g.s.dungeon!.keywords.push('call_wanderers');
      return;
    }
    case 4: {
      const h = randomHero(g)!;
      await g.say('Mycelium snare!', 'Fungal fibers drop from the ceiling!', 'features/slime_patch');
      const t = await save(g, h, { type: 'trap', target: H + 3, label: 'Save vs mycelium snare' });
      if (!t.success) {
        const held = [mainHand(h), offHand(h)].filter(Boolean);
        if (held.length) {
          const uid = await g.choose(`What does ${h.name} lose?`, held.map((i) => ({ value: i!.uid, label: i!.name })));
          const it = h.inventory.find((i) => i.uid === uid)!;
          h.inventory = h.inventory.filter((i) => i !== it);
          for (const k of ['main', 'off'] as const) if (h.equip[k] === uid) h.equip[k] = undefined;
          if (it.base === 'lantern' && g.s.dungeon!.lanternBearer === h.id) g.s.dungeon!.lanternBearer = undefined;
          g.log('bad', `${h.name}'s ${it.name} is snatched away!`);
        }
      }
      return;
    }
    case 5: {
      const h = byPosition(g, 1)!;
      let chance = 4;
      if (h.classId === 'halfling' || ['ranger', 'druid'].includes(h.classId)) chance -= 2;
      if (h.classId === 'rogue') chance -= 1;
      await g.say('Shrieking mushroom!', 'A tiny mushroom with a face…', 'features/shrieking_mushroom');
      if (g.d6() <= chance) {
        g.log('bad', 'It SHRIEKS!');
        g.s.dungeon!.keywords.push('call_wanderers_now');
      }
      return;
    }
    default: {
      const h = randomHero(g)!;
      await g.say('Cordyceps!', `A parasitic fungus lunges at ${h.name}!`, 'features/spore_trap');
      const p = await save(g, h, { type: 'poison', target: H + 3, label: 'Save vs cordyceps infection', bonuses: { ...immune, halfling: 'L', barbarian: 'L', all: 'half' } });
      if (!p.success) addCondition(h, { id: 'cordyceps', label: 'Mind-controlled by cordyceps', turnsLeft: 6 });
    }
  }
  void hasShieldInHand;
  void isMetal;
  void cs;
}
