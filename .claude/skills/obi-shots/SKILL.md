---
name: obi-shots
description: Capture desktop + mobile screenshots (all panes, pressed/foil/focus states) of a Button Counter design mockup in design/ (obi.html, akari.html, bell.html) into .impeccable/review/. Use when the user asks to regenerate, refresh, retake, or check screenshots of one of these design mockups, or after editing one and wanting fresh visual review captures.
argument-hint: "[design/obi.html]"
license: Apache 2.0
allowed-tools:
  - Bash(node .claude/skills/obi-shots/scripts/shot.mjs *)
---

Runs `.claude/skills/obi-shots/scripts/shot.mjs` via Playwright (Chromium, `--enable-experimental-web-platform-features` for the Cloth/html-in-canvas layer) against a design mockup and writes screenshots to `.impeccable/review/`.

## Usage

```
node .claude/skills/obi-shots/scripts/shot.mjs [--target design/obi.html] [--out .impeccable/review]
```

Must be run with cwd at the project root (or a descendant) — Playwright's ESM `import` resolves `node_modules` by walking up from the script's location, and it fails when invoked from outside the project tree (e.g. the scratchpad).

For each of desktop (1440×900) and mobile (390×844, touch-emulated), at 2x device scale:
- one screenshot per `.pane` section (`{name}.png`, `{name}-pane2.png`, …)
- the button pressed 3x (`{name}-pressed.png`) and mid-animation on a 4th press (`{name}-foil.png`) — button is `#mark`/`#cord`/`#strike`/first `<button>`, whichever the target page has
- keyboard-focus state on first Tab (`{name}-focus.png`)

Prints the live count, the `#cloth-state` text (confirms whether the experimental Cloth layer actually activated vs. degraded to flat print), and any console/page errors per viewport — check these in the output, not just the images.

Existing files in the output dir with the same names are overwritten; nothing is deleted first.
