import type { Game } from '../game';
import type { Hero, SpellList } from '../types';
import { SPELLS, WIZARD_BASIC, DRUID_SPELLS, ILLUSIONIST_SPELLS } from '../../data/spells';

export function spellSlots(h: Hero): number {
  const L = h.level;
  switch (h.classId) {
    case 'wizard': return L + 2 + (h.traits.includes('arcane_memory') ? 1 : 0) + (h.choices.power_increase ? 1 : 0);
    case 'elf': return L;
    case 'illusionist': return L + 3;
    case 'druid': return L + 2;
    case 'gnome': return L;
    default: return 0;
  }
}

export function spellList(h: Hero): SpellList | undefined {
  if (h.classId === 'wizard' || h.classId === 'elf') return 'wizard';
  if (h.classId === 'druid') return 'druid';
  if (h.classId === 'illusionist' || h.classId === 'gnome') return 'illusionist';
}

export function knownSpells(h: Hero): string[] {
  if (h.classId === 'wizard') return [...new Set([...WIZARD_BASIC, ...h.spellbook])].filter((s) => !h.burnedPages.includes(s));
  if (h.classId === 'elf') return [...new Set([...WIZARD_BASIC.filter((s) => s !== 'blessing'), ...h.spellbook])];
  if (h.classId === 'druid') return DRUID_SPELLS;
  if (h.classId === 'illusionist') return [...ILLUSIONIST_SPELLS, ...h.spellbook];
  if (h.classId === 'gnome') return h.choices.gnome_spell ? [h.choices.gnome_spell] : ILLUSIONIST_SPELLS;
  return [];
}

/** Fill N slots (or all) interactively. Multiple copies allowed. */
export async function chooseSpellsFor(g: Game, h: Hero, n?: number) {
  const total = n ?? spellSlots(h);
  if (!n) h.spells = h.spells.filter((s) => s.temp);
  const list = spellList(h);
  if (!list) return;
  if (h.classId === 'gnome' && !h.choices.gnome_spell) {
    h.choices.gnome_spell = await g.choose(`${h.name}: the one illusion your contraption can study`, ILLUSIONIST_SPELLS.map((id) => ({ value: id, label: SPELLS[id].name, desc: SPELLS[id].desc })), { who: h.id, layout: 'list' });
  }
  const known = knownSpells(h);
  for (let i = 0; i < total; i++) {
    const id = await g.choose(`${h.name}: prepare spell ${i + 1}/${total}`, known.map((s) => ({ value: s, label: SPELLS[s].name, desc: SPELLS[s].desc + (SPELLS[s].outdoorsOnly ? ' (Outdoors only — no use in dungeons.)' : '') })), { who: h.id, layout: 'list', text: h.spells.filter((s) => !s.temp).map((s) => SPELLS[s.id].name).join(', ') || undefined });
    h.spells.push({ id, list: SPELLS[id].list, used: false });
  }
}
