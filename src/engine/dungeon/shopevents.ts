import type { Game } from '../game';
import { SHOP_LIST, ITEM_BASES } from '../../data/items';
import { canUseItem, weaponInfo } from '../hero';
import { equipItem } from '../inventory';

/** Traveling merchant (fungal event): equipment at a markup; buys gems & mushrooms. */
export async function merchant(g: Game, markup = 1.2) {
  await g.say('A merchant!', `Equipment at ${Math.round((markup - 1) * 100)}% markup. Gems and rare mushrooms bought at full value.`, 'monsters/merchant');
  // Sell valuables
  for (const h of g.party()) for (const it of h.inventory.filter((i) => i.base === 'gem' || i.base === 'jewelry' || i.base === 'mushroom')) {
    if (!it.value) continue;
    if (await g.yesNo(`Sell ${it.name}?`, `${it.value} gp`)) {
      h.inventory = h.inventory.filter((i) => i !== it);
      g.s.partyGold += it.value;
    }
  }
  for (;;) {
    const opts = SHOP_LIST.map((b) => ({ value: b.id, label: `${b.name} — ${Math.ceil(b.price! * markup)} gp`, desc: b.desc, disabled: g.s.partyGold >= Math.ceil(b.price! * markup) ? false : 'Too expensive', icon: `items/${b.icon}` }));
    const id = await g.choose(`Buy (${g.s.partyGold} gp)`, [...opts, { value: '', label: 'Done', desc: '', disabled: false, icon: '' }], { layout: 'list' });
    if (!id) return;
    const b = ITEM_BASES[id];
    g.spendGold(Math.ceil(b.price! * markup));
    await g.distribute(g.newItem(id, b.weapon?.chooseDamage ? { damage: 'slashing' } : {}));
  }
}

/** Armory feature: each hero may take a weapon allowed to their class. */
export async function armoryPick(g: Game) {
  const choices = ['light_weapon', 'hand_weapon', 'two_handed', 'bow', 'sling', 'crossbow', 'shield'];
  for (const h of g.party()) {
    const opts = choices.map((c) => {
      const it = g.newItem(c, ITEM_BASES[c].weapon?.chooseDamage ? { damage: 'slashing' } : {});
      return { value: c, label: ITEM_BASES[c].name, disabled: canUseItem(h, it) ?? false };
    });
    const pick = await g.choose(`${h.name}: take something from the armory?`, [...opts, { value: '', label: 'Nothing', disabled: false }], { who: h.id });
    if (!pick) continue;
    let dmg: 'slashing' | 'crushing' | undefined;
    if (ITEM_BASES[pick].weapon?.chooseDamage) dmg = await g.choose('Slashing or crushing?', [{ value: 'slashing' as const, label: 'Slashing (blade)' }, { value: 'crushing' as const, label: 'Crushing (blunt)' }]);
    const it = g.newItem(pick, dmg ? { damage: dmg, name: `${ITEM_BASES[pick].name} (${dmg})` } : {});
    g.give(h, it);
    if (await g.yesNo(`Equip ${it.name}?`, '')) equipItem(g, h, it);
    void weaponInfo;
  }
}
