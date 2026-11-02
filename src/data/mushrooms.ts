export interface MushroomDef {
  id: string;
  name: string;
  resale: number;
  desc: string;
}

export const MUSHROOMS: MushroomDef[] = [
  { id: 'slumber_amanita', name: 'Slumber Amanita', resale: 10, desc: '+Tier when casting Sleep (also from scrolls or wands).' },
  { id: 'puffball', name: 'Puffball Smokebomb', resale: 5, desc: 'Drop as a free action: the party flees without being attacked (not vs mushroom or artificial Foes).' },
  { id: 'brown_cap', name: 'Brown Cap Delight', resale: 15, desc: 'Counts as 1 Food ration, or 3 rations for a bribe.' },
  { id: 'phoenix', name: 'Phoenix Mushroom', resale: 15, desc: '+1 Defense and Saves for 3 tiles, then lose 1 Life.' },
  { id: 'purple_truffle', name: 'Purple Truffle', resale: 0, desc: 'Extremely valuable — if real.' },
  { id: 'healer_chanterelle', name: "Healer's Chanterelle", resale: 0, desc: 'Eat to heal all damage. Loses its power at the end of the adventure.' },
];
