---
name: ui-shots
description: Capture desktop + mobile screenshots (all panes, pressed/foil/focus/touch states, plus forced failed/offline/frozen states) of either a Button Counter design mockup in .impeccable/design-references/ (obi.html, akari.html, bell.html) or the real running app, into .impeccable/review/mockup/ or .impeccable/review/live/ respectively. Use when the user asks to regenerate, refresh, retake, or check screenshots of a design mockup or the live app, or after editing either and wanting fresh visual review captures.
argument-hint: "[.impeccable/design-references/obi.html | http://localhost:5173/]"
license: Apache 2.0
allowed-tools:
  - Bash(node .claude/skills/ui-shots/scripts/shot.mjs *)
---

Runs `.claude/skills/ui-shots/scripts/shot.mjs` via Playwright (Chromium, `--enable-experimental-web-platform-features` for the design mockups' Cloth/html-in-canvas layer) against either a static design mockup or the real running app, and writes screenshots to `.impeccable/review/`.

## Usage

```
node .claude/skills/ui-shots/scripts/shot.mjs [--target <path-or-url>] [--out .impeccable/review] [--states failed,offline,frozen]
```

Must be run with cwd at the project root (or a descendant) — Playwright's ESM `import` resolves `node_modules` by walking up from the script's location, and it fails when invoked from outside the project tree (e.g. the scratchpad).

**Target auto-detects which of the two modes this run is** — no separate flag needed:

- **Mockup** (default, `--target .impeccable/design-references/obi.html`): loaded via `file://` with the mockup's own `?still=1` (freezes decorative motion) and `?state=` (deterministic failed/offline/frozen) hooks. Output → `.impeccable/review/mockup/`.
- **Live** (`--target` starts with `http://` or `https://`, e.g. `http://localhost:5173/`): loaded as-is against the real app — start the dev server first. Output → `.impeccable/review/live/`. The `?state=` hook doesn't exist on the real app (those states only happen from actual network conditions), so forced-state capture is skipped for live targets even if `--states` is passed — a warning prints, nothing is silently faked.

For each of desktop (1440×900) and mobile (390×844, touch-emulated), at 2x device scale, per target:
- one screenshot per `.pane` section (`{name}.png`, `{name}-pane2.png`, …) — a single-pane page (the live app currently is) just produces the one shot
- the button pressed 3x (`{name}-pressed.png`) and mid-animation on a 4th press (`{name}-foil.png`) — button is `#mark`/`#cord`/`#strike`/`.mark`, whichever the target page has, falling back to the first `<button>`
- keyboard-focus state on first Tab (`{name}-focus.png`)
- mobile only: a real `touchscreen.tap()` press/settle twin (`{name}-touch-settled.png`) — a mouse `:active` never fires from an actual touch pointer, so this isn't assumed identical to `-pressed.png`
- mockup only, once per `--states` entry (default `failed,offline,frozen`): the forced state (`{name}-state-{state}.png`), and for `failed` specifically, one retry tap after it (`{name}-state-failed-retried.png`)

Prints the live count, the `#cloth-state` text where present (confirms whether the mockup's experimental Cloth layer actually activated vs. degraded to flat print), and any console/page errors per viewport/state — check these in the output, not just the images.

Existing files in the output dir with the same names are overwritten; nothing is deleted first.
