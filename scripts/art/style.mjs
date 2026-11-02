// Shared art direction. Inspired by the Dragonbane (Free League) look: hand-inked lines,
// warm watercolor washes, grounded storybook fantasy with a touch of whimsy.
export const STYLE = [
  'Hand-painted fantasy storybook illustration in the style of classic Scandinavian tabletop RPG art:',
  'fine confident ink linework with soft transparent watercolor and gouache washes,',
  'muted earthy palette of parchment cream, warm ochre, moss and verdigris green, deep teal, oxblood red and aged brass,',
  'subtle paper texture, gentle natural lighting, grounded proportions, characterful faces, a hint of whimsy.',
  'No text, no letters, no watermark, no signature, no frame, no border.',
].join(' ');

export const PORTRAIT = (subject) =>
  `${STYLE} Character portrait, head and shoulders to mid-torso, three-quarter view, facing slightly left, ` +
  `standing in a dim stone dungeon archway softly out of focus behind them. Subject: ${subject}`;

export const MONSTER = (subject) =>
  `${STYLE} Full-body creature illustration, dramatic but readable pose, centered with breathing room around it, ` +
  `on a softly vignetted plain warm parchment background (no scenery). Subject: ${subject}`;

export const ITEM = (subject) =>
  `${STYLE} A single game inventory icon object, centered, clean silhouette, slightly top-down three-quarter view, ` +
  `isolated on a flat plain warm parchment background, no shadow clutter. Object: ${subject}`;

export const TEXTURE = (subject) =>
  `${STYLE} Seamless tileable top-down texture, flat orthographic view straight down, even lighting, ` +
  `no perspective, no objects, no vignette, edges must tile seamlessly. Texture: ${subject}`;

export const SCENE = (subject) =>
  `${STYLE} Wide atmospheric environment painting, no characters in the foreground. Scene: ${subject}`;
