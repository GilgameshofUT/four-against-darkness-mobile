# Four Against Darkness — mobile PWA

A guided, mobile-first digital adaptation of *Four Against Darkness: Expanded Edition* (Andrea Sfiligoi / Ganesha Games) for **personal use**.

- Svelte 5 + TypeScript + Vite, installable PWA (offline), tuned for Pixel 11 Pro XL portrait.
- Pure rules engine in `src/engine` (seeded RNG, no UI dependencies) with simulation tests.
- All 20 classes, traits, spells, foes (dungeon, caverns, fungal grottoes, Fiendish Foes), treasure, traps, events, quests, secrets, XP systems, guild roster.
- Pregenerated dungeon with fog of war; every die roll is a tap.
- Art generated with Vertex AI `gemini-nano-banana-2.1` (`scripts/art/`).

See `RULINGS.md` for interpretation decisions awaiting review.

## Develop
```
npm install
npm run dev        # http://localhost:5173 ; dev party: /?dev=warrior,cleric,rogue,wizard
npx vitest run     # engine tests incl. 60 random full adventures
node scripts/e2e.mjs warrior,dwarf,cleric,wizard 40   # headless UI playthrough with screenshots
node scripts/art/generate.mjs [--only monsters] [--filter id] [--force]
```
