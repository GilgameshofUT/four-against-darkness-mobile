import type { Game } from '../game';
import { rollFoe } from './wandering';
import { FOES } from '../../data/foes';
import { maxLife } from '../hero';
import { randomSpell } from './treasure';

const QUESTS = ['Bring me its head!', 'Bring me gold!', 'I want it alive!', 'Bring me that!', 'Let peace be your way!', 'Slay all the foes!'];

export async function startQuest(g: Game, giverTile?: string, lady = false) {
  const d = g.s.dungeon!;
  if (d.quest && !d.quest.complete) {
    g.log('info', 'You already have a Quest in progress.');
    return;
  }
  const r = await g.tableRoll('Quest', 'd6', { context: QUESTS.map((q, i) => `${i + 1} ${q}`).join(' · ') });
  const q = { id: r, label: QUESTS[r - 1], giverTile, progress: 0, complete: false, rewarded: false } as NonNullable<typeof d.quest>;
  const env = d.tiles[d.currentTile].env;
  if (r === 1 || r === 3) {
    let def = await rollFoe(g, env, 'boss', { fiendish: false });
    while (r === 3 && (def.tags.includes('undead') || def.tags.includes('artificial'))) def = await rollFoe(g, env, 'boss', { fiendish: false });
    q.target = def.id;
    q.label += ` (${def.name}${r === 3 ? ', subdued' : ''})`;
  }
  if (r === 2) {
    let amt = g.roll('d6') * 50;
    if (g.s.partyGold >= amt) amt *= 2;
    q.amount = amt;
    q.label += ` (${amt} gp${env === 'caverns' ? ' in gems' : env === 'fungal' ? ' in mushrooms' : ''})`;
  }
  if (r === 4) {
    const items = ['wand_of_sleep', 'ring_teleport', 'fools_gold', 'magic_weapon', 'healing_potion', 'fireball_staff'];
    q.target = items[g.d6() - 1];
    q.label += ` (${q.target.replace(/_/g, ' ')})`;
  }
  if (lady) q.label += ' — for the Lady in White';
  d.quest = q;
  await g.say('Quest accepted', `${q.label}. Complete it and return to the quest-giver for an Epic Reward.`, lady ? 'monsters/lady_in_white' : undefined);
  void FOES;
}

/** Update quest progress after events. */
export function questProgress(g: Game, ev: { kind: 'kill' | 'subdue' | 'nonviolent' | 'item'; foeId?: string; item?: string }) {
  const q = g.s.dungeon?.quest;
  if (!q || q.complete) return;
  if (q.id === 1 && ev.kind === 'kill' && ev.foeId === q.target) (q.progress = 1), g.log('good', 'You have its head! Return to the quest-giver.');
  if (q.id === 3 && ev.kind === 'subdue' && ev.foeId === q.target) (q.progress = 1), g.log('good', 'Captured alive! Return to the quest-giver.');
  if (q.id === 5 && ev.kind === 'nonviolent') {
    q.progress++;
    g.log('good', `Peaceful resolution (${q.progress}/3).`);
    if (q.progress >= 3) q.complete = true;
  }
  if (q.id === 4 && ev.kind === 'item' && ev.item === q.target) (q.progress = 1), g.log('good', 'You found the item for your quest!');
}

export function questCanTurnIn(g: Game): boolean {
  const d = g.s.dungeon;
  const q = d?.quest;
  if (!q || q.rewarded) return false;
  if (q.complete && (q.id === 5 || q.id === 6)) return true;
  if (q.giverTile && d.currentTile !== q.giverTile) return false;
  if (q.id === 2) return g.s.partyGold >= (q.amount ?? 0);
  return q.progress >= 1;
}

export async function turnInQuest(g: Game) {
  const d = g.s.dungeon!;
  const q = d.quest!;
  if (q.id === 2) g.s.partyGold -= q.amount ?? 0;
  q.complete = true;
  q.rewarded = true;
  await g.say('Quest complete!', `${q.label} — your reward awaits.`);
  await epicReward(g);
  // XP roll for completing (Lady in White grants 1 XP)
  const { grantXpRoll } = await import('../xp');
  await grantXpRoll(g, 'Quest completed');
}

export async function epicReward(g: Game) {
  const r = await g.tableRoll('Epic Reward', 'd6', { context: '1 Book of Skalitos · 2 Gold of Kerrak Dar · 3 Enchanted weapon · 4 Shield of Warning · 5 Arrow of Slaying · 6 Holy symbol' });
  switch (r) {
    case 1:
      return void (await g.distribute(g.newItem('book_of_skalitos', { data: { pages: ['blessing', 'escape', 'lightning', 'fireball', 'protection', 'sleep'] } })));
    case 2:
      g.s.dungeon!.keywords.push('kerrak_dar');
      return g.say('The Gold of Kerrak Dar', 'Next time you Search a tile, spend 1 Clue to find a chest with 500 gp.');
    case 3: {
      const all = g.party().flatMap((h) => h.inventory.filter((i) => i.base.includes('weapon') || i.base === 'two_handed' || i.base === 'bow').map((i) => ({ h, i })));
      if (!all.length) return;
      const uid = await g.choose('Enchant which weapon (this adventure)?', all.map(({ h, i }) => ({ value: i.uid, label: `${h.name}: ${i.name}` })));
      const it = all.find((x) => x.i.uid === uid)!.i;
      it.data = { ...(it.data ?? {}), enchanted: true };
      return;
    }
    case 4:
      return void (await g.distribute(g.newItem('shield_of_warning')));
    case 5: {
      const env = g.s.dungeon!.tiles[g.s.dungeon!.currentTile].env;
      const def = await rollFoe(g, env, g.d6() <= 3 ? 'weird' : 'boss', { fiendish: false });
      return void (await g.distribute(g.newItem('arrow_slaying', { name: `Arrow of ${def.name}-Slaying`, data: { target: def.id }, value: g.roll('3d6x15') })));
    }
    default:
      return void (await g.distribute(g.newItem('holy_symbol_healing')));
  }
  void maxLife;
  void randomSpell;
}
