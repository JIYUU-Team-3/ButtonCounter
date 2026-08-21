# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Anyone on the open internet who lands on the page. No account, no onboarding, no
prior context. They arrive curious, press once, and either leave or stay because
the number kept moving without them. Secondary audience: the school assessors who
grade the project, who will open it cold in an unflagged browser.

## Product Purpose

One button. One number. Every human who presses it increments the same eternal
count, in realtime, forever. The count never resets and never goes down. Success
is the moment a visitor realizes the number is climbing from presses that are not
theirs — a felt demonstration that other people are on the other side of the wire
right now.

## Positioning

The mechanism is singular and shared: not a leaderboard, not a competition, not a
goal with a finish line. There is exactly one number for the entire species, and
the only thing a person can do to it is make it larger by one. Neighboring
products fragment the count (per-team, per-region, per-session) or cap it with a
milestone. This one does neither — the indivisibility is the point.

## Operating Context

Single page, opened cold from a link, most often on a phone. Sessions are short
and repeat: press, watch, leave, come back later to see how far it moved. No
sign-in step exists between arrival and the first press. The page must be
intelligible and pressable within one viewport, before any scroll.

## Capabilities and Constraints

Confirmed:
- A single global counter, monotonically increasing, shared by all visitors.
- Realtime propagation of increments to every connected client.
- History over time: the count's growth as a chart / temporal record.
- The visitor's own contribution: their personal press count and its relation to
  the global total.
- History, chart, and personal contribution live **below the fold** — revealed on
  scroll. The first viewport belongs to the number and the button alone.

Explicitly not in scope (asked and declined):
- Live presence ("N people online", geography of pressers).
- A live event feed of individual presses as discrete items.
- Teams, regions, milestones, goals, resets, or decay.

Stack (already committed in the repository, not a decision this record makes):
SvelteKit 2 + Svelte 5 (runes), Tailwind CSS 4, socket.io + svelte-realtime for
transport, Turso / libSQL with Drizzle ORM for persistence, Paraglide for i18n.

Deliverable path (confirmed 2026-08-19, two stages): direction work continues as
**standalone HTML files** in `design/`, self-contained, with synthetic realtime
data. Porting the chosen direction into the SvelteKit route against the real
stack is **committed, not hypothetical** — the mockup is a visual contract that
will be honored in `src/routes/`, not a throwaway. Neither stage is finished
while the other is outstanding.

## Brand Commitments

Name: Button Counter. No logo, wordmark, palette, or typographic asset exists
yet; nothing visual is inherited or binding.

canvas-ui (canvasui.dev) is a **non-binding** material preference (downgraded
2026-08-19): use it where it earns its place, drop it where it fights pinned
behavior such as the mandatory scroll-snap. Not a requirement, not a product
fact.

## Evidence on Hand

None. There is no real count, no real history, no real user data, no traffic, and
no deployment. Every number the mockup shows is authored demonstration data and
must be labeled as synthetic. No usage claims, adoption figures, press quotes, or
uptime statements may be invented.

## Product Principles

1. **One number, undivided.** Anything that splits, caps, or resets the count
   contradicts the product.
2. **Realtime must be felt, not stated.** The proof is motion the visitor did not
   cause, never a badge that says "live".
3. **The press comes before everything.** No gate, no explanation, no scroll
   between arrival and the first increment.
4. **Depth is optional and earned.** History, chart, and personal contribution
   reward the visitor who stays; they never crowd the first viewport.
5. **Permanence over event.** The count is older than any session and outlives it.
   Nothing about the surface should read as a campaign or a countdown.

## Accessibility & Inclusion

No product-specific standard was established. Baseline applies: the primary
action must be reachable and operable by keyboard, the count must be announced to
assistive technology as it changes without flooding it, and all motion must
respect `prefers-reduced-motion`.
