import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

// Must run from the project root (or anywhere under it) — Playwright's ESM
// resolution walks up looking for node_modules, and a script invoked from
// outside the project tree (e.g. the scratchpad) fails that lookup.
const root = process.cwd();

const args = process.argv.slice(2);
function argVal(flag, fallback) {
  const i = args.indexOf(flag);
  return i === -1 ? fallback : args[i + 1];
}

const target = argVal('--target', 'design/obi.html');
const outDir = argVal('--out', '.impeccable/review');
const url = 'file://' + path.join(root, target) + '?still=1';
const out = path.join(root, outDir);
fs.mkdirSync(out, { recursive: true });

const sets = [
  { name: 'desktop', w: 1440, h: 900 },
  { name: 'mobile', w: 390, h: 844, mobile: true },
];

// The design files ship an experimental Cloth/html-in-canvas layer that
// only runs behind this flag; without it the page still renders (it
// degrades to flat print) but the shots won't show the cloth effect.
const b = await chromium.launch({
  args: ['--enable-experimental-web-platform-features'],
});

for (const s of sets) {
  const ctx = await b.newContext({
    viewport: { width: s.w, height: s.h },
    deviceScaleFactor: 2,
    isMobile: !!s.mobile,
    hasTouch: !!s.mobile,
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1400);

  const panes = await p.$$('.pane');
  for (let i = 0; i < panes.length; i++) {
    if (i > 0) {
      await p.evaluate(n => {
        const el = document.querySelectorAll('.pane')[n];
        document.getElementById('scroller')?.scrollTo({ top: el.offsetTop, behavior: 'instant' });
      }, i);
      await p.waitForTimeout(650);
    }
    await p.screenshot({ path: `${out}/${s.name}${i === 0 ? '' : '-pane' + (i + 1)}.png` });
  }

  // the button is the one claim these pages exist to make — press it and
  // capture the settled and mid-motion states. Id varies per design
  // (obi: #mark, akari: #cord, bell: #strike); fall back to the first
  // <button> on the page rather than hardcoding one design's id.
  const btn = await p.$('#mark, #cord, #strike') || await p.$('button');
  if (btn) {
    await p.evaluate(() => document.getElementById('scroller')?.scrollTo({ top: 0, behavior: 'instant' }));
    await p.waitForTimeout(250);
    for (let k = 0; k < 3; k++) { await btn.click(); await p.waitForTimeout(180); }
    await p.waitForTimeout(1000);
    await p.screenshot({ path: `${out}/${s.name}-pressed.png` });
    await btn.click();
    await p.waitForTimeout(260);
    await p.screenshot({ path: `${out}/${s.name}-foil.png` });

    await p.evaluate(() => document.getElementById('scroller')?.scrollTo({ top: 0, behavior: 'instant' }));
    await p.waitForTimeout(300);
    await p.keyboard.press('Tab');
    await p.waitForTimeout(200);
    await p.screenshot({ path: `${out}/${s.name}-focus.png` });
  }

  const count = await p.evaluate(() => document.getElementById('count')?.innerText.replace(/\s+/g, ''));
  const cloth = await p.evaluate(() => document.getElementById('cloth-state')?.textContent);
  if (count) console.log(s.name, 'count:', count);
  if (cloth) console.log(s.name, 'cloth:', cloth);
  console.log(s.name, 'errors:', errs.length ? errs : 'none');
  await ctx.close();
}
await b.close();
