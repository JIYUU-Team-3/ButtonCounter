---
name: Button Counter — The Obi Band
description: One number for the whole species, printed on a bare sleeve and wrapped in a paper obi band.
colors:
  obi-red: "#e4004f"
  sleeve-cream: "#f7f3eb"
  foil-gold: "#8a6220"
  ink-black: "#111111"
  bright-white: "#ffffff"
  paper-gray: "#d9d7d2"
  risograph-red: "#ff2a5b"
typography:
  display:
    fontFamily: "Anton, Haettenschweiler, Arial Narrow, sans-serif"
    fontSize: "clamp(3.4rem, 15.5vw, 12rem)"
    fontWeight: 400
    lineHeight: 0.84
    letterSpacing: "0.01em"
  headline:
    fontFamily: "Anton, Haettenschweiler, Arial Narrow, sans-serif"
    fontSize: "clamp(2rem, 5.4vw, 4.6rem)"
    fontWeight: 400
    lineHeight: 0.78
    letterSpacing: "0.01em"
  title:
    fontFamily: "Anton, Haettenschweiler, Arial Narrow, sans-serif"
    fontSize: "clamp(1.15rem, 2.7vw, 1.9rem)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.02em"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.2em"
  credits-jp:
    fontFamily: "Zen Kaku Gothic New, Hiragino Sans, Yu Gothic, sans-serif"
    fontSize: "clamp(0.6rem, 1.15vw, 0.78rem)"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0.14em"
rounded:
  full: "50%"
spacing:
  gut: "clamp(1rem, 3.4vw, 2.75rem)"
components:
  button-primary:
    backgroundColor: "{colors.obi-red}"
    rounded: "{rounded.full}"
    width: "clamp(9.2rem, 25vw, 13.5rem)"
    height: "clamp(9.2rem, 25vw, 13.5rem)"
    padding: "0"
  count-display:
    textColor: "{colors.foil-gold}"
    typography: "{typography.display}"
    padding: "0"
  label-micro:
    textColor: "{colors.ink-black}"
    typography: "{typography.label}"
    padding: "0"
  obi-band:
    backgroundColor: "{colors.obi-red}"
    textColor: "{colors.bright-white}"
    padding: "clamp(0.9rem, 2.2vw, 1.7rem) clamp(1rem, 3.4vw, 2.75rem)"
  chip-outline:
    backgroundColor: "transparent"
    textColor: "{colors.bright-white}"
    padding: "0.16rem 0.42rem"
---

# Design System: Button Counter — The Obi Band

## Overview

**Creative North Star: "The Obi Band"**

Design reference file: `.impeccable/design-references/obi.html`

A Tokyo boutique-pop sleeve for a single, eternal number. The page is printed, not screened: two inks — cream stock and obi red — on a fine-tooth uncoated ground, with exactly one color allowed to behave like something other than ink: the gold foil the count is set in. Everything else is flat, square-cornered, and hairline-ruled, as if it came off a press rather than out of a UI kit. It refuses the category default of a glowing counter centered on a dark ground with a pill button beneath it — here the ground is bare and light, the button is a single printed disc, and depth is earned by one real cast shadow rather than borrowed from gradients or glow.

The system is dense with meaning-bearing micro-copy (catalog numbers, vertical Japanese credit columns, a barcode, a colophon) but never decorative kicker copy — every small-caps line names the number, control, or fact sitting beside it. The signature device is the obi band itself: a wrapped, textured red band that crosses the bottom of the hero and unwraps into a full-width credits strip as the visitor scrolls, built with Canvas UI's Cloth (html-in-canvas WebGL drape) as a progressive enhancement over a flat CSS/SVG weave that is always present and always legible on its own.

**Key Characteristics:**
- Two-ink print palette (cream + obi red) plus one foil ink reserved for the count alone
- Anton display type, mechanically squeezed, never used below title scale; Archivo for everything readable
- Exactly one rounded shape in the whole system — the press disc — against square corners everywhere else
- One real elevation: a soft, two-layer cast shadow on the press disc; everything else is flat print or an inset "fold" bevel
- Scroll-snap panes (100svh hero, ~52svh panes after) with a printed band that wraps and unwraps as the mechanism of scroll

## Colors

Two structural inks, one emissive foil, and one single-use print-defect accent.

### Primary
- **Obi Red** (`#e4004f`): the band field, the press disc, and every headline-weight mark on the cream ground (logotype, pane titles, the visitor's own count on the Yours pane, catalog numbers, the record chart's bars, the pane-head rule).

### Secondary
- **Foil Gold** (`#8a6220`): reserved for the eternal count digits, set at display scale (`clamp(3.4rem, 15.5vw, 12rem)`) against sleeve cream. Also used on the "live" record-chart bar and the visitor's-share marker line at the same large-mark scale. It is not a general-purpose accent ink — see the Named Rule below.

### Tertiary
- **Risograph Red** (`#ff2a5b`): a single, deliberate use — the misregistration "ghost" pass behind each record-chart bar (`.bar::after`, multiply blend, 0.28 opacity, offset 1.4px). It exists to make the flat bars read as risograph-printed rather than screen-rendered. Confined to that one effect; it is not a second red for UI elements.

### Neutral
- **Sleeve Cream** (`#f7f3eb`): the page and face background — the "bare stock."
- **Ink Black** (`#111111`): all small type set on cream, and the default hairline rule color.
- **Bright White** (`#ffffff`): all small type and rules set on the red band.
- **Paper Gray** (`#d9d7d2`): quiet dividers and "dead ink" rules (e.g. the colophon's `dt` underline) — never a text color.

### Named Rules
**The One Foil Rule.** Foil gold is spent in exactly one place: the eternal count, at display scale. It does not repeat as a small-text color or a general accent; the build's one confirmed use below display scale (the `.share__tag` chip at 0.55rem, cream-on-foil) is a carried defect, not a pattern to extend — see Do's and Don'ts.

**The One Ghost Rule.** Risograph red exists only inside the misregistration effect on the record chart. A future surface that wants a "second red" should not reach for `#ff2a5b`; it isn't a palette color, it's a printing artifact.

## Typography

**Display Font:** Anton (with Haettenschweiler, Arial Narrow, sans-serif fallback)
**Body Font:** Archivo (with ui-sans-serif, system-ui, sans-serif fallback)
**Label/Mono Font:** Archivo, same family as body, distinguished only by size/tracking/weight
**Credits Font:** Zen Kaku Gothic New (with Hiragino Sans, Yu Gothic fallback) — vertical Japanese credit columns only

**Character:** A single heavy condensed grotesk (Anton) carries every number and headline, mechanically narrowed with `transform: scaleX(0.86–0.9)` on its own display-scale elements — the build's corrective for the face reading too wide at these sizes, not a general type-transform. Archivo underneath is a plain, restrained workhorse for everything that has to be read quickly: labels, body copy, tabular figures.

### Hierarchy
- **Display** (400, `clamp(3.4rem, 15.5vw, 12rem)`, line-height 0.84): the eternal count only. Also used at `clamp(4rem, 13.5vw, 10.5rem)` for the visitor's personal count on the Yours pane — same role, one register down.
- **Headline** (400, `clamp(2rem, 5.4vw, 4.6rem)`, line-height 0.78): the "Button Counter" logotype and the credits-block wordmark repeated on every band.
- **Title** (400, `clamp(1.15rem, 2.7vw, 1.9rem)`, line-height 1, uppercase, obi red): section titles ("The record", "Yours", "Colophon") at the head of each pane.
- **Body** (400, 16px, line-height 1.45): the synthetic-data disclosure paragraph in the colophon; the only true reading paragraph in the system.
- **Label** (500–600, 0.55–0.62rem, 0.17–0.26em tracking, uppercase): every annotative line — the count's caption, the press button's caption, pane metadata (`.pane__note`), catalog chips, barcode captions, axis ticks. Always tabular-numeric where it carries a figure.
- **Credits-JP** (500, `clamp(0.6rem, 1.15vw, 0.78rem)`, 0.14em tracking, vertical `writing-mode: vertical-rl`): the Japanese/English bilingual credit columns on the obi band, hanging alternately from the band's head and foot.

### Named Rules
**The Anton-Only Display Rule.** Condensed display type never appears below title scale (~1.15rem). Body copy and every label are always Archivo — the system never uses the display face for anything meant to be read at length or at small size.

## Layout

The page is a single scroll spine (`#scroller`, `height: 100svh`, `scroll-snap-type: y mandatory`, `scroll-snap-stop: always`), not a document flow. The hero pane is a full `100svh`; every pane after it is `min-height: 52svh` (56svh at ≤46rem), so two panes are always partially visible at once — the mechanism by which the obi band's edge peeks into the hero before the visitor scrolls to unwrap it. A single gutter token, `--gut: clamp(1rem, 3.4vw, 2.75rem)`, sets outer inset padding everywhere and is also used as a negative margin (`margin-inline: calc(var(--gut) * -1)`) to bleed the band edge-to-edge across the full viewport width.

Responsive behavior is a single breakpoint at `46rem`: the spine (logotype block) drops from an absolutely-positioned corner mark to a static stacked block; the desktop-only credits stack (catalog/chip/date/barcode) and the English half of bilingual credit lines are hidden; the personal-share pane collapses from two columns to one. A second, narrower adjustment at `30rem` only tightens the band's inline padding.

### Named Rules
**The Half-Pane Rule.** The hero is always a full `100svh`. Every following pane snaps to roughly half a viewport (~52svh desktop, 56svh mobile) — panes are deliberately incomplete at rest, inviting the next scroll rather than presenting a full "page."

## Elevation & Depth

The system is print-flat by default: no ambient shadows, no card lift, no blur-glow. Depth is spent in exactly two places, both diegetic to the print/object metaphor rather than generic UI elevation.

1. **The press disc** is the one element in the system that behaves like a physical object resting on the sheet. At rest it casts a two-layer soft shadow (a tight contact shadow plus a softer, shorter ambient cast); on hover it lifts (`--travel: -0.19rem`) and both shadow layers grow softer and taller; on press it sinks and shrinks slightly (`--travel: 0.3rem`, `--scale: 0.99`) and the shadow flattens to near-contact only, on a fast unsprung 90ms transition. Release uses a real underdamped spring (`--spring`, ζ≈0.42, ~23% overshoot) so only the *coming back up* rings — going down reads as instant, not bouncy.
2. **The obi band's wrap** is conveyed with inset shadows only (`inset 0 9px 15px -10px …` at head and foot of `.obi__weave`), suggesting the band folding away from the sheet at its edges — a bevel, not a lift. No shadow leaves the band's own box.

### Shadow Vocabulary
- **disc-rest** (`0 0.14rem 0.24rem -0.06rem` + `0 0.5rem 0.7rem -0.28rem`, both `color-mix(in srgb, var(--ink) …, transparent)`): the press disc at rest.
- **disc-hover** (`0 0.22rem 0.34rem -0.04rem` + `0 0.85rem 1.05rem -0.15rem`): the disc lifted.
- **disc-active** (`0 0.05rem 0.1rem -0.02rem` + `0 0.1rem 0.18rem -0.08rem`): the disc pressed, near-flat.
- **band-wrap** (`inset 0 9px 15px -10px rgba(0,0,0,0.34)` top, `inset 0 -9px 15px -10px rgba(0,0,0,0.28)` bottom): the band's folded edge.

### Named Rules
**The One Lift Rule.** Exactly one element in the system casts a real, non-inset shadow: the press disc. Every other surface is flat print or conveyed with an inset fold. A future component should not add ambient card shadows to match generic UI conventions — that vocabulary doesn't exist here.

## Shapes

Square corners everywhere except one deliberate circle. `border-radius` appears in exactly two rules in the whole stylesheet — `.mark` and `.mark__disc` — both the press button, at 50% (`rounded.full`). Every card, chip, band, and container is hard-cornered. The only other "shape" language is the 1px hairline rule (`--rule`), used as dividers (pane heads, colophon `dt`s, credit chip borders) and never thickened for emphasis — emphasis comes from color (obi red) or weight, not stroke width. Anton's display-scale elements carry a mechanical horizontal squeeze (`transform: scaleX(0.86)` on the logotype/credits wordmark, `scaleX(0.9)` on the count, pane titles, and the "Yours" figure) — a build-specific correction to the face's natural width at these sizes, documented here descriptively rather than as a rule to extend to new type.

## Components

### Buttons
- **Shape:** perfect circle (`border-radius: 50%`, `rounded.full`), `clamp(9.2rem, 25vw, 13.5rem)` square.
- **Primary — "The Mark":** the only button in the system, and the product's single primary action. Solid obi-red disc with a subtle multiply fiber-texture overlay, no visible label inside the disc itself; its caption ("Press") sits below as an absolutely-positioned micro-label so it never competes with the disc's silhouette.
- **Hover / Active / Focus:** hover lifts (`--travel: -0.19rem`) with a deepened two-layer shadow; active sinks and shrinks (`--travel: 0.3rem`, `--scale: 0.99`) on a fast 90ms ease; `:focus-visible` suppresses the default outline in favor of a 2px ink outline offset 6px from the disc, never applied on mouse click.
- **Secondary / Ghost:** none exist. The system has exactly one button style — do not invent a second.

### Chips
- **Outline style ("Synthetic" chip, `.chip`):** transparent background, 1px white border on the red band, 0.55rem uppercase label, 0.18em tracking. This is the system's default chip.
- **Filled style (`.share__tag`, "You"):** foil-gold background, cream text, 0.55rem. Carried from the build as-is but **not** a pattern to reuse — see Do's and Don'ts on foil at small sizes.

### Cards / Containers
- **Corner Style:** square, no radius.
- **Background:** the halftone "share" field (`.share`) sits on sleeve cream with a 1px ink border; the "synthetic" disclosure box (`.synthetic`) is a 2px obi-red border on cream, no fill.
- **Shadow Strategy:** none — see Elevation & Depth; containers are flat.
- **Border:** 1px ink hairline (`.share`), 2px obi-red (`.synthetic`), 1px paper-gray under colophon `dt` labels.
- **Internal Padding:** follows `--gut` at the pane level; component-internal padding is bespoke per component (e.g. `.synthetic` at `0.7rem 0.85rem`).

### Navigation
No nav chrome exists. Wayfinding is entirely the scroll spine: `scroll-snap-type: y mandatory` panes, discoverable only by scrolling, with the wrapped/unwrapped band as the visual cue that more content follows.

### The Obi Band (signature component)
The band is the system's one custom, non-generic component: a full-bleed red strip holding the wordmark, bilingual vertical credit columns (Japanese primary, English secondary, hidden ≤46rem), a catalog stack (desktop only), and a barcode. Its printed-fabric surface is built from layered CSS gradients and SVG turbulence noise (`.obi__weave`, `::before`/`::after`) that is **always on and always legible** — this is the real fallback path, not a loading state. Canvas UI's Cloth (html-in-canvas → WebGL drape) is layered on top as a progressive enhancement only, scoped to the band element (`data-cloth`) so it never touches `scroll-snap-type: y mandatory` on the page. It appears in two forms: `.band--edge` (a short, cropped strip peeking across the hero's bottom edge) and `.band--full` (a full pane, unwrapped).

## Do's and Don'ts

### Do:
- **Do** reserve foil gold (`#8a6220`) for the eternal count at display scale — the system's one emissive-reading color.
- **Do** keep Anton confined to display/headline/title scale (≥~1.15rem); everything smaller is Archivo.
- **Do** set every annotative label in uppercase Archivo, 0.55–0.62rem, 0.17–0.26em tracking, and place it beside or beneath the figure it names — never above a headline as a pre-announcement.
- **Do** give the press disc a soft, two-layer cast shadow (contact + ambient) for its rest/hover/active states; use the documented exact values, not a generic drop-shadow.
- **Do** keep corners square everywhere except the press disc; 50% radius is spent in exactly one place.
- **Do** keep the obi band's flat CSS/SVG weave as the real, always-rendered surface; treat Cloth strictly as an enhancement layered on top, scoped to band elements only.

### Don't:
- **Don't** use risograph red (`#ff2a5b`) as a general secondary accent — it is confined to the single misregistration-ghost effect on the record chart.
- **Don't** repeat the foil-on-small-text pattern from `.share__tag` (cream text on foil gold at 0.55rem). Its contrast was never machine-verified (`detect.mjs` ran degraded for this build) and it reads noticeably weaker than the rest of the label system — it is a carried defect from this build, not a system rule for new surfaces.
- **Don't** add a hard-offset, high-contrast "neobrutalist" shadow anywhere in this system; its only elevation vocabulary is the soft two-layer cast shadow on the disc and the inset fold on the band.
- **Don't** reuse the `scaleX(0.86)`/`scaleX(0.9)` horizontal squeeze on body copy, labels, or any non-Anton, non-display-scale type — it's a corrective specific to Anton at large sizes, not a general transform.
- **Don't** invent a second button style (ghost, outline, secondary); the product has exactly one action and the system reflects that with exactly one button.
