import type { Game } from '../game';
import type { CombatState } from './types';
import type { EncounterOpts } from './encounter';
import { cs } from './util';
import { save } from '../checks';
import { isAlive, inventoryCount, maxLife } from '../hero';
import { addCondition } from '../effects';

/** End-of-encounter upkeep: lingering effects, condition cleanup. Rewards are handled by the caller. */
export async function endCombat(g: Game, o: EncounterOpts, outcome: NonNullable<CombatState['outcome']>) {
  const c = cs(g);
  const heroes = g.party();
  // Infection from rats
  for (const h of heroes) {
    if (c.flags[`wounded_${h.id}`] && h.classId !== 'kukla') {
      const paste = h.inventory.find((i) => i.base === 'disinfectant');
      if (g.d6() === 1) {
        if (paste && (await g.yesNo(`${h.name}'s wound festers`, 'Use disinfectant paste to prevent the infection?'))) h.inventory = h.inventory.filter((i) => i !== paste);
        else await g.damage(h, 1, 'infection', { noReduce: true });
      }
    }
    if (c.flags[`diseaseEnd_${h.id}`]) await g.damage(h, 1, 'disease', { noReduce: true });
    if (c.flags[`poisonEnd_${h.id}`]) {
      const r = await save(g, h, { type: 'poison', target: g.hcl() + 2, label: 'Save vs spider poison' });
      if (!r.success) await g.damage(h, 1, 'spider venom', { noReduce: true });
    }
  }
  // Locusts eat food
  if (c.foes.some((f) => f.defId === 'cave_locusts')) {
    let n = g.roll('d6');
    for (const h of g.party()) {
      const it = h.inventory.find((i) => i.base === 'food');
      if (!it || n <= 0) continue;
      const take = Math.min(n, it.qty ?? 1);
      it.qty = (it.qty ?? 1) - take;
      n -= take;
      if (!it.qty) h.inventory = h.inventory.filter((i) => i !== it);
    }
    g.log('bad', 'The locusts devour some of your food.');
  }
  // Screaming toads not slain within a single turn
  if (c.foes.some((f) => f.defId === 'screaming_toads') && c.turn > 1 && g.chance(2)) c.flags.callWanderers = true;
  // Berserk fatigue, bear form
  for (const h of g.partyAll()) {
    if (c.flags[`berserk_${h.id}`] && isAlive(h)) addCondition(h, { id: 'berserk_tired', label: 'Exhausted (berserk)', tilesLeft: 6 });
    const bear = h.conditions.find((k) => k.id === 'bear_form');
    if (bear) {
      const taken = Math.floor((bear.tilesLeft ?? 0) / 2);
      h.conditions = h.conditions.filter((k) => k !== bear);
      if (taken && isAlive(h)) await g.damage(h, taken, 'bear form wounds', { noReduce: true });
      g.log('info', `${h.name} returns to normal form.`);
    }
    h.conditions = h.conditions.filter((k) => k.until !== 'combat');
    if (h.conditions.some((k) => k.id === 'berserker_mushroom')) {
      h.conditions = h.conditions.filter((k) => k.id !== 'berserker_mushroom');
      if (isAlive(h)) await g.damage(h, 1, "berserker's mushroom", { noReduce: true });
    }
    h.used.combat = {};
    // Teleported (ring) heroes rejoin
    if (c.flags[`teleported_${h.id}`]) g.log('info', `${h.name} rejoins the party.`);
    if (c.flags[`escaped_${h.id}`] && g.s.dungeon) {
      h.conditions.push({ id: 'at_entrance', label: 'Waiting at the entrance' });
    }
  }
  // Green slime / mummy rising after combat handled in turn end
  if (o.wandering) for (const f of c.foes) f.treasure.none = true;
  void outcome;
  void inventoryCount;
  void maxLife;
}
