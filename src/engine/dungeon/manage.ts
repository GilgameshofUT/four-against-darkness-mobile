import type { Game } from '../game';
import type { Hero } from '../types';
import { base, maxLife, inventoryCount, canUseItem, weaponInfo, isAlive } from '../hero';
import { equipItem, transfer } from '../inventory';

/** Marching order & lantern management (outside combat). */
export async function manageMarching(g: Game) {
  const d = g.s.dungeon!;
  for (;;) {
    const order = d.marchingOrder.map((id) => g.hero(id));
    const opts = order.map((h, i) => ({ value: `pos:${i}`, label: `${i + 1}. ${h.name}${d.lanternBearer === h.id ? ' 🏮' : ''}`, desc: i < 2 ? 'Front rank (fights in corridors)' : 'Rear rank (ranged & spells in corridors)', icon: `portraits/${h.portrait}` }));
    const pick = await g.choose('Marching order', [...opts, { value: 'lantern', label: 'Change lantern bearer' }, { value: '', label: 'Done', tone: 'quiet' as const }], { text: 'Tap a hero to swap them with another position. Traps and corridor fights depend on this order.' });
    if (!pick) return;
    if (pick === 'lantern') {
      const holders = g.party().filter((h) => h.inventory.some((i) => i.base === 'lantern'));
      const h = await g.pickHero('Who carries the lantern?', holders, 'The bearer needs a free hand (no shield, bow, sling or two-handed weapon unless hooked).', true);
      if (h) {
        const lan = h.inventory.find((i) => i.base === 'lantern')!;
        equipItem(g, h, lan);
        d.lanternBearer = h.id;
      }
      continue;
    }
    const i = Number(pick.split(':')[1]);
    const j = await g.choose(`Swap ${order[i].name} with…`, order.map((h, k) => ({ value: k, label: `${k + 1}. ${h.name}`, disabled: k === i ? 'Same' : false })));
    [d.marchingOrder[i], d.marchingOrder[j]] = [d.marchingOrder[j], d.marchingOrder[i]];
  }
}

/** Use items outside combat: bandages, potions, food, mushrooms, give items. */
export async function manageInventory(g: Game) {
  for (;;) {
    const h = await g.pickHero('Whose pack?', g.party(), undefined, true);
    if (!h) return;
    await heroPack(g, h);
  }
}

export async function heroPack(g: Game, h: Hero) {
  for (;;) {
    const opts = h.inventory.map((it) => {
      const b = base(it);
      const eq = Object.values(h.equip).includes(it.uid) ? ' (equipped)' : '';
      return { value: it.uid, label: `${it.name}${it.qty && it.qty > 1 ? ` ×${it.qty}` : ''}${eq}`, desc: b?.desc, icon: `items/${b?.icon ?? 'scroll'}` };
    });
    const pick = await g.choose(`${h.name}'s pack (${h.life}/${maxLife(h)} Life)`, [...opts, { value: '', label: 'Back', tone: 'quiet' as const }], { who: h.id, layout: 'list' });
    if (!pick) return;
    const it = h.inventory.find((i) => i.uid === pick)!;
    const acts: { value: string; label: string; disabled?: string | false }[] = [];
    const b = base(it);
    if (it.base === 'bandage') acts.push({ value: 'bandage', label: 'Apply bandage (heal 1)' });
    if (it.base === 'healing_potion') acts.push({ value: 'potion', label: 'Drink (heal all)', disabled: g.isSpent(h, 'adventure', 'potion') ? 'Already drank one this adventure' : h.classId === 'barbarian' || h.classId === 'kukla' ? 'Cannot use' : false });
    if (it.base === 'mushroom') acts.push({ value: 'eat', label: 'Eat it', disabled: h.classId === 'kukla' ? 'Kuklas cannot eat' : false });
    if (it.base === 'food') acts.push({ value: 'eat_food', label: 'Eat a ration' });
    if (it.base === 'disinfectant') acts.push({ value: 'paste', label: 'Apply (restore 1 Life)' });
    if (it.base === 'berserker_mushroom') acts.push({ value: 'berserk', label: 'Save for combat', disabled: 'Use it in combat' });
    if (b?.kind === 'weapon' || b?.kind === 'armor' || b?.kind === 'shield' || ['lantern', 'glittering_crystal', 'amulet'].includes(it.base)) acts.push({ value: 'equip', label: 'Equip', disabled: canUseItem(h, it) ?? false });
    if (['scroll', 'prism', 'bark'].includes(it.base) && h.classId === 'wizard' && it.spell?.list === 'wizard') acts.push({ value: 'copy', label: 'Copy into spellbook (destroys scroll)' });
    acts.push({ value: 'give', label: 'Give to another hero' }, { value: 'drop', label: 'Drop' }, { value: '', label: 'Back' });
    const a = await g.choose(it.name, acts, { text: b?.desc, art: `items/${b?.icon ?? 'scroll'}` });
    if (a === 'bandage') {
      if (g.isSpent(h, 'adventure', 'bandage_received')) await g.say('Already bandaged', 'Each hero can use one bandage per adventure.');
      else {
        const t = await g.pickHero('Bandage whom?', g.party().filter((x) => x.life < maxLife(x) && !g.isSpent(x, 'adventure', 'bandage_received') && x.classId !== 'kukla'));
        if (t) {
          consume(h, it.uid);
          g.spend(t, 'adventure', 'bandage_received');
          g.heal(t, 1, 'bandage');
        }
      }
    }
    if (a === 'potion') {
      consume(h, it.uid);
      g.spend(h, 'adventure', 'potion');
      g.heal(h, maxLife(h), 'healing potion');
    }
    if (a === 'paste') {
      consume(h, it.uid);
      g.heal(h, 1, 'disinfectant');
    }
    if (a === 'eat_food') {
      consume(h, it.uid);
      g.log('info', `${h.name} eats a ration.`);
    }
    if (a === 'eat') {
      consume(h, it.uid);
      const k = it.data?.kind;
      if (k === 'healer_chanterelle') g.heal(h, maxLife(h), "Healer's Chanterelle");
      else if (k === 'white_angel') g.heal(h, 2, 'white angel');
      else if (k === 'phoenix') h.conditions.push({ id: 'phoenix', label: 'Phoenix (+1 Def & Saves)', tilesLeft: 3 });
      else g.log('info', 'Tasty.');
    }
    if (a === 'equip') equipItem(g, h, it);
    if (a === 'copy') {
      h.spellbook.push(it.spell!.id);
      consume(h, it.uid);
      g.log('good', `${h.name} copies the spell into the spellbook.`);
    }
    if (a === 'give') {
      const t = await g.pickHero('Give to…', g.party().filter((x) => x !== h), undefined, true);
      if (t) {
        const err = transfer(h, t, it.uid);
        if (err) await g.say('Cannot exchange', err);
      }
    }
    if (a === 'drop') {
      h.inventory = h.inventory.filter((i) => i !== it);
      for (const k of ['main', 'off', 'armor', 'neck'] as const) if (h.equip[k] === it.uid) h.equip[k] = undefined;
    }
    g.io.changed();
  }
}

function consume(h: Hero, uid: string) {
  const it = h.inventory.find((i) => i.uid === uid);
  if (!it) return;
  if ((it.qty ?? 1) > 1) it.qty!--;
  else h.inventory = h.inventory.filter((i) => i !== it);
}

/** Take cheap weapons from fallen humanoid foes. */
export async function takeWeapons(g: Game) {
  const d = g.s.dungeon!;
  const t = d.tiles[d.currentTile];
  t.notes = t.notes.filter((n) => n !== 'weapons');
  for (const h of g.party()) {
    if (h.classId === 'elf' || h.classId === 'dwarf') continue;
    if (!(await g.yesNo(`${h.name}: take a crude weapon?`, 'Cheap hand weapon (breaks on an Attack roll of 1).'))) continue;
    g.give(h, g.newItem('hand_weapon', { name: 'Crude blade', damage: 'slashing', data: { cheap: true } }));
  }
  void inventoryCount;
  void weaponInfo;
  void isAlive;
}
