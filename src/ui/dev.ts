import { ui } from './store.svelte';
import { newState } from '../engine/state';
import { buildHero } from '../engine/setup/create';
import { STARTING_KITS } from '../data/starting';
import { TRAITS } from '../data/traits';
import type { ClassId } from '../engine/types';

/** Dev helper: ?dev=warrior,cleric,rogue,wizard builds a guild with that party. */
export async function devBoot(): Promise<boolean> {
  const p = new URLSearchParams(location.search).get('dev');
  if (!p || !import.meta.env.DEV) return false;
  const classes = p.split(',') as ClassId[];
  const s = newState(Number(new URLSearchParams(location.search).get('seed') ?? Date.now() % 100000));
  s.mode = 'guild';
  for (const c of classes) {
    const { hero, gold } = buildHero(s.rng, { name: c[0].toUpperCase() + c.slice(1), classId: c, portrait: `${c}_1`, traits: [TRAITS[c][0].id], kit: STARTING_KITS[c][0].id, damage: {}, choices: { companion: 'warhound' }, swornEnemy: 'orc' });
    s.guild.roster.push(hero);
    s.guild.gold += gold;
  }
  const lan = { uid: 'lantern1', base: 'lantern', name: 'Lantern' };
  const bearer = s.guild.roster.find((h) => !h.equip.off) ?? s.guild.roster[s.guild.roster.length - 1];
  bearer.inventory.push(lan);
  bearer.equip.off = 'lantern1';
  for (const h of s.guild.roster) h.inventory.push({ uid: `b${h.id}`, base: 'bandage', name: 'Bandage', qty: 1 });
  ui.game.s = s;
  ui.screen = 'guild';
  ui.bump();
  await ui.save();
  const go = new URLSearchParams(location.search).get('fight');
  history.replaceState(null, '', location.pathname);
  if (go) {
    const { startAdventure } = await import('../engine/campaign');
    s.guild.roster.find((h) => h.classId === 'wizard') && (s.guild.roster.find((h) => h.classId === 'wizard')!.spells = [{ id: 'sleep', list: 'wizard', used: false }, { id: 'fireball', list: 'wizard', used: false }, { id: 'lightning', list: 'wizard', used: false }]);
    setTimeout(async () => {
      await ui.run(async (g) => {
        await startAdventure(g, s.guild.roster.map((h) => h.id));
      });
      ui.screen = 'dungeon';
      (window as unknown as { __fight: (id: string) => void }).__fight(go);
    }, 100);
  }
  return true;
}

/** Dev: window.__fight('goblins') starts an encounter in the current tile. */
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__fight = (id: string) =>
    ui.run(async (g) => {
      const { fightFoe } = await import('../engine/dungeon/fight');
      await fightFoe(g, id, {});
    });
  (window as unknown as Record<string, unknown>).__ui = ui;
}
