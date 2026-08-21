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

const targetArg = argVal('--target', '.impeccable/design-references/obi.html');
const outRoot = argVal('--out', '.impeccable/review');
const statesArgRaw = argVal('--states', null);

// A target that looks like a URL is the real running app (Svelte dev
// server, a deploy preview, whatever). Anything else is a static design
// mockup file, loaded via file:// with the mockup's own ?still=1/?state=
// demo hooks. Output is split by which one this run is, so mockup and
// live captures never overwrite each other.
const isLive = /^https?:\/\//i.test(targetArg);
const mode = isLive ? 'live' : 'mockup';
const baseUrl = isLive ? targetArg : 'file://' + path.join(root, targetArg);

// Forced failure/offline/frozen states only exist as a ?state= hook baked
// into the design mockups for deterministic review shots — the real app
// has no such switch (those states only happen from real network
// conditions), so they're mockup-only unless the caller explicitly asks
// for them anyway.
const defaultStates = isLive ? [] : ['failed', 'offline', 'frozen'];
const states = statesArgRaw
  ? statesArgRaw.split(',').map((s) => s.trim()).filter(Boolean)
  : defaultStates;
if (isLive && statesArgRaw) {
  console.warn(
    'note: --states has no effect on a live target (no ?state= hook exists outside the design mockups) — skipping.'
  );
}

const out = path.join(root, outRoot, mode);
fs.mkdirSync(out, { recursive: true });

function urlFor(state) {
  if (isLive) return baseUrl;
  const qp = new URLSearchParams({ still: '1' });
  if (state) qp.set('state', state);
  return `${baseUrl}?${qp.toString()}`;
}

const sets = [
  { name: 'desktop', w: 1440, h: 900 },
  { name: 'mobile', w: 390, h: 844, mobile: true },
];

// The design mockups ship an experimental Cloth/html-in-canvas layer that
// only runs behind this flag; without it the page still renders (it
// degrades to flat print) but the shots won't show the cloth effect. Inert
// for the live app.
const b = await chromium.launch({
  args: ['--enable-experimental-web-platform-features'],
});

async function openPage(ctx, url) {
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  // The live app holds its query.live stream open indefinitely, so
  // 'networkidle' (no in-flight requests for 500ms) never resolves there —
  // only usable for the mockups, which don't keep a connection open.
  await p.goto(url, { waitUntil: isLive ? 'load' : 'networkidle' });
  await p.waitForTimeout(1400);
  return { p, errs };
}

// Both the mockups (#scroller) and the real app (.scroller, currently a
// single non-scrolling pane) need this — id varies, class doesn't.
function scrollToPane(p, index) {
  return p.evaluate((n) => {
    const el = document.querySelectorAll('.pane')[n];
    if (!el) return;
    const scroller = document.getElementById('scroller') || document.querySelector('.scroller');
    scroller?.scrollTo?.({ top: el.offsetTop, behavior: 'instant' });
  }, index);
}

// The button's id varies per design (obi: #mark, akari: #cord, bell:
// #strike); the real app uses a plain .mark class. Fall back to the first
// <button> rather than hardcoding one design's id.
const findButton = (p) => p.$('#mark, #cord, #strike, .mark').then((el) => el ?? p.$('button'));

for (const s of sets) {
  const ctx = await b.newContext({
    viewport: { width: s.w, height: s.h },
    deviceScaleFactor: 2,
    isMobile: !!s.mobile,
    hasTouch: !!s.mobile,
  });

  // ---- default (connected/live) state: full pane sweep + interactions ----
  const { p, errs } = await openPage(ctx, urlFor(null));

  const panes = await p.$$('.pane');
  const paneCount = panes.length || 1;
  for (let i = 0; i < paneCount; i++) {
    if (i > 0) {
      await scrollToPane(p, i);
      await p.waitForTimeout(650);
    }
    await p.screenshot({ path: `${out}/${s.name}${i === 0 ? '' : '-pane' + (i + 1)}.png` });
  }

  const btn = await findButton(p);
  if (btn) {
    await scrollToPane(p, 0);
    await p.waitForTimeout(250);
    for (let k = 0; k < 3; k++) { await btn.click(); await p.waitForTimeout(180); }
    await p.waitForTimeout(1000);
    await p.screenshot({ path: `${out}/${s.name}-pressed.png` });
    await btn.click();
    await p.waitForTimeout(260);
    await p.screenshot({ path: `${out}/${s.name}-foil.png` });

    await scrollToPane(p, 0);
    await p.waitForTimeout(300);
    await p.keyboard.press('Tab');
    await p.waitForTimeout(200);
    await p.screenshot({ path: `${out}/${s.name}-focus.png` });

    // Mouse-click :active never fires from a real touch pointer — capture
    // the touch-driven press/settle twin separately on mobile rather than
    // assuming it looks identical to the click shots above.
    if (s.mobile) {
      await scrollToPane(p, 0);
      await p.waitForTimeout(250);
      const box = await btn.boundingBox();
      if (box) {
        await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        await p.waitForTimeout(300);
        await p.screenshot({ path: `${out}/${s.name}-touch-settled.png` });
      }
    }
  }

  const count = await p.evaluate(() =>
    (document.getElementById('count') || document.querySelector('.count'))?.innerText.replace(/\s+/g, '')
  );
  const cloth = await p.evaluate(() => document.getElementById('cloth-state')?.textContent);
  if (count) console.log(mode, s.name, 'count:', count);
  if (cloth) console.log(mode, s.name, 'cloth:', cloth);
  console.log(mode, s.name, 'errors:', errs.length ? errs : 'none');
  await p.close();

  // ---- forced failure/offline/frozen states (mockup ?state= hook only) ----
  for (const state of states) {
    const { p: sp, errs: serrs } = await openPage(ctx, urlFor(state));
    await sp.screenshot({ path: `${out}/${s.name}-state-${state}.png` });

    // "failed" has a meaningful next frame: tapping again is the retry —
    // capture that too, not just the initial failure.
    if (state === 'failed') {
      const sbtn = await findButton(sp);
      if (sbtn) {
        await sbtn.click();
        await sp.waitForTimeout(400);
        await sp.screenshot({ path: `${out}/${s.name}-state-failed-retried.png` });
      }
    }

    console.log(mode, s.name, `state=${state} errors:`, serrs.length ? serrs : 'none');
    await sp.close();
  }

  await ctx.close();
}
await b.close();
