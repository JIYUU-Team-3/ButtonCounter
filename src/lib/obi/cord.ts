/* ---------------------------------------------------------------
   THE OBIJIME — a verlet cord with plaques hung on it.

   Position-based dynamics: every particle stores its previous
   position instead of a velocity, so integration is one subtraction
   and a constraint is a direct position fix. That matters here
   because the plaques LOAD the cord — a tag's hang point and the
   cord node it hangs from are two ends of one distance constraint,
   solved with mass weighting, so pulling a plaque dips the cord and
   the dip travels to its neighbours. Five independent pendulums
   would have been half the code and would have read as a toy.

   Everything is plain numbers in the band's local pixel space. No
   DOM, no Svelte — the component owns rendering and events, this
   owns the simulation.
   --------------------------------------------------------------- */

export type Particle = {
	x: number
	y: number
	/* previous position — velocity is implied by (x - px) */
	px: number
	py: number
	/* inverse mass; 0 pins the particle against every constraint */
	inv: number
}

/**
 * Where a pointer took hold of a plaque. `f` is the grab's position along the
 * hang→tail axis: 0 is the pierce hole, 1 is the foot. Driving the plaque
 * through this rather than through the tail is what makes the rotation read
 * correctly — seize it by the name near the top and the top leads while the
 * foot trails; seize it low and the foot leads. Pinning the tail instead made
 * every drag behave as if the plaque had been grabbed by its bottom edge.
 */
export type Grip = { f: number; x: number; y: number }

export type Tag = {
	/* index of the cord node this plaque hangs from */
	anchor: number
	/* the pierce hole at the plaque's apex */
	hang: Particle
	/* the plaque's bottom centre — gives the body rotational lag */
	tail: Particle
	loop: number
	body: number
	/* non-null while a pointer holds this plaque */
	grip: Grip | null
}

export type Rig = {
	nodes: Particle[]
	/* per-segment rest lengths: segments are NOT uniform, because the
	   node set includes an exact node under every plaque */
	rest: number[]
	tags: Tag[]
	width: number
}

export function particle(x: number, y: number, mass = 1): Particle {
	return { x, y, px: x, py: y, inv: mass > 0 ? 1 / mass : 0 }
}

/* Uniform samples across the span, plus an exact node at every
   plaque's x. Snapping a plaque to the nearest uniform node instead
   would shift it by up to half a segment, which in a row of five
   evenly-set plaques reads as sloppy spacing rather than as physics. */
function nodePositions(width: number, xs: number[], step: number): number[] {
	const out = new Set<number>([0, width])
	for (let x = step; x < width; x += step) out.add(Math.round(x))
	for (const x of xs) out.add(Math.round(x))
	return [...out].sort((a, b) => a - b)
}

/**
 * Build the cord. `slack` scales every segment's rest length against the gap
 * it spans.
 *
 * It is NOT a sag figure and the two are not interchangeable. This chain is
 * deliberately soft — few passes, so segments stretch under load and most of
 * the visible droop is that stretch, not rope length. Raising the pass count
 * to make `slack` mean sag directly would buy an accurate number and cost the
 * softness that makes the cord read as cord, which is a bad trade. So `slack`
 * runs BELOW 1 here: the rope is cut short and the stretch lets it back out to
 * the length it should look. The caller measures the settled result with
 * `sagOf` and solves for the value it needs.
 */
export function createRig(width: number, xs: number[], step: number, slack: number): Rig {
	const at = nodePositions(width, xs, step)
	const nodes = at.map((x) => particle(x, 0, 1))
	nodes[0].inv = 0
	nodes[nodes.length - 1].inv = 0

	const rest: number[] = []
	for (let i = 0; i < nodes.length - 1; i++) rest.push((at[i + 1] - at[i]) * slack)

	return { nodes, rest, tags: [], width }
}

/** How far the cord's lowest point hangs below the pins. */
export function sagOf(rig: Rig): number {
	let low = 0
	for (const n of rig.nodes) low = Math.max(low, n.y)
	return low
}

/**
 * Hang a plaque at `x`. `mass` above the cord's own 1 is what makes
 * the cord dip under it.
 */
export function attachTag(rig: Rig, x: number, loop: number, body: number, mass: number): Tag {
	const anchor = rig.nodes.findIndex((n) => Math.round(n.x) === Math.round(x))
	const node = rig.nodes[anchor]
	const tag: Tag = {
		anchor,
		hang: particle(node.x, node.y + loop, mass),
		tail: particle(node.x, node.y + loop + body, mass * 0.45),
		loop,
		body,
		grip: null,
	}
	rig.tags.push(tag)
	return tag
}

/* Ceiling on how far a particle may travel in one step. A flick carried off
   the edge of the screen can otherwise hand the solver a displacement no
   constraint can pull back, and the rig visibly detonates. */
const MAX_SPEED = 40

function clampSpeed(v: number): number {
	return v > MAX_SPEED ? MAX_SPEED : v < -MAX_SPEED ? -MAX_SPEED : v
}

export function integrate(p: Particle, fx: number, fy: number, damp: number): void {
	if (p.inv === 0) return
	const vx = clampSpeed((p.x - p.px) * damp)
	const vy = clampSpeed((p.y - p.py) * damp)
	p.px = p.x
	p.py = p.y
	p.x += vx + fx
	p.y += vy + fy
}

/** Distance constraint, corrections split by inverse mass. */
export function link(a: Particle, b: Particle, rest: number, stiff: number): void {
	const sum = a.inv + b.inv
	if (sum === 0) return
	const dx = b.x - a.x
	const dy = b.y - a.y
	const d = Math.hypot(dx, dy) || 1e-6
	const k = ((d - rest) / d) * stiff
	const ax = (a.inv / sum) * k
	const bx = (b.inv / sum) * k
	a.x += dx * ax
	a.y += dy * ax
	b.x -= dx * bx
	b.y -= dy * bx
}

function eachParticle(rig: Rig, fn: (p: Particle) => void): void {
	for (const n of rig.nodes) fn(n)
	for (const t of rig.tags) {
		fn(t.hang)
		fn(t.tail)
	}
}

/**
 * Pull the gripped point toward its target, splitting the correction between
 * the two particles by where the grip sits between them. Neither particle is
 * pinned, so both keep integrating and the throw velocity falls out of the
 * simulation on release instead of having to be stamped on by hand.
 */
function drive(t: Tag, stiff: number): void {
	const g = t.grip
	if (!g) return
	const f = g.f
	const gx = t.hang.x + (t.tail.x - t.hang.x) * f
	const gy = t.hang.y + (t.tail.y - t.hang.y) * f
	/* barycentric split: weights (1-f) and f, normalised by their squares so
	   the gripped point lands exactly on target rather than short of it */
	const denom = (1 - f) * (1 - f) + f * f || 1
	const ex = (g.x - gx) * stiff
	const ey = (g.y - gy) * stiff
	t.hang.x += (ex * (1 - f)) / denom
	t.hang.y += (ey * (1 - f)) / denom
	t.tail.x += (ex * f) / denom
	t.tail.y += (ey * f) / denom
}

function solve(rig: Rig, iterations: number, grip: number): void {
	const last = rig.nodes.length - 1

	for (let i = 0; i < iterations; i++) {
		/* Alternate the sweep direction — Gauss-Seidel converges markedly
		   faster when passes do not always carry corrections the same way. */
		if (i % 2 === 0) {
			for (let j = 0; j < last; j++) link(rig.nodes[j], rig.nodes[j + 1], rig.rest[j], 1)
		} else {
			for (let j = last - 1; j >= 0; j--) link(rig.nodes[j], rig.nodes[j + 1], rig.rest[j], 1)
		}

		for (const t of rig.tags) {
			/* Order is the whole feel of a drag, and it is not arbitrary.
			   Whichever constraint runs LAST gets the final say on where `hang`
			   ends up, and `hang` is the plaque's pivot.

			   With the stem solved first, the body link and the grip both drag
			   the pivot afterwards — `hang` is lighter in the pair than it looks
			   (inv 0.417 against the tail's 0.926, so it follows at ~31%) and
			   the plaque swings from the cord node as one rigid rod. That reads
			   as having grabbed the stem, whatever the grip fraction says.

			   Solved last, the stem holds the pivot against the cord and the
			   plaque tilts about its own hole instead — which is what a low grab
			   is supposed to look like. The cord is still loaded either way,
			   because the stem link moves the cord node too. */
			link(t.hang, t.tail, t.body, 1)
			drive(t, grip)
			link(rig.nodes[t.anchor], t.hang, t.loop, 1)
		}
	}
}

/**
 * One fixed timestep. `fx`/`fy` are per-step accelerations in px —
 * gravity plus whatever pseudo-force the moving frame contributes.
 */
export function step(
	rig: Rig,
	fx: number,
	fy: number,
	damp: number,
	iterations: number,
	grip = 0.85,
): void {
	eachParticle(rig, (p) => integrate(p, fx, fy, damp))
	solve(rig, iterations, grip)
}

/**
 * Run the rig to rest without drawing — the reduced-motion pose, and the pose
 * the first frame starts from. `iterations` must match what the live loop
 * uses, or the cord settles to a line it will not hold once running.
 */
export function settle(rig: Rig, gy: number, steps: number, iterations: number): void {
	for (let i = 0; i < steps; i++) step(rig, 0, gy, 0.9, iterations)
	eachParticle(rig, (p) => {
		p.px = p.x
		p.py = p.y
	})
}

/** Summed squared velocity — the sleep test. */
export function energy(rig: Rig): number {
	let sum = 0
	eachParticle(rig, (p) => {
		const dx = p.x - p.px
		const dy = p.y - p.py
		sum += dx * dx + dy * dy
	})
	return sum
}

/** Kill a plaque's momentum — used when it takes keyboard focus, so the ring is not chasing a swinging box. */
export function calm(tag: Tag): void {
	tag.hang.px = tag.hang.x
	tag.hang.py = tag.hang.y
	tag.tail.px = tag.tail.x
	tag.tail.py = tag.tail.y
}

/* A pointer moving over the band is a hand passing over the cord: it pushes
   what it passes near, harder the faster it goes, and does nothing at rest.
   Local and falling off with distance — a global force would move all five
   plaques in lockstep, which reads as a scripted animation rather than as
   something being disturbed. */
function nudge(
	p: Particle,
	x: number,
	y: number,
	ux: number,
	uy: number,
	push: number,
	radius: number,
	weight: number,
): void {
	if (p.inv === 0) return
	const d = Math.hypot(p.x - x, p.y - y)
	if (d > radius) return
	const fall = 1 - d / radius
	/* squared falloff, so the push is felt close in and fades to nothing
	   rather than ending at a hard edge */
	const k = push * fall * fall * weight
	p.x += ux * k
	/* a hand sweeping past pushes sideways far more than it lifts */
	p.y += uy * k * 0.4
}

/**
 * Displace the rig along a pointer's travel. `vx`/`vy` are the pointer's
 * movement since the last frame; the impulse scales with that speed.
 */
export function sweep(
	rig: Rig,
	x: number,
	y: number,
	vx: number,
	vy: number,
	radius: number,
	gain: number,
): void {
	const speed = Math.hypot(vx, vy)
	if (speed < 0.5) return
	const push = Math.min(speed, 60) * gain
	const ux = vx / speed
	const uy = vy / speed
	for (const n of rig.nodes) nudge(n, x, y, ux, uy, push, radius, 0.5)
	for (const t of rig.tags) {
		/* a sweep must not fight the hand already holding the plaque */
		if (t.grip) continue
		nudge(t.hang, x, y, ux, uy, push, radius, 0.35)
		nudge(t.tail, x, y, ux, uy, push, radius, 1)
	}
}

/**
 * Plaque rotation in degrees for a CSS `rotate()`; 0 is hanging straight down.
 *
 * The negated dx is not a fudge. With `transform-origin: 50% 0` the plaque
 * hangs BELOW its pivot, and in screen coordinates (y down) CSS rotate(+θ)
 * carries a point below the origin toward the left — a clock hand at 6 going
 * clockwise reads 6, 7, 8, 9, and 9 is screen-left. So a plain atan2(dx, dy),
 * positive when the tail is right, mirrors every tilt.
 *
 * Derivation: rotate(φ) maps the element's local down-axis (0,1) to
 * (-sin φ, cos φ). Setting that parallel to (dx, dy) gives φ = atan2(-dx, dy).
 */
export function tagAngle(t: Tag): number {
	return (Math.atan2(t.hang.x - t.tail.x, t.tail.y - t.hang.y) * 180) / Math.PI
}

/** Catmull-Rom through the nodes, emitted as cubic beziers. */
export function cordPath(nodes: Particle[]): string {
	if (nodes.length < 2) return ''
	let d = `M${nodes[0].x.toFixed(2)} ${nodes[0].y.toFixed(2)}`
	for (let i = 0; i < nodes.length - 1; i++) {
		const p0 = nodes[i - 1] ?? nodes[i]
		const p1 = nodes[i]
		const p2 = nodes[i + 1]
		const p3 = nodes[i + 2] ?? p2
		const c1x = p1.x + (p2.x - p0.x) / 6
		const c1y = p1.y + (p2.y - p0.y) / 6
		const c2x = p2.x - (p3.x - p1.x) / 6
		const c2y = p2.y - (p3.y - p1.y) / 6
		d += `C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
	}
	return d
}

/**
 * Which node the knot is tied to. Resolved ONCE, against the rig as built —
 * never per frame.
 *
 * Searching for the nearest node every frame is what made the knot teleport.
 * The nodes are laid out at rest but they MOVE: as the cord stretches under a
 * dragged plaque they slide along x, so two neighbours either side of the tie
 * point take turns being the closest one, the argmin flips, and the knot jumps
 * a whole segment — 64px — and back. A knot is tied to one place on the rope
 * and stays there, so the index is the thing that has to be constant.
 */
export function tieIndex(nodes: Particle[], x: number): number {
	let best = 0
	for (let i = 1; i < nodes.length; i++) {
		if (Math.abs(nodes[i].x - x) < Math.abs(nodes[best].x - x)) best = i
	}
	return best
}

/** Point and tangent at the tied node — see `tieIndex` for why this takes one. */
export function tieAt(nodes: Particle[], index: number): { x: number; y: number; deg: number } {
	const i = Math.min(Math.max(index, 0), nodes.length - 1)
	const a = nodes[Math.max(0, i - 1)]
	const b = nodes[Math.min(nodes.length - 1, i + 1)]
	return {
		x: nodes[i].x,
		y: nodes[i].y,
		deg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
	}
}

/**
 * Deterministic per-plaque grain variation. Same idiom the barcode
 * uses: a seeded value, never Math.random, or the grain re-rolls on
 * every repaint and reads as a glitch instead of as wood.
 */
export function grainSeed(seed: string): { gx: number; gy: number } {
	let h = 0
	for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
	const next = () => {
		h = (h * 1664525 + 1013904223) >>> 0
		return (h >>> 8) / 0xffffff
	}
	return {
		gx: Math.round(next() * 260),
		gy: Math.round(next() * 260),
	}
}
