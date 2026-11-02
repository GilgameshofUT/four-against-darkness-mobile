import type { Game } from '../game';
import { base } from '../hero';

/** Invisible gremlins steal d6+3 items in priority order. */
export async function gremlins(g: Game) {
  await g.say('Invisible Gremlins!', 'Giggles in the dark… things start disappearing from your packs!', 'monsters/invisible_gremlins');
  const d = g.s.dungeon!;
  const oint = g.party().find((h) => h.inventory.some((i) => i.base === 'miners_ointment'));
  if (oint && (await g.yesNo("Miners' Ointment?", 'Use it to avoid the gremlins?'))) {
    oint.inventory = oint.inventory.filter((i) => i.base !== 'miners_ointment');
    return;
  }
  if (g.party().some((h) => h.spells.some((s) => s.id === 'disbelief' && !s.used))) {
    const h = g.party().find((x) => x.spells.some((s) => s.id === 'disbelief' && !s.used))!;
    if (await g.yesNo('Cast Disbelief?', 'Reveal the gremlins and fight them instead.')) {
      h.spells.find((s) => s.id === 'disbelief' && !s.used)!.used = true;
      const { makeFoe } = await import('../foe');
      const f = makeFoe(g, 'azure_gremlins', { count: g.roll('d6+1') });
      f.name = 'Revealed Gremlins';
      f.level = 3;
      const { fightFoe } = await import('./fight');
      await fightFoe(g, 'azure_gremlins', { foes: [f], noBossCheck: true });
      return;
    }
  }
  let n = g.roll('d6+3');
  const order: ((b: string, kind?: string) => boolean)[] = [
    (_b, k) => k === 'magic',
    (b) => ['scroll', 'prism', 'bark', 'scroll_blessing'].includes(b),
    (b) => b === 'healing_potion',
    (_b, k) => k === 'weapon',
    (b) => b === 'gem' || b === 'jewelry',
  ];
  const stolen: string[] = [];
  for (const pred of order) {
    for (const h of g.party()) {
      for (const it of [...h.inventory]) {
        if (n <= 0) break;
        const b = base(it);
        if (it.repellant || (h.classId === 'kukla' && it.data?.compartment)) continue;
        if (!pred(it.base, b?.kind === 'magic' || b?.magic ? 'magic' : b?.kind)) continue;
        h.inventory = h.inventory.filter((x) => x !== it);
        for (const k of ['main', 'off', 'armor', 'neck'] as const) if (h.equip[k] === it.uid) h.equip[k] = undefined;
        stolen.push(`${h.name}'s ${it.name}`);
        n--;
      }
    }
  }
  while (n > 0 && g.s.partyGold > 0) {
    const take = Math.min(10, g.s.partyGold);
    g.s.partyGold -= take;
    stolen.push(`${take} gp`);
    n--;
  }
  const everything = g.party().every((h) => h.inventory.length === 0) && g.s.partyGold === 0;
  g.log('bad', stolen.length ? `Stolen: ${stolen.join(', ')}.` : 'They find nothing worth taking.');
  if (everything) {
    g.s.clues++;
    g.log('info', 'They left a cheeky thank-you note… which counts as a Clue.');
  }
  void d;
}
