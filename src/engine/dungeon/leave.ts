import type { Game } from '../game';
import { isAlive } from '../hero';

/** Leaving through the entrance (or a safe secret exit) ends the adventure. */
export async function leaveDungeon(g: Game) {
  const d = g.s.dungeon!;
  const fallen = g.partyAll().filter((h) => h.status === 'dead' || h.status === 'petrified');
  const msg = d.finalBossSlain ? 'The Final Boss is slain. You emerge into daylight, victorious!' : 'You leave the dungeon before finishing the job.';
  const paladin = g.party().find((h) => h.classId === 'paladin');
  if (!d.finalBossSlain && paladin) {
    const ok = await g.yesNo(`${paladin.name} protests`, 'A paladin will not leave until the mission is complete (unless all survivors are below half Life and healing is gone). Leave anyway? The paladin stays behind.', 'Leave', 'Stay');
    if (!ok) return;
  }
  const leave = await g.yesNo('Leave the dungeon?', `${msg}${fallen.length ? ` You may carry out the bodies of ${fallen.map((h) => h.name).join(', ')}.` : ''}`, 'Leave', 'Stay');
  if (!leave) return;
  const { endAdventure } = await import('../campaign');
  await endAdventure(g, d.finalBossSlain ? 'victory' : 'retreat');
  void isAlive;
}
