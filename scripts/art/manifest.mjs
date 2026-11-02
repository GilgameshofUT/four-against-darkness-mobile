import { PORTRAIT, MONSTER, ITEM, TEXTURE, SCENE, STYLE } from './style.mjs';
import { PORTRAITS } from './portraits.mjs';
import { MONSTERS } from './monsters.mjs';
import { ITEMS, ICONS } from './items.mjs';

const TEXTURES = {
  dungeon_floor: 'worn grey flagstone dungeon floor tiles with moss in the cracks and faint grime',
  dungeon_corridor: 'narrow cobblestone corridor floor, darker and older, scattered pebbles',
  dungeon_wall: 'rough-hewn dark stone block wall seen from above, heavy masonry',
  cavern_floor: 'uneven brown cavern rock floor with puddles and gravel',
  cavern_wall: 'jagged dark brown cavern rock seen from above',
  fungal_floor: 'damp dark soil floor covered in moss, tiny glowing mushrooms and mycelium threads',
  fungal_wall: 'dense wall of overlapping shelf fungi and giant mushroom stems seen from above',
  fog: 'dark swirling smoky fog of war, near-black teal-grey ink wash',
  parchment: 'aged warm parchment paper with subtle fibers and faint stains',
  parchment_dark: 'darker aged leather-toned parchment with stains',
  stone_ui: 'dark teal-green weathered stone surface for a game interface panel',
};

const SCENES = {
  title: 'a party of four adventurers seen from behind standing before a massive ancient dungeon entrance carved into a mountainside at dusk, torchlight, mysterious',
  guild_hall: 'a cozy adventurers guild hall interior with a roaring hearth, notice board of quests, weapons racks and long tables',
  town: 'a small fantasy market town square with a temple, an inn and a shop, warm afternoon light',
  dungeon_entrance: 'a dark stone stairway descending into a dungeon, a lantern on the top step',
  camp_rest: 'a cleared dungeon room with a small campfire and bedrolls, doors nailed shut',
  victory: 'a pile of treasure glittering in a dungeon chamber after a battle',
  defeat: 'a fallen adventurers helmet and broken sword on a dungeon floor, dim candle',
  combat_bg_dungeon: 'an empty dungeon chamber with pillars, braziers and flagstones, dramatic shadows',
  combat_bg_cavern: 'an empty vast underground cavern with stalactites and a glowing pool',
  combat_bg_fungal: 'an empty fungal grotto with giant glowing mushrooms and spore mist',
  combat_bg_corridor: 'a narrow empty dungeon corridor with torch sconces stretching away',
  temple: 'a candlelit temple with a priest at an altar',
  shop: 'a cluttered adventurers outfitter shop interior with ropes, lanterns, weapons and armor',
};

const FEATURES = {
  fountain: 'a small stone dungeon fountain with clear water',
  shrine: 'a glowing blessed shrine with candles',
  armory: 'a rack of weapons and armor in a dungeon armory',
  cursed_altar: 'a sinister altar glowing with malevolent red light',
  statue: 'a stone warrior statue on a plinth',
  puzzle_box: 'an intricate glowing puzzle box on a pedestal',
  stalactites: 'cave ceiling bristling with stalactites',
  stalagmites: 'a field of stalagmites rising from the cave floor',
  boulders: 'a cave room strewn with large boulders',
  echo: 'a vast echoing cave chamber with sound ripples',
  water_pool: 'a still glowing blue underground pool',
  secret_door: 'a hidden door opening in a stone wall',
  secret_passage: 'a secret passage revealing a tunnel to a different underground realm',
  hidden_treasure: 'a loose floor stone revealing hidden coins',
  trap_dart: 'darts shooting from holes in a wall',
  trap_gas: 'green poisonous gas filling a room',
  trap_trapdoor: 'a trapdoor opening in a stone floor',
  trap_beartrap: 'a rusty bear trap snapping shut',
  trap_spears: 'spears thrusting out of a dungeon wall',
  trap_stone: 'a giant stone block falling from the ceiling',
  rockslide: 'a cascade of rocks tumbling down a tunnel',
  rolling_boulder: 'a giant rolling boulder rumbling down a tunnel',
  swinging_log: 'a log bound with vines swinging from the ceiling',
  spore_trap: 'a puffball mushroom bursting with toxic spores',
  shrieking_mushroom: 'a small mushroom with a screaming face',
  slime_patch: 'a slippery slime patch on a fungal floor',
};

export function buildJobs() {
  const jobs = [];
  for (const [cls, list] of Object.entries(PORTRAITS)) {
    list.forEach((desc, i) =>
      jobs.push({ category: 'portraits', id: `${cls}_${i + 1}`, prompt: PORTRAIT(desc), aspect: '3:4', size: [600, 800] }),
    );
  }
  for (const [id, desc] of Object.entries(MONSTERS))
    jobs.push({ category: 'monsters', id, prompt: MONSTER(desc), aspect: '1:1', size: [768, 768] });
  for (const [id, desc] of Object.entries(ITEMS))
    jobs.push({ category: 'items', id, prompt: ITEM(desc), aspect: '1:1', size: [256, 256], quality: 85 });
  for (const [id, desc] of Object.entries(ICONS))
    jobs.push({ category: 'icons', id, prompt: ITEM(desc), aspect: '1:1', size: [192, 192], quality: 85 });
  for (const [id, desc] of Object.entries(TEXTURES))
    jobs.push({ category: 'textures', id, prompt: TEXTURE(desc), aspect: '1:1', size: [512, 512], quality: 80 });
  for (const [id, desc] of Object.entries(SCENES))
    jobs.push({ category: 'scenes', id, prompt: SCENE(desc), aspect: '9:16', size: [900, 1600], quality: 78 });
  for (const [id, desc] of Object.entries(FEATURES))
    jobs.push({ category: 'features', id, prompt: SCENE(`inside an underground dungeon or cave, torchlit stone interior, no sky, no outdoor scenery: ${desc}`), aspect: '16:9', size: [960, 540], quality: 80 });
  jobs.push({
    category: 'ui',
    id: 'frame_ornament',
    prompt: `${STYLE.replace('no frame, no border.', '')} An ornate verdigris-green and brass fantasy dragon-head ornamental divider banner, symmetrical, horizontal, isolated on flat parchment background.`,
    aspect: '16:9',
    size: [1200, 300],
  });
  return jobs;
}
