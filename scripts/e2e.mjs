// Headless UI driver: plays through a dev party, auto-answering prompts, capturing screenshots.
// Usage: node scripts/e2e.mjs [classes] [steps] [fight]
import { chromium } from 'playwright';
import fs from 'node:fs';

const classes = process.argv[2] ?? 'warrior,dwarf,cleric,wizard';
const steps = Number(process.argv[3] ?? 60);
const fight = process.argv[4] ?? '';
const OUT = '/private/var/folders/l9/2vgfyqls615717k9tm4xcxr40000gp/T/opencode/e2e';
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) fs.unlinkSync(`${OUT}/${f}`);

let browser;
for (const opts of [{ channel: 'chromium' }, {}, { executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` }]) {
  try {
    browser = await chromium.launch(opts);
    break;
  } catch (e) {
    console.log('launch failed', String(e).slice(0, 120));
  }
}
const ctx = await browser.newContext({ viewport: { width: 448, height: 997 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://localhost:5173/?dev=${classes}&seed=11${fight ? `&fight=${fight}` : ''}`);
await page.waitForTimeout(800);

let shot = 0;
const snap = async (label) => page.screenshot({ path: `${OUT}/${String(++shot).padStart(3, '0')}-${label}.jpg`, quality: 60, type: 'jpeg' });

// Enter dungeon via Embark if not auto
if (!fight) {
  await page.click('nav.tabs button:nth-of-type(2)');
  await page.waitForTimeout(200);
  const picks = await page.$$('.party-pick');
  for (const p of picks.slice(0, 4)) await p.click();
  await page.click('text=Descend into darkness');
  await page.waitForTimeout(300);
}

const rng = (() => { let s = 99; return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31); })();
let lastPrompt = '';
let samePrompt = 0;
for (let i = 0; i < steps * 12; i++) {
  await page.waitForTimeout(60);
  // Dice tray
  const roll = await page.$('.tray .btn.primary:not([disabled])');
  if (roll) {
    const txt = await roll.textContent();
    await roll.click({ timeout: 2000 }).catch(() => {});
    if (txt?.includes('Roll')) {
      await page.waitForTimeout(1400);
      if (shot < 400 && i % 5 === 0) await snap('dice');
    }
    continue;
  }
  if (await page.$('.tray')) continue;
  const story = await page.$('.bg .card .btn.primary');
  if (story) {
    if (shot < 400) await snap('story');
    await story.click({ timeout: 2000 }).catch(() => {});
    continue;
  }
  const sheet = await page.$('.sheet-bg');
  if (sheet) {
    const title = (await page.textContent('.sheet h3')) ?? '';
    if (title === lastPrompt) samePrompt++;
    else (samePrompt = 0), (lastPrompt = title);
    if (shot < 400 && samePrompt === 0) await snap('choice');
    let opts = await page.$$('.sheet .hero:not(.dis), .sheet .opt:not(.dis)');
    if (!opts.length) {
      console.log('STUCK prompt with no options:', title);
      break;
    }
    // Prefer attacking options in action menus, avoid "Back" loops
    const labels = await Promise.all(opts.map((o) => o.textContent()));
    let idx = Math.floor(rng() * opts.length);
    const pref = labels.findIndex((l) => /Attack|Cast Sleep|Cast Fireball|Prayer: Healing|Rage/.test(l ?? ''));
    if (title.includes('action') && pref >= 0 && rng() < 0.8) idx = pref;
    if (/Round|Ranged attacks/.test(title)) {
      const heroBtns = await page.$$('.sheet .hero:not(.dis)');
      if (heroBtns.length) {
        await heroBtns[0].click();
        continue;
      }
    }
    if (samePrompt > 8) idx = labels.findIndex((l) => /Back|Done|End turn|Continue|Leave|Never mind|Accept|No$/.test(l ?? '')) >= 0 ? labels.findIndex((l) => /Back|Done|End turn|Continue|Leave|Never mind|Accept|No$/.test(l ?? '')) : idx;
    await opts[Math.max(0, idx)].click({ timeout: 2000 }).catch(() => {});
    continue;
  }
  // Idle in dungeon: move
  const exits = await page.$$('.exit-btn:not([disabled])');
  if (exits.length) {
    if (shot < 400) await snap('map');
    const newOnes = await page.$$('.exit-btn.new:not([disabled])');
    const pool = newOnes.length ? newOnes : exits.filter(async (e) => !(await e.getAttribute('class'))?.includes('out'));
    const searchBtn = await page.$('.acts .btn.primary:not([disabled])');
    if (searchBtn && rng() < 0.4) {
      await searchBtn.click();
      continue;
    }
    await pool[Math.floor(rng() * pool.length)].click({ timeout: 2000 }).catch(() => {});
    continue;
  }
  const deb = await page.$('text=Return to the Guild Hall');
  if (deb) {
    await snap('debrief');
    console.log('Adventure ended.');
    break;
  }
}
await snap('final');
console.log('errors:', errors.slice(0, 10));
console.log('shots:', shot);
await browser.close();
