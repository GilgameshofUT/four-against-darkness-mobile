import type { Game } from '../game';
import type { Foe } from '../types';
import { foeAlive, isMinor } from '../foe';
import { cs } from './util';

/** Morale: 1d6 + mod; 1-3 flee. Minor foes test once when reduced below half. */
export async function checkMorale(g: Game, f: Foe, o: { forced?: boolean; mod?: number; reason?: string; autoFail?: boolean }): Promise<boolean> {
  if (!foeAlive(f)) return false;
  if (f.noMorale || f.finalBoss) return false;
  if (cs(g).trial) return false;
  if (f.state.fightToDeath) return false;
  if (!o.forced && f.moraleChecked) return false;
  if (!o.forced) f.moraleChecked = true;
  // Terrifying secret: auto-fail
  let auto = o.autoFail;
  if (!auto) {
    const secretHolder = g.party().find((h) => h.secrets.filter((s) => s === 'terrifying_secret').length > (h.used.adventure.terrifying_used ?? 0));
    if (secretHolder) {
      const use = await g.yesNo(`${f.name} must test Morale`, `${secretHolder.name} could utter the Terrifying Secret — they automatically fail. (One use.)`, 'Utter it', 'Let them roll');
      if (use) {
        g.spend(secretHolder, 'adventure', 'terrifying_used');
        secretHolder.secrets.splice(secretHolder.secrets.indexOf('terrifying_secret'), 1);
        auto = true;
      }
    }
  }
  let flee: boolean;
  if (auto) {
    flee = true;
  } else {
    const mods = [{ label: 'Morale', value: f.morale }, ...(o.mod ? [{ label: o.reason ?? 'modifier', value: o.mod }] : [])].filter((m) => m.value);
    const total = await g.tableRoll(`Morale: ${f.name}${o.reason ? ' (' + o.reason + ')' : ''}`, 'd6', { mods, context: '1–3: they flee' });
    flee = total <= 3;
  }
  if (flee) {
    f.fled = true;
    g.log('good', `${isMinor(f) ? `The ${f.count} remaining ${f.name}` : f.name} flee${isMinor(f) && f.count === 1 ? 's' : ''}!`);
    // Webbed by spiderweb + failed morale = surrender (captured)
    if (f.state.webbed) {
      f.subdued = (f.subdued ?? 0) + f.count;
      g.log('good', 'Entangled in webs, they surrender instead!');
    }
    if (f.state.held) {
      f.subdued = (f.subdued ?? 0) + (isMinor(f) ? f.count : 1);
      g.log('good', 'Bound by phantasmal chains, it surrenders!');
    }
    await offerParting(g, f);
  } else g.log('combat', `${f.name} stand their ground.`);
  return flee;
}

/** When foes flee, all PCs may perform one last attack at +1. */
async function offerParting(g: Game, f: Foe) {
  if (!g.party().length) return;
  const want = await g.yesNo(`${f.name} flee!`, 'Each hero may make one last Attack at +1 (in a corridor, only the front two or ranged/spells). Only needed if you want their bodies.', 'Strike as they flee', 'Let them go');
  if (!want) return;
  const { meleeEligible } = await import('./util');
  const { attackFoe } = await import('./resolve');
  const { mainHand, weaponInfo } = await import('../hero');
  f.fled = false;
  cs(g).flags.fleeing_attack = true;
  for (const h of g.party()) {
    if (!foeAlive(f)) break;
    const w = mainHand(h);
    const ranged = !!weaponInfo(w)?.ranged;
    if (!ranged && !meleeEligible(g, h)) continue;
    await attackFoe(g, h, f, { weapon: w, ranged, label: `Parting blow on ${f.name}` });
  }
  cs(g).flags.fleeing_attack = false;
  if (foeAlive(f)) f.fled = true;
}
