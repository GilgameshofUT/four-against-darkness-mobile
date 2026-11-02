import type { Mod } from '../dice';
import type { Game } from '../game';
import type { Foe, Hero, Item } from '../types';
import { CLASSES } from '../../data/classes';
import { bonusValue, tierOf, weaponInfo } from '../hero';
import { fspecial, hasTag, isMinor, isUndead, foeAlive } from '../foe';
import { hasLight, hasCond } from '../effects';

export interface AttackCtx {
  weapon?: Item; // undefined = unarmed
  ranged: boolean;
  subdual?: boolean;
  thrown?: 'axe' | 'knife';
}

export function attackMods(g: Game, h: Hero, f: Foe, ctx: AttackCtx): Mod[] {
  const m: Mod[] = [];
  const cls = CLASSES[h.classId];
  const L = h.level;
  const T = tierOf(L);
  const w = weaponInfo(ctx.weapon);
  const c = g.s.combat;
  const hc = c?.heroes[h.id];
  const narrow = !!c?.narrow;

  // ---- class bonus ----
  let classB = bonusValue(ctx.ranged ? cls.attackRanged : cls.attackMelee, h);
  let classLabel = cls.name;
  if (h.classId === 'elf' && w?.cls === 'two' && !ctx.ranged) classB = 0;
  if (h.classId === 'cleric' && isUndead(f)) (classB = L), (classLabel = 'Cleric vs undead');
  if (h.classId === 'halfling' && w?.cls === 'sling') (classB = L), (classLabel = 'Halfling sling');
  if (h.classId === 'light_gladiator') classB = w?.cls === 'light' && !ctx.ranged ? Math.floor(L / 2) : 0;
  if (h.classId === 'mushroom_monk') {
    const monkWeapon = !ctx.weapon || ['nunchaku', 'bo_staff', 'throwing_stars'].includes(ctx.weapon.base) || ctx.weapon.data?.kind === 'sai';
    classB = monkWeapon ? L : Math.floor(L / 2);
  }
  if (h.classId === 'ranger' && hc && c?.flags[`dual_${h.id}`]) (classB = Math.floor(L / 2)), (classLabel = 'Ranger (two weapons)');
  if (h.classId === 'dwarf' && ctx.thrown === 'axe') classB = L;
  if (h.classId === 'rogue') {
    const allies = g.party().length + (c?.allies.length ?? 0);
    const foeCount = c ? c.foes.filter(foeAlive).reduce((a, x) => a + (isMinor(x) ? x.count : 1), 0) : 99;
    const okTarget = isMinor(f) || h.traits.includes('backstabber');
    if (okTarget && allies > foeCount) (classB = L), (classLabel = 'Rogue vs outnumbered');
  }
  if (h.classId === 'kukla' && w?.cls === 'light' && w.damage === 'slashing') m.push({ label: 'Kukla blade', value: 1 });
  if (h.classId === 'bulwark' && ctx.ranged) classB = T;
  m.push({ label: classLabel, value: classB });

  // ---- weapon ----
  if (!ctx.weapon && !hc?.illusorySword) {
    let un = -2;
    if (h.classId === 'kukla') un = -1;
    if (h.classId === 'mushroom_monk') un = L >= 5 ? 0 : -1;
    if (c?.flags[`flipkick_${h.id}`]) un = 0;
    if (c?.flags[`doublekick_${h.id}`]) un = -1;
    m.push({ label: 'Unarmed', value: un });
  } else if (w) {
    let wm = w.mod;
    if (w.cls === 'light' && narrow) wm = 0;
    if (w.cls === 'light' && h.classId === 'kukla' && w.damage === 'slashing') wm = -1; // +1 above cancels
    if (w.cls === 'two' && narrow) wm = -1;
    if (h.traits.includes('scrapper') && w.cls === 'light' && h.choices.scrapper_weapon === w.damage) wm = 0;
    if (ctx.weapon?.base === 'stake' && hasTag(f, 'vampire')) wm = 0;
    if (ctx.weapon?.base === 'torch_weapon' && (fspecial(f, 'flammable') || f.state.flammable)) wm = 2;
    if (ctx.thrown === 'knife' && h.classId === 'acrobat') wm = 0;
    if (wm) m.push({ label: ctx.weapon!.name, value: wm });
    if (ctx.weapon?.magicAttack) m.push({ label: 'Magic weapon', value: ctx.weapon.magicAttack });
  }
  if (hc?.illusorySword) m.push({ label: 'Illusionary Sword', value: L });

  // ---- weapon vs foe ----
  const crush = fspecial(f, 'crushing_bonus');
  if (crush && w?.damage === 'crushing' && !ctx.ranged) m.push({ label: 'Crushing vs bones', value: crush.value });
  if (crush && !ctx.weapon && h.classId === 'mushroom_monk') m.push({ label: 'Crushing vs bones', value: crush.value });
  const crushPen = fspecial(f, 'crushing_penalty');
  if (crushPen && w?.damage === 'crushing') m.push({ label: 'Crushing vs troll hide', value: crushPen.value });
  const arrow = fspecial(f, 'arrow_penalty');
  if (arrow && ctx.ranged && (w?.cls === 'bow' || w?.cls === 'crossbow')) m.push({ label: 'Arrows vs undead', value: arrow.value });
  if (hasTag(f, 'were') && ctx.weapon?.silvered) {
    const sb = fspecial(f, 'silver_bonus');
    m.push({ label: 'Silver', value: sb ? (sb.value === 'tier' ? T : sb.value) : 1 });
  }
  if (hasTag(f, 'elemental') && ctx.weapon?.gilded) m.push({ label: 'Gilded', value: 2 });
  if (ctx.weapon?.envenomed && !f.tags.some((t) => ['undead', 'demon', 'slime', 'artificial', 'fungus', 'elemental'].includes(t))) m.push({ label: 'Poison', value: 1 });

  // ---- racial / class foe bonuses ----
  if (h.classId === 'dwarf' && hasTag(f, 'goblin')) m.push({ label: 'Dwarf vs goblins', value: 1 });
  if (h.classId === 'elf' && hasTag(f, 'orc')) m.push({ label: 'Elf vs orcs', value: 1 });
  if (fspecial(f, 'druid_bonus') && h.classId === 'druid') m.push({ label: 'Druid vs spore phantom', value: L });
  if (f.defId === 'icy_shadows' && g.s.dungeon?.lanternBearer === h.id) m.push({ label: 'Light vs shadows', value: 1 });

  // ---- traits ----
  const t = h.traits;
  if (t.includes('beast_slayer') && f.category === 'weird') m.push({ label: 'Beast Slayer', value: 1 });
  if (t.includes('axe_mastery') && ctx.weapon?.data?.axe && !ctx.ranged) m.push({ label: 'Axe Mastery', value: 1 });
  if (t.includes('deadeye') && (w?.cls === 'bow' || w?.cls === 'crossbow')) m.push({ label: 'Deadeye', value: 1 });
  if (t.includes('good_shot') && ctx.ranged) m.push({ label: 'Good Shot', value: 1 });
  if (t.includes('sling_skill') && w?.cls === 'sling') m.push({ label: 'Sling Skill', value: T });
  if (t.includes('knife_fighter') && w?.cls === 'light' && w.damage === 'slashing') m.push({ label: 'Knife Fighter', value: T });
  if (t.includes('weapon_training') && w?.cls === 'hand' && w.damage === h.choices.weapon_training) m.push({ label: 'Weapon Training', value: T });
  if (c?.flags[`bladesong_${h.id}`] && (w?.cls === 'bow' || (w?.cls === 'hand' && w.damage === 'slashing'))) m.push({ label: 'Bladesong', value: 1 });
  if (h.classId === 'ranger' && h.swornEnemies.some((e) => hasTag(f, e) || f.defId.includes(e))) m.push({ label: 'Sworn Enemy (die ↑)', value: 0 });

  // ---- conditions ----
  if (hasCond(h, 'berserk_tired')) m.push({ label: 'Berserk fatigue', value: -1 });
  if (hasCond(h, 'bewitched')) m.push({ label: 'Bewitched', value: -2 });
  if (hasCond(h, 'poisoned_food')) m.push({ label: 'Food poisoning', value: -1 });
  if (hasCond(h, 'bear_trap')) m.push({ label: 'Bear trap wound', value: -1 });
  if (hasCond(h, 'coughing')) m.push({ label: 'Coughing', value: -1 });
  if (hasCond(h, 'claw_curse')) m.push({ label: 'Hag curse', value: -1 });
  if (hasCond(h, 'blinded')) m.push({ label: 'Blinded by spores', value: -1 });
  if (hasCond(h, 'tar_eyes')) m.push({ label: 'Tar in eyes', value: -1 });
  if (hasCond(h, 'trained_bats')) m.push({ label: 'Harried by bats', value: -1 });
  if (hasCond(h, 'shrine_bonus') && (isUndead(f) || hasTag(f, 'demon'))) m.push({ label: 'Blessed shrine', value: 1 });
  if (hasCond(h, 'berserker_mushroom') && !ctx.ranged) m.push({ label: "Berserker's Mushroom", value: 1 });
  if (hasCond(h, 'gadget_weapon') && !ctx.ranged) m.push({ label: 'Gadget weapon', value: L });

  // ---- combat state ----
  if (hc) for (const am of hc.attackMods) if (!am.foe || am.foe === f.uid) m.push({ label: am.label, value: am.value });
  if (hc?.counterBonus?.foe === f.uid) m.push({ label: 'Counter-strike', value: hc.counterBonus.value });
  if (c?.flags.chant_of_valor === c?.turn) m.push({ label: 'Chant of Valor', value: 1 });
  if (f.state.held) m.push({ label: 'Held target', value: 2 });
  if (f.state.knockedDown) m.push({ label: 'Foe on the ground', value: T });
  if (ctx.subdual && !c?.flags.subdual_spell) m.push({ label: 'Subdual', value: -1 });
  if (c?.flags.fleeing_attack) m.push({ label: 'Fleeing foe', value: 1 });
  if (f.state.weakness) m.push({ label: 'Known weakness', value: 2 });
  if (f.state.nemesis) m.push({ label: 'Your enemy', value: 1 });
  if (f.state.sleepingDragon && !c?.flags[`slept_${h.id}`]) m.push({ label: 'Sleeping foe', value: 2 });
  if (c?.flags.mounted && g.s.dungeon?.marchingOrder[0] === h.id) m.push({ label: 'Mounted', value: 1 });

  // ---- environment ----
  if (!hasLight(g) && h.classId !== 'kukla') m.push({ label: 'Darkness', value: -2 });
  const tile = g.s.dungeon?.tiles[g.s.dungeon.currentTile];
  if (ctx.ranged && tile?.cavernFeature === 'boulders') m.push({ label: 'Boulders', value: -1 });
  if (ctx.ranged && c?.foes.some((x) => foeAlive(x) && fspecial(x, 'spell_penalty')?.ranged)) m.push({ label: 'Myco-gnats', value: -1 });
  return m.filter((x) => x.value !== 0 || x.label.includes('die'));
}

/** Tier die shift for rangers (sworn enemy + survival), max 2 steps. */
export function rangerDieShift(h: Hero, f?: Foe): number {
  if (h.classId !== 'ranger' || !f) return 0;
  let s = 0;
  if (h.swornEnemies.some((e) => hasTag(f, e) || f.defId.includes(e))) s++;
  return Math.min(2, s);
}
