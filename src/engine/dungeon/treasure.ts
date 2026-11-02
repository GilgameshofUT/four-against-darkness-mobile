import type { Game } from '../game';
import type { Env, Item, SpellList } from '../types';
import { WIZARD_BASIC, DRUID_SPELLS, ILLUSIONIST_SPELLS, SPELLS } from '../../data/spells';
import { MUSHROOMS } from '../../data/mushrooms';
import { maxExpr } from '../dice';

export interface TreasureCtx {
  env: Env;
  mod?: number;
  goldMult?: number; // secret door doubles, final boss triples
  noMagic?: boolean; // orcs
  fiendish?: boolean;
  witch?: boolean;
  source?: string;
}

/** Random spell scroll/prism/bark */
export function randomSpell(g: Game, list: SpellList): Item {
  if (list === 'wizard') {
    const id = WIZARD_BASIC[g.d6() - 1];
    return g.newItem('scroll', { name: `Scroll of ${SPELLS[id].name}`, spell: { list, id } });
  }
  const pool = list === 'druid' ? DRUID_SPELLS : ILLUSIONIST_SPELLS;
  const id = pool[g.roll('d12') - 1];
  return g.newItem(list === 'druid' ? 'bark' : 'prism', { name: `${list === 'druid' ? 'Bark' : 'Prism'} of ${SPELLS[id].name}`, spell: { list, id } });
}

async function gold(g: Game, expr: string, ctx: TreasureCtx, label: string) {
  let n = g.roll(expr);
  const gn = g.party().find((h) => h.traits.includes('gold_nose') && !g.isSpent(h, 'adventure', 'gold_nose'));
  if (gn && n < maxExpr(expr) && (await g.yesNo(`${gn.name}: Gold Nose?`, `Found ${n} gp; take the maximum ${maxExpr(expr)} instead? (once per adventure)`))) {
    g.spend(gn, 'adventure', 'gold_nose');
    n = maxExpr(expr);
  }
  n *= ctx.goldMult ?? 1;
  g.addGold(n, label);
}

async function gem(g: Game, expr: string, kind: 'gem' | 'jewelry', ctx: TreasureCtx) {
  let v = g.roll(expr);
  const gn = g.party().find((h) => h.traits.includes('gold_nose') && !g.isSpent(h, 'adventure', 'gold_nose'));
  if (gn && v < maxExpr(expr) && (await g.yesNo(`${gn.name}: Gold Nose?`, `A ${kind} worth ${v} gp; make it the maximum ${maxExpr(expr)}?`))) {
    g.spend(gn, 'adventure', 'gold_nose');
    v = maxExpr(expr);
  }
  v *= ctx.goldMult ?? 1;
  const it = g.newItem(kind, { name: `${kind === 'gem' ? 'Gem' : 'Jewelry'} (${v} gp)`, value: v });
  g.log('loot', `Found a ${kind} worth ${v} gp!`);
  await g.distribute(it);
}

/** Treasure Table (d6), environment aware. */
export async function rollTreasure(g: Game, ctx: TreasureCtx): Promise<void> {
  if (ctx.fiendish) return fiendishTreasure(g, ctx);
  if (ctx.witch) return witchTreasure(g, ctx);
  const r = await g.tableRoll('Treasure', 'd6', { mods: ctx.mod ? [{ label: 'Treasure mod', value: ctx.mod }] : [], context: treasureContext(ctx.env) });
  const env = ctx.env;
  if (r <= 0) return void g.log('info', 'No treasure.');
  if (r === 1) return gold(g, 'd6', ctx, 'treasure');
  if (r === 2) {
    if (env === 'fungal') {
      const p = await g.choose('Fungal treasure', [{ value: 'food', label: '2d6 Food rations' }, { value: 'mush', label: 'Roll on the Rare Mushroom table' }]);
      if (p === 'food') return foodFind(g, g.roll('2d6'));
      return rareMushroom(g);
    }
    return gold(g, '2d6', ctx, 'treasure');
  }
  if (r === 3) {
    if (env === 'dungeon') return void (await g.distribute(randomSpell(g, 'wizard'), 'A scroll!'));
    if (env === 'caverns') return void (await g.distribute(randomSpell(g, 'illusionist'), 'A prism!'));
    const p = await g.choose('Fungal treasure', [{ value: 'bark', label: 'Bark with a druid spell' }, { value: 'mush', label: 'Rare Mushroom' }]);
    if (p === 'bark') return void (await g.distribute(randomSpell(g, 'druid')));
    return rareMushroom(g);
  }
  if (r === 4) {
    if (env === 'dungeon') return gem(g, '2d6x5', 'jewelry', ctx);
    if (env === 'caverns') return gem(g, '3d6x5', 'gem', ctx);
    const p = await g.choose('Fungal treasure', [{ value: 'gem', label: 'A gem (2d6×5 gp)' }, { value: 'mush', label: '2 Rare Mushrooms' }]);
    if (p === 'gem') return gem(g, '2d6x5', 'gem', ctx);
    await rareMushroom(g);
    return rareMushroom(g);
  }
  if (r === 5) {
    if (env === 'dungeon') {
      await g.say('Treasure chest!', 'A chest full of coins.', 'items/treasure_chest');
      return gold(g, '3d6x10', ctx, 'treasure chest');
    }
    if (env === 'caverns') {
      const p = await g.choose('Cavern treasure', [{ value: 'gem', label: 'A gem (3d6×10 gp)' }, { value: 'prism', label: 'A prism' }]);
      if (p === 'gem') return gem(g, '3d6x10', 'gem', ctx);
      return void (await g.distribute(randomSpell(g, 'illusionist')));
    }
    const p = await g.choose('Fungal treasure', [{ value: 'gem', label: 'A gem (2d6×10 gp)' }, { value: 'mush', label: '3 Rare Mushrooms' }]);
    if (p === 'gem') return gem(g, '2d6x10', 'gem', ctx);
    for (let i = 0; i < 3; i++) await rareMushroom(g);
    return;
  }
  // 6+
  if (env === 'caverns') return caveSpecialItem(g);
  if (env === 'fungal') {
    const p = await g.choose('Fungal treasure', [{ value: 'magic', label: 'Dungeon Magic Treasure' }, { value: 'rare', label: 'Fungal Rare Item' }]);
    if (p === 'rare') return fungalRareItem(g);
  }
  if (ctx.noMagic) return gold(g, 'd6xd6', ctx, 'no magic for orcs');
  return magicTreasure(g, env);
}

function treasureContext(env: Env) {
  if (env === 'dungeon') return '1 d6gp · 2 2d6gp · 3 scroll · 4 jewel · 5 chest · 6 magic';
  if (env === 'caverns') return '1 d6gp · 2 2d6gp · 3 prism · 4 gem · 5 gem/prism · 6 special item';
  return '1 d6gp · 2 food/mushroom · 3 bark/mushroom · 4 gem/mushrooms · 5 gem/mushrooms · 6 magic/rare';
}

export async function foodFind(g: Game, n: number) {
  await g.distribute(g.newItem('food', { qty: n, name: 'Food Ration' }), `${n} Food rations.`);
}

export async function magicTreasure(g: Game, env: Env): Promise<void> {
  const r = await g.tableRoll('Magic Treasure', 'd6', { context: '1 Wand of Sleep · 2 Ring of Teleportation · 3 Fools\u2019 Gold · 4 Magic Weapon · 5 Healing Potion · 6 Fireball Staff' });
  let it: Item;
  switch (r) {
    case 1: it = g.newItem('wand_of_sleep', { charges: 3, name: 'Wand of Sleep (3)' }); break;
    case 2: it = g.newItem('ring_teleport'); break;
    case 3: it = g.newItem('fools_gold'); break;
    case 4: {
      const k = g.d6();
      const kinds: [string, string, 'crushing' | 'slashing'][] = [['light_weapon', 'Club', 'crushing'], ['light_weapon', 'Dagger', 'slashing'], ['hand_weapon', 'Mace', 'crushing'], ['hand_weapon', 'Sword', 'slashing'], ['two_handed', 'Greatsword', 'slashing'], ['bow', 'Bow', 'slashing']];
      const [kind, nm, dmg] = kinds[k - 1];
      it = g.newItem('magic_weapon', { name: `Magic ${nm} +1`, magicAttack: 1, damage: dmg, data: { kind }, value: 100 });
      break;
    }
    case 5: it = g.newItem('healing_potion'); break;
    default:
      if (env === 'fungal') return rareMushroom(g);
      it = g.newItem('fireball_staff', { charges: 2, name: 'Fireball Staff (2)' });
  }
  await g.say('Magic!', `You found: ${it.name}.`, `items/${it.base === 'magic_weapon' ? 'magic_weapon' : it.base}`);
  await g.distribute(it);
}

export async function rareMushroom(g: Game) {
  const r = await g.tableRoll('Rare Mushroom', 'd6');
  const m = MUSHROOMS[r - 1];
  let it = g.newItem('mushroom', { name: m.name, data: { kind: m.id }, value: m.resale });
  if (m.id === 'purple_truffle') {
    let fake = g.d6() <= 3;
    const hf = g.party().find((h) => h.classId === 'halfling');
    if (fake && hf) fake = g.d6() <= 3;
    it = fake ? g.newItem('mushroom', { name: 'Lesser truffle', data: { kind: 'lesser_truffle' }, value: g.roll('d6') }) : g.newItem('mushroom', { name: m.name, data: { kind: m.id }, value: g.roll('6d6') });
  }
  if (m.id === 'healer_chanterelle') it.expires = true;
  g.log('loot', `Found ${it.name}.`);
  await g.distribute(it, m.desc);
}

export async function caveSpecialItem(g: Game) {
  const r = await g.tableRoll('Caverns Special Item', 'd6');
  switch (r) {
    case 1: return gem(g, '3d6+3', 'gem', { env: 'caverns' });
    case 2: return void (await g.distribute(g.newItem('glittering_crystal')));
    case 3: return void (await g.distribute(g.newItem('map_fragment')));
    case 4: return deadAdventurer(g, 'caverns');
    case 5: return void (await g.distribute(g.newItem('miners_ointment')));
    default: return void (await g.distribute(g.newItem('miners_amulet')));
  }
}

export async function fungalRareItem(g: Game) {
  const r = await g.tableRoll('Fungal Rare Item', 'd6');
  switch (r) {
    case 1: {
      const p = await g.choose('Choose', [{ value: 'gem', label: 'Small gemstone (2d6+2 gp)' }, { value: 'leaf', label: 'Leafsteel armor (+2, 3 adventures)' }]);
      if (p === 'gem') return gem(g, '2d6+2', 'gem', { env: 'fungal' });
      return void (await g.distribute(g.newItem('leafsteel_armor', { adventuresLeft: 3 })));
    }
    case 2: return void (await g.distribute(g.newItem('mushroom', { name: "Xichtul's Cap", data: { kind: 'xichtul_cap' }, value: 60 }), 'Throw for d3 automatic damage (you take 1).'));
    case 3: {
      const e = await g.choose('Red Death: choose its effect now', [{ value: 'damage', label: '1 automatic damage' }, { value: 'level', label: "Reduce a Foe's L by 1" }]);
      return void (await g.distribute(g.newItem('mushroom', { name: 'Red Death', data: { kind: 'red_death', effect: e } })));
    }
    case 4: return deadAdventurer(g, 'fungal');
    case 5: {
      const n = g.roll('d6');
      return void (await g.distribute(g.newItem('mushroom', { name: 'White Angel', qty: n, data: { kind: 'white_angel' }, value: 10, expires: false }), `${n} white angels: eat to heal 2 Life.`));
    }
    default: return void (await g.distribute(g.newItem('mushroom', { name: 'Morel Crusher', data: { kind: 'morel_crusher' }, value: 40 })));
  }
}

async function deadAdventurer(g: Game, env: Env) {
  await g.say('A fallen adventurer', 'You find the remains of someone less fortunate.', 'features/hidden_treasure');
  if (env === 'caverns') {
    const n = g.roll('d6');
    for (let i = 0; i < n; i++) g.party()[0] && (await g.distribute(g.newItem('gem', { name: 'Gem (10 gp)', value: 10 })));
  } else {
    await g.distribute(g.newItem('rope'));
    await foodFind(g, g.roll('2d6'));
    g.addGold(g.roll('2d6'), 'backpack');
  }
  const choices = ['heavy_armor', 'lantern', 'two_handed', 'bow', 'crossbow', 'scroll_blessing', 'scroll', ...(env === 'caverns' ? ['chicken_blood'] : [])];
  const p = await g.choose('Take one item', choices.map((c) => ({ value: c, label: c === 'scroll' ? 'Scroll with a random spell' : c.replace(/_/g, ' ') })));
  const it = p === 'scroll' ? randomSpell(g, 'wizard') : g.newItem(p, p === 'two_handed' ? { damage: 'slashing' } : {});
  await g.distribute(it);
}

async function witchTreasure(g: Game, ctx: TreasureCtx) {
  const r = await g.tableRoll("Milethia's Cave treasure", 'd6', { mods: ctx.mod ? [{ label: 'mod', value: ctx.mod }] : [] });
  if (r <= 0) return void g.log('info', 'Nothing.');
  if (r <= 2) return gold(g, 'd6+4', ctx, 'treasure');
  if (r === 3) {
    const p = await g.choose('Choose one', [{ value: 'rope', label: 'Rope' }, { value: 'lantern', label: 'Lantern' }, { value: 'hand_weapon', label: 'Hand weapon' }]);
    return void (await g.distribute(g.newItem(p, p === 'hand_weapon' ? { damage: 'slashing' } : {})));
  }
  if (r === 4) return gem(g, '2d6x5', 'gem', ctx);
  if (r === 5) return void (await g.distribute(g.newItem('disinfectant')));
  return void (await g.distribute(g.newItem('horseshoe')));
}

async function fiendishTreasure(g: Game, ctx: TreasureCtx) {
  const r = await g.tableRoll('Fiendish Treasure', 'd6', { mods: ctx.mod ? [{ label: 'mod', value: ctx.mod }] : [] });
  if (r <= 0) return void g.log('info', 'No treasure.');
  if (r === 1) return gold(g, '2d6x2', ctx, 'treasure');
  if (r === 2) return gold(g, '2d6x5', ctx, 'treasure');
  if (r === 3) {
    const p = await g.choose('Choose', [{ value: 'scroll', label: 'A scroll/prism/bark' }, { value: 'weapon', label: 'A weapon (2-in-6 silvered)' }]);
    if (p === 'scroll') {
      const l = await g.choose('Which kind?', [{ value: 'wizard', label: 'Scroll (wizard)' }, { value: 'illusionist', label: 'Prism (illusionist)' }, { value: 'druid', label: 'Bark (druid)' }]);
      return void (await g.distribute(randomSpell(g, l as SpellList)));
    }
    const w = await g.choose('Which weapon?', ['light_weapon', 'hand_weapon', 'two_handed', 'bow', 'crossbow'].map((x) => ({ value: x, label: x.replace(/_/g, ' ') })));
    const silver = g.chance(2);
    return void (await g.distribute(g.newItem(w, { silvered: silver, damage: 'slashing', name: `${silver ? 'Silvered ' : ''}${w.replace(/_/g, ' ')}` })));
  }
  if (r === 4) return gem(g, '2d6x10', 'gem', ctx);
  if (r === 5) return gem(g, '2d6x20', 'jewelry', ctx);
  return fiendishMagic(g);
}

async function fiendishMagic(g: Game) {
  const r = await g.tableRoll('Fiendish Magic Treasure', 'd6');
  if (r === 1) {
    const bonus = g.d6() >= 5 ? 2 : 1;
    const k = g.d6();
    const kinds: [string, string, 'crushing' | 'slashing'][] = [['light_weapon', 'Dagger', 'slashing'], ['hand_weapon', 'Mace', 'crushing'], ['hand_weapon', 'Sword', 'slashing'], ['hand_weapon', 'Axe', 'slashing'], ['two_handed', 'Maul', 'crushing'], ['two_handed', 'Greatsword', 'slashing']];
    const [kind, nm, dmg] = kinds[k - 1];
    return void (await g.distribute(g.newItem('magic_weapon', { name: `${nm} +${bonus}`, magicAttack: bonus, damage: dmg, data: { kind, axe: nm === 'Axe' } })));
  }
  if (r === 2) {
    const bonus = g.d6() >= 5 ? 2 : 1;
    const k = g.d6();
    if (k <= 2) return void (await g.distribute(g.newItem('magic_shield', { name: `Shield +${bonus}`, magicDefense: bonus })));
    if (k === 6) return void (await g.distribute(g.newItem('ring_protection', { name: `Ring of Protection +${bonus}`, magicDefense: bonus })));
    const heavy = k >= 4;
    return void (await g.distribute(g.newItem('magic_armor', { name: `${heavy ? 'Heavy' : 'Light'} Armor +${bonus}`, data: { armorType: heavy ? 'heavy' : 'light', def: (heavy ? 2 : 1) + bonus } })));
  }
  if (r === 3) {
    const n = g.roll('d3+1');
    for (let i = 0; i < n; i++) {
      const v = g.d6();
      const it = v <= 3 ? g.newItem('healing_potion') : v <= 5 ? g.newItem('acid_vial') : g.newItem('holy_water');
      await g.distribute(it);
    }
    return;
  }
  if (r === 4) {
    const ch = g.roll('2d3');
    return void (await g.distribute(g.newItem('wand_of_power', { charges: ch, name: `Wand of Power (${ch})` })));
  }
  if (r === 5) return void (await g.distribute(g.newItem('enchanted_paint')));
  const beads = g.roll('d6');
  await g.distribute(g.newItem('prayer_beads', { charges: beads, name: `Prayer Beads (${beads})` }));
}
