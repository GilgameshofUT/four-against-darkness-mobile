import type { Game } from '../game';
import type { Hero, Item } from '../types';
import type { Action } from './actions';
import { SPELLS } from '../../data/spells';
import { CLASSES } from '../../data/classes';
import { freeHand, tierOf } from '../hero';
import { castEffect } from './spelleffects';
import { cs, liveFoes } from './util';

export interface CastSource {
  kind: 'slot' | 'scroll' | 'wand' | 'staff' | 'trait' | 'burn' | 'book';
  bonus: number; // spellcasting bonus (+L, +1, etc.)
  item?: Item;
  slotIndex?: number;
}

/** Spellcasting bonus for a hero casting from memory. */
export function castBonus(h: Hero, spellId: string): number {
  const L = h.level;
  const T = tierOf(L);
  let b = L;
  if (h.classId === 'gnome') {
    const sp = SPELLS[spellId];
    b = h.choices.gnome_spell === spellId || /illusion|phantasm/i.test(sp?.name ?? '') ? L : 1;
  }
  if (h.traits.includes('specialist') && h.choices.specialist === spellId) b += T;
  if (h.traits.includes('shadow_adept') && spellId === 'shadow_strike') b += T;
  if (spellId === 'lightning' && h.milestonesDone.includes('thundermaster')) b += 1;
  if (spellId === 'sleep' && h.milestonesDone.includes('slumbermaster')) b += 1;
  return b;
}

export function scrollBonus(h: Hero, spellId: string): number {
  const cls = CLASSES[h.classId];
  const T = tierOf(h.level);
  let b: number;
  if (cls.scroll === 'L') b = h.level;
  else if (cls.scroll === 'half') b = Math.max(1, Math.floor(h.level / 2));
  else b = 1;
  if (h.classId === 'cleric' && spellId === 'blessing') b = h.level;
  if (h.traits.includes('sygilist')) b += T;
  return b;
}

export function canCast(g: Game, h: Hero): string | undefined {
  if (!freeHand(h) && h.classId !== 'cleric') return 'Needs a free hand';
  if (h.classId === 'elf') {
    const { armor, hasShieldInHand, base } = heroMods;
    const ab = base(armor(h));
    if (hasShieldInHand(h)) return 'Elves cannot cast with a shield';
    if (ab && ab.armorType === 'heavy' && armor(h)?.data?.elven !== true) return 'Elves cast only in light armor';
  }
  if (cs(g).flags[`bear_${h.id}`]) return 'In bear form';
  return;
}

import * as heroMods from '../hero';

export function spellActions(g: Game, h: Hero): Action[] {
  const acts: Action[] = [];
  const block = canCast(g, h);
  // Memorized spells (wizard, elf, illusionist, druid, gnome)
  const ready = h.spells.filter((s) => !s.used);
  const seen = new Set<string>();
  for (const s of ready) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const def = SPELLS[s.id];
    if (!def || def.inCombat === false) continue;
    const count = ready.filter((x) => x.id === s.id).length;
    acts.push({
      id: `cast_${s.id}`, label: `Cast ${def.name}${count > 1 ? ` (×${count})` : ''}`, group: 'magic', desc: def.desc, icon: 'icons/magic',
      disabled: block ?? (def.outdoorsOnly ? 'Outdoors only' : false),
      run: async () => castFrom(g, h, s.id, { kind: 'slot', bonus: castBonus(h, s.id) }),
    });
  }
  // Wizard spell burning (no slots left)
  if (h.classId === 'wizard' && !ready.length) {
    const known = ['blessing', 'escape', 'lightning', 'fireball', 'protection', 'sleep', ...h.spellbook].filter((x) => !h.burnedPages.includes(x));
    for (const id of new Set(known)) {
      const def = SPELLS[id];
      if (!def || def.inCombat === false) continue;
      acts.push({ id: `burn_${id}`, label: `Burn page: ${def.name}`, group: 'magic', desc: 'Cast from your spellbook; the page turns to ash.', disabled: block ?? false, run: async () => castFrom(g, h, id, { kind: 'burn', bonus: castBonus(h, id) }) });
    }
  }
  // Scrolls, prisms, bark
  if (h.classId !== 'barbarian' || h.traits.includes('__never')) {
    for (const it of h.inventory.filter((i) => ['scroll', 'prism', 'bark', 'scroll_blessing'].includes(i.base))) {
      const spellId = it.base === 'scroll_blessing' ? 'blessing' : it.spell?.id;
      if (!spellId) continue;
      const def = SPELLS[spellId];
      if (def.inCombat === false) continue;
      acts.push({ id: `scroll_${it.uid}`, label: `Read ${it.name}`, group: 'magic', desc: def.desc, icon: `items/${it.base === 'scroll_blessing' ? 'scroll' : it.base}`, disabled: h.classId === 'barbarian' ? 'Barbarians cannot read' : false, run: async () => castFrom(g, h, spellId, { kind: 'scroll', bonus: scrollBonus(h, spellId), item: it }) });
    }
    const book = h.inventory.find((i) => i.base === 'book_of_skalitos');
    if (book) for (const id of ((book.data?.pages as string[]) ?? [])) acts.push({ id: `book_${id}`, label: `Book of Skalitos: ${SPELLS[id].name}`, group: 'magic', run: async () => castFrom(g, h, id, { kind: 'book', bonus: scrollBonus(h, id), item: book }) });
  }
  // Wands & staves
  const wand = h.inventory.find((i) => i.base === 'wand_of_sleep' && (i.charges ?? 0) > 0);
  if (wand && ['wizard', 'illusionist', 'elf'].includes(h.classId)) acts.push({ id: 'wand_sleep', label: `Wand of Sleep (${wand.charges})`, group: 'magic', run: async () => castFrom(g, h, 'sleep', { kind: 'wand', bonus: h.level, item: wand }) });
  const staff = h.inventory.find((i) => i.base === 'fireball_staff' && (i.charges ?? 0) > 0);
  if (staff && h.classId === 'wizard') acts.push({ id: 'staff_fire', label: `Fireball Staff (${staff.charges})`, group: 'magic', run: async () => castFrom(g, h, 'fireball', { kind: 'staff', bonus: h.level, item: staff }) });
  // Gnome: Illusionist's Trick trait (any illusionist spell, once)
  if (h.traits.includes('illusionists_trick') && !g.isSpent(h, 'adventure', 'illusionists_trick'))
    acts.push({ id: 'ill_trick', label: "Illusionist's Trick", group: 'magic', desc: 'Cast any illusionist spell without a slot.', run: async () => {
      const id = await g.choose('Which illusion?', Object.values(SPELLS).filter((s) => s.list === 'illusionist' && s.inCombat !== false).map((s) => ({ value: s.id, label: s.name, desc: s.desc })).concat([{ value: '', label: 'Back', desc: '' }]));
      if (!id) return false;
      g.spend(h, 'adventure', 'illusionists_trick');
      return castFrom(g, h, id, { kind: 'trait', bonus: h.level });
    } });
  return acts;
}

/** Spend the source, run MR, then the spell effect. */
export async function castFrom(g: Game, h: Hero, spellId: string, src: CastSource): Promise<boolean> {
  const c = g.s.combat;
  let extra = 0;
  const wop = h.inventory.find((i) => i.base === 'wand_of_power' && (i.charges ?? 0) > 0);
  const def = SPELLS[spellId];
  if (wop && h.classId === 'wizard' && def.roll) {
    const n = await g.choose(`Wand of Power (${wop.charges} charges)`, [0, 1, 2, 3].filter((k) => k <= (wop.charges ?? 0)).map((k) => ({ value: k, label: k ? `Spend ${k} (+${k})` : 'None' })));
    wop.charges = (wop.charges ?? 0) - n;
    extra += n;
  }
  if (h.inventory.some((i) => i.base === 'mushroom' && i.data?.kind === 'slumber_amanita') && spellId === 'sleep') {
    if (await g.yesNo('Use Slumber Amanita?', `+${tierOf(h.level)} to this Sleep spell.`)) {
      const m = h.inventory.find((i) => i.base === 'mushroom' && i.data?.kind === 'slumber_amanita')!;
      h.inventory = h.inventory.filter((i) => i !== m);
      extra += tierOf(h.level);
    }
  }
  if (h.companion?.id === 'owl' && h.companion.life > 0 && def.roll) extra += 1;
  const ok = await castEffect(g, h, spellId, src.bonus + extra, src.kind);
  if (ok === false) return false;
  // Spend source after a confirmed cast
  if (src.kind === 'slot') {
    const free = (h.traits.includes('spellwoven') && !g.isSpent(h, 'adventure', 'spellwoven')) || (h.traits.includes('spell_efficiency') && !g.isSpent(h, 'adventure', 'spell_efficiency'));
    let keep = false;
    if (free) {
      keep = await g.yesNo(`${h.name}: keep the spell?`, 'Your trait lets you cast once per adventure without forgetting it.', 'Keep it', 'Spend it');
      if (keep) g.spend(h, 'adventure', h.traits.includes('spellwoven') ? 'spellwoven' : 'spell_efficiency');
    }
    if (!keep) {
      const s = h.spells.find((x) => x.id === spellId && !x.used);
      if (s) s.used = true;
    }
  } else if (src.kind === 'scroll' && src.item) h.inventory = h.inventory.filter((i) => i !== src.item);
  else if ((src.kind === 'wand' || src.kind === 'staff') && src.item) src.item.charges = (src.item.charges ?? 1) - 1;
  else if (src.kind === 'burn') h.burnedPages.push(spellId);
  else if (src.kind === 'book' && src.item) src.item.data = { ...src.item.data, pages: ((src.item.data?.pages as string[]) ?? []).filter((p) => p !== spellId) };
  // Manataur feeds on magic; Echo may double
  if (c) {
    for (const f of liveFoes(g)) if (f.defId === 'manataur') (f.life += 1), (f.maxLife += 1), g.log('bad', 'The Manataur grows stronger from the magic!');
    if (g.s.dungeon?.tiles[g.s.dungeon.currentTile]?.echo && g.d6() === 6) {
      g.log('good', 'The spell echoes through the cavern!');
      await castEffect(g, h, spellId, src.bonus + extra, 'trait');
    }
  }
  if (spellId === 'lightning') h.milestones.lightning_cast = (h.milestones.lightning_cast ?? 0) + 1;
  return true;
}
