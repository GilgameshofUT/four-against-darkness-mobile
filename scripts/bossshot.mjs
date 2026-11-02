import { chromium } from 'playwright';
const OUT = '/private/var/folders/l9/2vgfyqls615717k9tm4xcxr40000gp/T/opencode/shots';
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` });
for (const seed of [3, 4, 9]) {
  const ctx = await browser.newContext({ viewport: { width: 448, height: 997 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:5173/?dev=warrior,dwarf,cleric,rogue&seed=${seed}&fight=young_dragon`);
  await page.waitForTimeout(1800);
  await page.click('.tray .btn.primary');
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${OUT}/boss-${seed}.jpg`, type: 'jpeg', quality: 70 });
  console.log(seed, (await page.textContent('.tray')).replace(/\s+/g, ' ').slice(0, 200));
  await ctx.close();
}
await browser.close();
