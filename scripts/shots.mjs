// Screenshot key screens at several phone viewports.
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '/private/var/folders/l9/2vgfyqls615717k9tm4xcxr40000gp/T/opencode/shots';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` });
for (const [w, h] of [[412, 915], [480, 1068]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/?dev=warrior,dwarf,cleric,wizard&seed=5&fight=goblins');
  await page.waitForTimeout(1500);
  // answer spell prep prompts
  for (let i = 0; i < 6; i++) {
    const o = await page.$('.sheet .opt');
    if (o) await o.click();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${w}-combat.jpg`, type: 'jpeg', quality: 70 });
  for (let i = 0; i < 4; i++) {
    const b = await page.$('.bg .card .btn.primary, .tray .btn.primary, .sheet .opt');
    if (b) await b.click();
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: `${OUT}/${w}-combat2.jpg`, type: 'jpeg', quality: 70 });
  await ctx.close();
  const ctx2 = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true });
  const p2 = await ctx2.newPage();
  await p2.goto('http://localhost:5173/?dev=ranger,halfling,elf,paladin&seed=8');
  await p2.waitForTimeout(1200);
  await p2.screenshot({ path: `${OUT}/${w}-guild.jpg`, type: 'jpeg', quality: 70 });
  await p2.click('nav.tabs button:nth-of-type(2)');
  for (const pk of (await p2.$$('.party-pick')).slice(0, 4)) await pk.click();
  await p2.click('text=Descend into darkness');
  await p2.waitForTimeout(500);
  for (let i = 0; i < 3; i++) {
    const o = await p2.$('.sheet .opt');
    if (o) await o.click();
    await p2.waitForTimeout(150);
  }
  await p2.waitForTimeout(800);
  await p2.screenshot({ path: `${OUT}/${w}-map.jpg`, type: 'jpeg', quality: 70 });
  await ctx2.close();
}
await browser.close();
console.log(fs.readdirSync(OUT));
