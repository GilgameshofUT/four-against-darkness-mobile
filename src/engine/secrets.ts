import type { Game } from './game';
import type { Hero } from './types';
import { CLASSES } from '../data/classes';
import { SPELLS } from '../data/spells';

export interface SecretDef {
  id: string;
  name: string;
  desc: string;
  when?: 'now' | 'later';
  allowed?: (h: Hero) => string | undefined;
}

export const SECRETS: SecretDef[] = [
  { id: 'weakness', name: 'Weakness of a Foe', desc: 'Next time you meet a Major Foe of your choice, everyone gets +2 to attack it for the whole combat.' },
  { id: 'deal', name: 'Deal with a Foe', desc: 'When you meet a Foe (not Vermin or the Final Boss), declare a deal: it lets you pass. No treasure.' },
  { id: 'hidden_treasure_loc', name: 'Location of a hidden treasure', desc: 'In any empty room, speak the password: a niche opens with 3d6×10 gp.' },
  { id: 'magic_item_loc', name: 'Location of a magic item', desc: 'In any room but the first, gain a magic item of your choice.' },
  { id: 'true_name', name: 'True name of a spiritual entity', desc: 'Call an angel (heal a hero fully) or a demon (4 damage / slay 6 Minor Foes) once.' },
  { id: 'new_spell', name: 'New spell', desc: 'A spellcaster learns a spell from any list and gains a temporary slot for it.', allowed: (h) => (CLASSES[h.classId].tags.includes('spellcaster') ? undefined : 'Spellcasters only') },
  { id: 'power_increase', name: 'Increase of magical or spiritual power', desc: 'One permanent extra use of a specific spell or Prayer. Once per hero.', allowed: (h) => (CLASSES[h.classId].tags.includes('spellcaster') || h.classId === 'cleric' ? (h.secrets.includes('power_increase') ? 'Already taken' : undefined) : 'Spellcasters or clerics only') },
  { id: 'scroll_loc', name: 'Location of a scroll', desc: 'Find a scroll, bark or prism with a spell of your choice.' },
  { id: 'potion_recipe', name: 'Recipe for a potion', desc: 'Defeat 2 Major Foes and pay 50 gp: buy healing potions for 50 gp before every adventure.' },
  { id: 'terrifying_secret', name: 'Terrifying secret', desc: 'Once: Foes testing Morale in your presence automatically fail.' },
  { id: 'big_money', name: 'Someone will pay big money for that', desc: 'Sell one jewel or gem carried out of the dungeon for 3× its value.' },
  { id: 'nemesis', name: 'Your enemy is in the dungeon', desc: 'Swap a Major Foe for a Chaos Lord and fight him at +1 to Attack.' },
  { id: 'prisoner', name: 'The Prisoner', desc: 'An important prisoner may be found in a room guarded by Minions or a Boss. Rescue them for a big reward.' },
  { id: 'dragonslayer', name: 'Bloodline of dragon-slayers', desc: 'Barbarian or dwarf only: +1 Attack and Defense vs dragons.', allowed: (h) => (['barbarian', 'dwarf'].includes(h.classId) ? undefined : 'Barbarian or dwarf only') },
  { id: 'secret_diet', name: 'Secret diet', desc: 'Spend 100 gp (halflings 50) before each adventure for +1 Life.', allowed: (h) => (h.classId === 'kukla' ? 'Unliving heroes cannot use it' : undefined) },
];

/** Spend 3 Clues to reveal a Secret. */
export async function revealSecret(g: Game) {
  if (g.s.clues < 3) return;
  const h = await g.pickHero('Who discovers the Secret?', g.party(), 'That hero gains 1 XP roll and chooses a Secret.');
  if (!h) return;
  const id = await g.choose('Choose a Secret', SECRETS.map((s) => ({ value: s.id, label: s.name, desc: s.desc, disabled: s.allowed?.(h) ?? false })), { layout: 'list', who: h.id });
  g.s.clues -= 3;
  h.secrets.push(id);
  g.log('good', `${h.name} uncovers a Secret: ${SECRETS.find((s) => s.id === id)!.name}.`);
  await applySecretNow(g, h, id);
  const { xpRoll } = await import('./xp');
  if (g.s.settings.xpSystem === 'classic') await xpRoll(g, h, 'Secret revealed');
}

async function applySecretNow(g: Game, h: Hero, id: string) {
  if (id === 'new_spell') {
    const list = Object.values(SPELLS).filter((s) => s.inCombat !== false || s.outOfCombat);
    const sp = await g.choose('Learn which spell?', list.map((s) => ({ value: s.id, label: `${s.name} (${s.list})`, desc: s.desc })), { layout: 'list' });
    h.spellbook.push(sp);
    h.spells.push({ id: sp, list: SPELLS[sp].list, used: false, temp: true });
  }
  if (id === 'power_increase') {
    const opts = h.classId === 'cleric' ? [{ value: 'healing', label: 'Healing prayer' }, { value: 'blessing', label: 'Blessing prayer' }] : Object.values(SPELLS).filter((s) => s.list === (h.classId === 'druid' ? 'druid' : h.classId === 'illusionist' || h.classId === 'gnome' ? 'illusionist' : 'wizard')).map((s) => ({ value: s.id, label: s.name }));
    const pick = await g.choose('Which spell or prayer?', opts);
    h.choices.power_increase = pick;
    if (h.classId === 'cleric') h.resources[pick] = (h.resources[pick] ?? 0) + 1;
    else h.spells.push({ id: pick, list: SPELLS[pick].list, used: false });
  }
  if (id === 'scroll_loc') {
    const list = Object.values(SPELLS);
    const sp = await g.choose('Which spell?', list.map((s) => ({ value: s.id, label: `${s.name} (${s.list})` })), { layout: 'list' });
    const def = SPELLS[sp];
    await g.distribute(g.newItem(def.list === 'wizard' ? 'scroll' : def.list === 'druid' ? 'bark' : 'prism', { name: `${def.list === 'wizard' ? 'Scroll' : def.list === 'druid' ? 'Bark' : 'Prism'} of ${def.name}`, spell: { list: def.list, id: sp } }));
  }
  if (id === 'potion_recipe') g.s.guild.potionRecipe = true;
  if (id === 'dragonslayer') h.traits.push('dragonslayer');
}
