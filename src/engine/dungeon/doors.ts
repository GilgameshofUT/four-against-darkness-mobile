import type { Game } from '../game';
import type { Connector, DoorState, Tile } from '../types';
import { save } from '../checks';
import { inventoryCount } from '../hero';
import { CLASSES } from '../../data/classes';

/** Door Table (2d6), rolled once when first opening a door. Returns true if the party gets through. */
export async function openDoor(g: Game, from: Tile, conn: Connector): Promise<boolean> {
  const d = g.s.dungeon!;
  const H = g.hcl();
  if (!conn.doorState) {
    const r = await g.tableRoll('Door', '2d6', { context: '2 magic seal · 3 iron · 4 illusion · 5–6 locked · 7–10 unlocked · 11 trapped · 12 lever' });
    let kind: DoorState['kind'] = r === 2 ? 'magic' : r === 3 ? 'iron' : r === 4 ? 'illusionary' : r <= 6 ? 'locked' : r <= 10 ? 'normal' : r === 11 ? 'trapped' : 'lever';
    const level = kind === 'magic' || kind === 'illusionary' ? H : kind === 'normal' || kind === 'lever' ? 0 : H + g.d6();
    conn.doorState = { kind, level, open: kind === 'normal', rolled: true };
    const back = conn.to ? d.tiles[conn.to].connectors.find((c) => c.id === conn.toConnector) : undefined;
    if (back) back.doorState = conn.doorState;
    if (kind === 'magic' || kind === 'iron') d.tiles[conn.to!].treasureMod = (d.tiles[conn.to!].treasureMod ?? 0) + 1;
  }
  const ds = conn.doorState;
  if (ds.open || ds.destroyed) return true;
  for (;;) {
    const opts: { value: string; label: string; desc?: string; disabled?: string | false }[] = [];
    const pickers = g.party().filter((h) => ['rogue', 'assassin', 'kukla', 'gnome'].includes(h.classId));
    const casters = g.party().filter((h) => CLASSES[h.classId].tags.includes('spellcaster'));
    const zappers = g.party().filter((h) => h.spells.some((s) => (s.id === 'lightning' || s.id === 'fireball') && !s.used));
    const gnome = g.party().find((h) => h.classId === 'gnome' && (h.resources.gadget ?? 0) > 0);
    const title = { locked: `Locked door (L${ds.level})`, iron: `Iron door (L${ds.level})`, magic: `Magically sealed door (L${ds.level})`, illusionary: 'An illusion hides this door', trapped: 'Trapped door!', lever: 'A lever-operated door', normal: 'Door' }[ds.kind];
    if (ds.kind === 'trapped') {
      const rogue = g.party().find((h) => h.classId === 'rogue');
      if (rogue) {
        const res = await save(g, rogue, { type: 'trap', target: ds.level, label: `Disarm the door trap (L${ds.level})` });
        if (!res.success) {
          const r2 = await save(g, rogue, { type: 'trap', target: ds.level, label: 'Avoid the trap' });
          if (!r2.success) await g.damage(rogue, 1, 'door trap');
        }
      } else {
        const { trap } = await import('./traps');
        await trap(g, 'dungeon');
      }
      ds.open = true;
      return g.party().length > 0;
    }
    if (ds.kind === 'locked' || ds.kind === 'iron') {
      if (pickers.length && !ds.destroyed) opts.push({ value: 'pick', label: 'Pick the lock', desc: 'Rogues add +L; kuklas +½L; good lockpicks +1. One try per hero.' });
    }
    if (ds.kind === 'locked') opts.push({ value: 'bash', label: 'Bash it down', desc: 'Warriors & barbarians +L. A roll of 1 attracts wandering monsters.' });
    if ((ds.kind === 'locked' || ds.kind === 'iron') && zappers.length) opts.push({ value: 'zap', label: 'Blast it with Lightning/Fireball', desc: 'Automatic; uses the spell.' });
    if (ds.kind === 'magic' && casters.length && !d.keywords.includes(`magic_tried_${conn.id}`)) opts.push({ value: 'dispel', label: 'Unseal it with magic', desc: 'One attempt. On a 1: feedback damage or wanderers.' });
    if (ds.kind === 'illusionary') {
      opts.push({ value: 'clues', label: 'Spend 3 Clues to see through it', disabled: g.s.clues >= 3 ? false : 'Not enough Clues' });
      for (const h of g.party().filter((x) => x.classId === 'illusionist' && !d.keywords.includes(`ill_${x.id}_${conn.id}`))) opts.push({ value: `ill:${h.id}`, label: `${h.name}: pierce the illusion` });
    }
    if (ds.kind === 'lever') {
      opts.push({ value: 'clue', label: 'Spend 1 Clue to work out the lever', disabled: g.s.clues >= 1 ? false : 'No Clues' });
      if (gnome) opts.push({ value: 'gadget', label: `${gnome.name}: 1 gadget point` });
    }
    if (gnome && (ds.kind === 'locked' || ds.kind === 'iron')) opts.push({ value: 'gadget_lock', label: `${gnome.name}: gadget lockpick`, desc: '1 point + extra points for +1 each.' });
    if (g.party().some((h) => h.inventory.some((i) => i.base === 'enchanted_paint'))) opts.push({ value: 'paint', label: 'Paint a new door with Enchanted Paint' });
    if (g.party().some((h) => h.spells.some((s) => s.id === 'warp_wood' && !s.used)) && ds.kind !== 'iron') opts.push({ value: 'warp', label: 'Warp Wood' });
    opts.push({ value: '', label: 'Leave it', desc: 'Choose another way.' });
    const pick = await g.choose(title, opts, { art: 'icons/door' });
    if (!pick) return false;
    if (pick === 'pick') {
      const h = await g.pickHero('Who picks the lock?', pickers.filter((p) => !d.keywords.includes(`pick_${p.id}_${conn.id}`)));
      if (!h) continue;
      d.keywords.push(`pick_${h.id}_${conn.id}`);
      const mods = [] as { label: string; value: number }[];
      if (h.classId === 'kukla') mods.push({ label: 'Prehensile hair', value: Math.floor(h.level / 2) });
      if (inventoryCount(h, 'good_lockpicks')) mods.push({ label: 'Good lockpicks', value: 1 });
      const res = await save(g, h, { type: 'lock', target: ds.level, label: `Pick the lock (L${ds.level})` }, mods);
      if (res.success) return opened(g, ds);
      g.log('info', `${h.name} cannot open the lock.`);
    } else if (pick === 'bash') {
      const h = await g.pickHero('Who bashes the door?', g.party());
      if (!h) continue;
      const mods = [] as { label: string; value: number }[];
      if (inventoryCount(h, 'crowbar')) mods.push({ label: 'Crowbar', value: 1 });
      const res = await save(g, h, { type: 'bash', target: ds.level, label: `Bash the door (L${ds.level})`, bonuses: { warrior: 'L', barbarian: 'L' } }, mods);
      if (res.natural === 1) {
        g.log('bad', 'The racket echoes through the dungeon!');
        const { wanderingMonsters } = await import('./wandering');
        await wanderingMonsters(g, {});
        if (!g.party().length) return false;
      }
      if (res.success) {
        ds.destroyed = true;
        return opened(g, ds);
      }
    } else if (pick === 'zap') {
      const h = zappers[0];
      const sp = h.spells.find((s) => (s.id === 'lightning' || s.id === 'fireball') && !s.used)!;
      sp.used = true;
      ds.destroyed = true;
      g.log('good', `${h.name} blasts the door apart!`);
      return opened(g, ds);
    } else if (pick === 'dispel') {
      d.keywords.push(`magic_tried_${conn.id}`);
      const h = (await g.pickHero('Who unseals it?', casters))!;
      const res = await g.heroRoll({ hero: h, kind: 'spell', label: 'Unseal the door', mods: [{ label: 'Casting', value: h.level }], target: ds.level });
      if (res.natural === 1) {
        const p = await g.choose('Magical feedback!', [{ value: 'dmg', label: `${h.name} takes 2 damage` }, { value: 'wm', label: 'Wandering monsters arrive' }]);
        if (p === 'dmg') await g.damage(h, 2, 'magic feedback', { noReduce: true });
        else {
          const { wanderingMonsters } = await import('./wandering');
          await wanderingMonsters(g, {});
        }
      }
      if (res.success) return opened(g, ds);
    } else if (pick === 'clues') {
      g.s.clues -= 3;
      return opened(g, ds);
    } else if (pick.startsWith('ill:')) {
      const h = g.hero(pick.slice(4));
      d.keywords.push(`ill_${h.id}_${conn.id}`);
      const res = await g.heroRoll({ hero: h, kind: 'spell', label: 'Pierce the illusion', mods: [{ label: 'Casting', value: h.level }], target: H });
      if (res.success) return opened(g, ds);
    } else if (pick === 'clue') {
      g.s.clues--;
      return opened(g, ds);
    } else if (pick === 'gadget') {
      gnome!.resources.gadget--;
      return opened(g, ds);
    } else if (pick === 'gadget_lock') {
      const max = gnome!.resources.gadget;
      const pts = await g.choose('Spend how many gadget points?', Array.from({ length: max }, (_, i) => ({ value: i + 1, label: `${i + 1} (+${i} bonus)` })));
      gnome!.resources.gadget -= pts;
      const res = await save(g, gnome!, { type: 'lock', target: ds.level, label: 'Gadget lockpick', bonuses: { gnome: 'L' } }, [{ label: 'Gadget points', value: pts - 1 }]);
      if (res.success) return opened(g, ds);
    } else if (pick === 'warp') {
      const h = g.party().find((x) => x.spells.some((s) => s.id === 'warp_wood' && !s.used))!;
      h.spells.find((s) => s.id === 'warp_wood' && !s.used)!.used = true;
      ds.destroyed = true;
      return opened(g, ds);
    } else if (pick === 'paint') {
      const h = g.party().find((x) => x.inventory.some((i) => i.base === 'enchanted_paint'))!;
      if (g.d6() === 1) h.inventory = h.inventory.filter((i) => i.base !== 'enchanted_paint'), g.log('bad', 'The paint runs out.');
      return opened(g, ds);
    }
  }
}

function opened(g: Game, ds: DoorState) {
  ds.open = true;
  g.log('good', 'The door opens.');
  return true;
}

export function lockable(t: Tile) {
  return t.connectors.filter((c) => c.door && c.to && !c.doorState?.destroyed);
}
