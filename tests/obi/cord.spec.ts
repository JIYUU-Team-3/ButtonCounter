import { describe, expect, it } from 'vitest'
import {
	attachTag,
	calm,
	cordPath,
	createRig,
	energy,
	grainSeed,
	integrate,
	link,
	particle,
	sagOf,
	settle,
	step,
	sweep,
	tagAngle,
	tieAt,
	tieIndex,
	type Particle,
	type Rig,
} from '$lib/obi/cord'

const XS = [40, 110, 180, 250, 320]
const WIDTH = 390
const STEP = 64

function phoneRig(slack = 0.9): Rig {
	const rig = createRig(WIDTH, XS, STEP, slack)
	for (const x of XS) attachTag(rig, x, 18, 120, 2.4)
	return rig
}

function speed(p: Particle): number {
	return Math.hypot(p.x - p.px, p.y - p.py)
}

describe('particle', () => {
	it('starts at rest with previous position equal to current', () => {
		const p = particle(3, 7)
		expect(p).toEqual({ x: 3, y: 7, px: 3, py: 7, inv: 1 })
	})

	it('converts mass to inverse mass', () => {
		expect(particle(0, 0, 4).inv).toBe(0.25)
	})

	it('treats zero mass as pinned', () => {
		expect(particle(0, 0, 0).inv).toBe(0)
	})
})

describe('integrate', () => {
	it('carries implied velocity forward and applies force', () => {
		const p = particle(1, 0)
		p.px = 0
		integrate(p, 0, 0.5, 1)

		expect(p.px).toBe(1)
		expect(p.x).toBe(2)
		expect(p.y).toBe(0.5)
	})

	it('scales velocity by damping', () => {
		const p = particle(10, 0)
		p.px = 0
		integrate(p, 0, 0, 0.5)

		expect(p.x).toBe(15)
	})

	it('leaves a pinned particle where it is', () => {
		const p = particle(5, 5, 0)
		p.px = 0
		p.py = 0
		integrate(p, 3, 3, 1)

		expect(p).toMatchObject({ x: 5, y: 5, px: 0, py: 0 })
	})
})

describe('link', () => {
	it('pulls two free particles to the rest length, splitting the correction', () => {
		const a = particle(0, 0)
		const b = particle(10, 0)
		link(a, b, 6, 1)

		expect(a.x).toBeCloseTo(2)
		expect(b.x).toBeCloseTo(8)
	})

	it('pushes apart when closer than rest', () => {
		const a = particle(0, 0)
		const b = particle(4, 0)
		link(a, b, 10, 1)

		expect(b.x - a.x).toBeCloseTo(10)
	})

	it('gives the whole correction to the free end of a pinned pair', () => {
		const a = particle(0, 0, 0)
		const b = particle(10, 0)
		link(a, b, 6, 1)

		expect(a.x).toBe(0)
		expect(b.x).toBeCloseTo(6)
	})

	it('weights the correction by inverse mass', () => {
		const light = particle(0, 0, 1)
		const heavy = particle(10, 0, 3)
		link(light, heavy, 6, 1)

		/* the light one travels three times as far */
		expect(light.x).toBeCloseTo(3)
		expect(heavy.x).toBeCloseTo(9)
	})

	it('does nothing when both particles are pinned', () => {
		const a = particle(0, 0, 0)
		const b = particle(10, 0, 0)
		link(a, b, 6, 1)

		expect([a.x, b.x]).toEqual([0, 10])
	})

	it('applies only a fraction of the correction below full stiffness', () => {
		const a = particle(0, 0)
		const b = particle(10, 0)
		link(a, b, 6, 0.5)

		expect(b.x - a.x).toBeCloseTo(8)
	})
})

describe('createRig', () => {
	it('pins both ends and leaves the interior free', () => {
		const rig = createRig(WIDTH, XS, STEP, 1)

		expect(rig.nodes[0].inv).toBe(0)
		expect(rig.nodes.at(-1)!.inv).toBe(0)
		expect(rig.nodes.slice(1, -1).every((n) => n.inv === 1)).toBe(true)
	})

	it('spans the full width in ascending order with no duplicates', () => {
		const xs = createRig(WIDTH, XS, STEP, 1).nodes.map((n) => n.x)

		expect(xs[0]).toBe(0)
		expect(xs.at(-1)).toBe(WIDTH)
		expect(xs).toEqual([...xs].sort((a, b) => a - b))
		expect(new Set(xs).size).toBe(xs.length)
	})

	it('derives rest lengths from the gaps they span', () => {
		const rig = createRig(WIDTH, XS, STEP, 0.9)

		for (let i = 0; i < rig.rest.length; i++) {
			expect(rig.rest[i]).toBeCloseTo((rig.nodes[i + 1].x - rig.nodes[i].x) * 0.9)
		}
	})

	it('holds one rest length per segment', () => {
		const rig = createRig(WIDTH, XS, STEP, 1)

		expect(rig.rest).toHaveLength(rig.nodes.length - 1)
	})
})

describe('attachTag', () => {
	it('hangs the plaque below its anchor node', () => {
		const rig = createRig(WIDTH, XS, STEP, 1)
		const tag = attachTag(rig, 110, 18, 120, 2.4)
		const node = rig.nodes[tag.anchor]

		expect(node.x).toBe(110)
		expect(tag.hang).toMatchObject({ x: 110, y: 18 })
		expect(tag.tail).toMatchObject({ x: 110, y: 138 })
	})

	it('makes the plaque heavier than the cord it loads', () => {
		const rig = createRig(WIDTH, XS, STEP, 1)
		const tag = attachTag(rig, 110, 18, 120, 2.4)

		expect(tag.hang.inv).toBeCloseTo(1 / 2.4)
		/* the tail is lighter still, which is what gives the body its lag */
		expect(tag.tail.inv).toBeGreaterThan(tag.hang.inv)
	})

	it('registers the plaque on the rig, ungripped', () => {
		const rig = createRig(WIDTH, XS, STEP, 1)
		const tag = attachTag(rig, 110, 18, 120, 2.4)

		expect(rig.tags).toEqual([tag])
		expect(tag.grip).toBeNull()
	})
})

describe('settle', () => {
	it('drops the cord below its pins under gravity', () => {
		const rig = phoneRig()
		settle(rig, 0.42, 260, 4)

		expect(sagOf(rig)).toBeGreaterThan(0)
	})

	it('leaves the rig asleep, so the first live frame does not lurch', () => {
		const rig = phoneRig()
		settle(rig, 0.42, 260, 4)

		expect(energy(rig)).toBe(0)
	})

	it('keeps the pinned ends on the rail', () => {
		const rig = phoneRig()
		settle(rig, 0.42, 260, 4)

		expect(rig.nodes[0]).toMatchObject({ x: 0, y: 0 })
		expect(rig.nodes.at(-1)).toMatchObject({ x: WIDTH, y: 0 })
	})

	it('digs its lowest point under a plaque, not between two', () => {
		const rig = phoneRig()
		settle(rig, 0.42, 260, 4)

		let deepest = 0
		rig.nodes.forEach((n, i) => {
			if (n.y > rig.nodes[deepest].y) deepest = i
		})

		expect(rig.tags.map((t) => t.anchor)).toContain(deepest)
	})
})

describe('step', () => {
	it('wakes a settled rig when gravity keeps pulling', () => {
		const rig = phoneRig()
		settle(rig, 0.42, 260, 4)
		step(rig, 0, 0.42, 0.985, 4)

		expect(energy(rig)).toBeGreaterThan(0)
	})

	it('carries a horizontal force into the free nodes', () => {
		const rig = phoneRig()
		settle(rig, 0.42, 260, 4)
		const before = rig.nodes[3].x
		step(rig, 2, 0.42, 0.985, 4)

		expect(rig.nodes[3].x).toBeGreaterThan(before)
	})

	it('runs down to rest again once the force stops', () => {
		const rig = phoneRig()
		settle(rig, 0.42, 260, 4)
		step(rig, 4, 0.42, 0.985, 4)
		const kicked = energy(rig)

		for (let i = 0; i < 1000; i++) step(rig, 0, 0.42, 0.985, 4)

		expect(energy(rig)).toBeLessThan(kicked)

		expect(energy(rig)).toBeLessThan(0.015)
	})
})

describe('sweep', () => {
	it('ignores a pointer that is barely moving', () => {
		const rig = phoneRig()
		settle(rig, 0.42, 260, 4)
		const before = rig.nodes.map((n) => n.x)
		sweep(rig, 195, 40, 0.2, 0.1, 140, 0.025)

		expect(rig.nodes.map((n) => n.x)).toEqual(before)
	})

	it('pushes nearby nodes along the pointer travel', () => {
		const rig = phoneRig()
		settle(rig, 0.42, 260, 4)
		const node = rig.nodes[3]
		const before = node.x
		sweep(rig, node.x, node.y, 20, 0, 140, 0.025)

		expect(node.x).toBeGreaterThan(before)
	})

	it('leaves nodes outside the radius alone', () => {
		const rig = phoneRig()
		settle(rig, 0.42, 260, 4)
		const far = rig.nodes[1]
		const before = { ...far }
		sweep(rig, WIDTH - 10, 0, 20, 0, 40, 0.025)

		expect(far).toMatchObject({ x: before.x, y: before.y })
	})

	it('cannot move the pinned ends', () => {
		const rig = phoneRig()
		settle(rig, 0.42, 260, 4)
		sweep(rig, 0, 0, 40, 40, 400, 0.05)

		expect(rig.nodes[0]).toMatchObject({ x: 0, y: 0 })
		expect(rig.nodes.at(-1)).toMatchObject({ x: WIDTH, y: 0 })
	})

	it('pushes sideways far more than it lifts', () => {
		const rig = phoneRig()
		settle(rig, 0.42, 260, 4)
		const node = rig.nodes[3]
		const from = { x: node.x, y: node.y }
		sweep(rig, node.x, node.y, 30, 30, 200, 0.05)

		expect(node.x - from.x).toBeCloseTo((node.y - from.y) / 0.4)
	})
})

describe('tagAngle', () => {
	it('reads zero when the plaque hangs straight down', () => {
		const rig = phoneRig()
		const tag = rig.tags[0]

		expect(tagAngle(tag)).toBe(0)
	})

	it('grows with the tilt', () => {
		const rig = phoneRig()
		const tag = rig.tags[0]
		tag.tail.x = tag.hang.x - tag.body
		tag.tail.y = tag.hang.y + tag.body

		expect(tagAngle(tag)).toBeCloseTo(45)
	})
})

describe('cordPath', () => {
	it('emits nothing for a line that cannot be drawn', () => {
		expect(cordPath([particle(0, 0)])).toBe('')
	})

	it('emits one cubic per segment from a single move', () => {
		const d = cordPath([particle(0, 0), particle(10, 5), particle(20, 0)])

		expect(d.startsWith('M0.00 0.00')).toBe(true)
		expect(d.match(/C/g)).toHaveLength(2)
	})

	it('ends on the last node', () => {
		const nodes = [particle(0, 0), particle(10, 5), particle(20, 3)]

		expect(cordPath(nodes).endsWith('20.00 3.00')).toBe(true)
	})
})

describe('tieIndex / tieAt', () => {
	it('picks the node nearest the tie point', () => {
		const rig = createRig(WIDTH, XS, STEP, 1)
		const i = tieIndex(rig.nodes, WIDTH / 3)

		expect(Math.abs(rig.nodes[i].x - WIDTH / 3)).toBeLessThanOrEqual(STEP / 2)
	})

	it('reports the node position and the local tangent', () => {
		const nodes = [particle(0, 0), particle(10, 10), particle(20, 30)]
		const at = tieAt(nodes, 1)

		expect(at).toMatchObject({ x: 10, y: 10 })
		expect(at.deg).toBeCloseTo((Math.atan2(30, 20) * 180) / Math.PI)
	})

	it('clamps an index past either end', () => {
		const nodes = [particle(0, 0), particle(10, 10), particle(20, 30)]

		expect(tieAt(nodes, -5).x).toBe(0)
		expect(tieAt(nodes, 99).x).toBe(20)
	})

	it('reads the tangent from the single neighbour at an end', () => {
		const nodes = [particle(0, 0), particle(10, 10), particle(20, 30)]

		expect(tieAt(nodes, 0).deg).toBeCloseTo(45)
	})
})

describe('calm', () => {
	it('kills a swinging plaque without moving it', () => {
		const rig = phoneRig()
		const tag = rig.tags[0]
		tag.hang.px = tag.hang.x - 9
		tag.tail.py = tag.tail.y - 12
		const where = { hx: tag.hang.x, ty: tag.tail.y }

		calm(tag)

		expect(speed(tag.hang)).toBe(0)
		expect(speed(tag.tail)).toBe(0)
		expect({ hx: tag.hang.x, ty: tag.tail.y }).toEqual(where)
	})
})

describe('energy', () => {
	it('is zero for a rig that has not moved', () => {
		expect(energy(phoneRig())).toBe(0)
	})

	it('counts the plaques, not only the cord', () => {
		const rig = phoneRig()
		rig.tags[0].tail.px -= 3

		expect(energy(rig)).toBeCloseTo(9)
	})
})

describe('grainSeed', () => {
	it('returns the same grain for the same seed', () => {
		expect(grainSeed('Uteytithya')).toEqual(grainSeed('Uteytithya'))
	})

	it('varies between seeds', () => {
		expect(grainSeed('Uteytithya')).not.toEqual(grainSeed('Hout-Manut'))
	})

	it('stays inside the grain tile', () => {
		for (const handle of ['Jerry12sir', 'Uteytithya', 'Hout-Manut', 'Porchhenng', 'salxz696969']) {
			const { gx, gy } = grainSeed(handle)
			expect(gx).toBeGreaterThanOrEqual(0)
			expect(gx).toBeLessThanOrEqual(260)
			expect(gy).toBeGreaterThanOrEqual(0)
			expect(gy).toBeLessThanOrEqual(260)
			expect(Number.isInteger(gx) && Number.isInteger(gy)).toBe(true)
		}
	})
})

/* ---------------------------------------------------------------
   Regressions. Each of these pins a failure the module's comments
   record — the behaviours that are cheap to reintroduce because the
   "simpler" version of the code looks perfectly reasonable.
   --------------------------------------------------------------- */
describe('regression', () => {
	it('caps a flick, so a pointer carried off-screen cannot detonate the rig', () => {
		const p = particle(1000, 0)
		p.px = 0
		integrate(p, 0, 0, 1)

		/* travelled 1000px in the previous step; may carry at most 40 into this one */
		expect(p.x).toBe(1040)
	})

	it('caps a flick in both directions', () => {
		const p = particle(-1000, 0)
		p.px = 0
		integrate(p, 0, 0, 1)

		expect(p.x).toBe(-1040)
	})

	it('holds the rig finite through a violent drag', () => {
		const rig = phoneRig()
		settle(rig, 0.42, 260, 4)

		const tag = rig.tags[2]
		tag.grip = { f: 0.5, x: tag.hang.x, y: tag.hang.y }
		for (let i = 0; i < 120; i++) {
			tag.grip.x += 90
			tag.grip.y -= 70
			step(rig, 0, 0.42, 0.985, 4)
		}
		tag.grip = null
		for (let i = 0; i < 200; i++) step(rig, 0, 0.42, 0.985, 4)

		for (const n of rig.nodes) {
			expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true)
			expect(Math.abs(n.y)).toBeLessThan(10_000)
		}
	})

	it('puts an exact node under every plaque, so a row of five is evenly set', () => {
		const rig = createRig(WIDTH, XS, STEP, 1)
		const at = rig.nodes.map((n) => n.x)

		for (const x of XS) expect(at).toContain(x)
	})

	it('hangs each plaque on its own node, never a shared neighbour', () => {
		const rig = phoneRig()
		const anchors = rig.tags.map((t) => t.anchor)

		expect(new Set(anchors).size).toBe(anchors.length)
		for (let i = 0; i < XS.length; i++) expect(rig.nodes[anchors[i]].x).toBe(XS[i])
	})

	it('keeps sag monotonic in rope length, which is what the bisection assumes', () => {
		const sags = [0.7, 0.85, 1, 1.2, 1.5].map((slack) => {
			const rig = phoneRig(slack)
			settle(rig, 0.42, 260, 4)
			return sagOf(rig)
		})

		for (let i = 1; i < sags.length; i++) expect(sags[i]).toBeGreaterThan(sags[i - 1])
	})

	it('runs a rope shorter than its span, because stretch supplies the droop', () => {
		const rig = phoneRig(0.9)
		settle(rig, 0.42, 260, 4)

		const rope = rig.rest.reduce((a, b) => a + b, 0)
		expect(rope).toBeLessThan(WIDTH)
		/* and the settled chain is nonetheless longer than the rope it was cut to */
		let length = 0
		for (let i = 0; i < rig.nodes.length - 1; i++) {
			length += Math.hypot(rig.nodes[i + 1].x - rig.nodes[i].x, rig.nodes[i + 1].y - rig.nodes[i].y)
		}
		expect(length).toBeGreaterThan(rope)
	})

	it('does not mirror the tilt: a tail to the right reads as a negative rotation', () => {
		/* with transform-origin at the top the plaque hangs below its pivot, so
		   CSS rotate(+deg) carries the tail LEFT. A plain atan2(dx, dy) flips
		   every tilt on screen. */
		const rig = phoneRig()
		const tag = rig.tags[0]
		tag.tail.x = tag.hang.x + tag.body
		tag.tail.y = tag.hang.y + tag.body

		expect(tagAngle(tag)).toBeCloseTo(-45)
	})

	it('lets a sweep move a free plaque', () => {
		const rig = phoneRig()
		settle(rig, 0.42, 260, 4)
		const tag = rig.tags[2]
		const before = tag.tail.x
		sweep(rig, tag.tail.x, tag.tail.y, 40, 0, 200, 0.05)

		expect(tag.tail.x).toBeGreaterThan(before)
	})

	it('will not fight the hand already holding a plaque', () => {
		const rig = phoneRig()
		settle(rig, 0.42, 260, 4)
		const tag = rig.tags[2]
		tag.grip = { f: 0.4, x: tag.hang.x, y: tag.hang.y }
		const held = { hx: tag.hang.x, hy: tag.hang.y, tx: tag.tail.x, ty: tag.tail.y }

		sweep(rig, tag.tail.x, tag.tail.y, 40, 0, 200, 0.05)

		expect({ hx: tag.hang.x, hy: tag.hang.y, tx: tag.tail.x, ty: tag.tail.y }).toEqual(held)
	})

	it('shows why the knot index is resolved once: the nearest node flips as the cord stretches', () => {
		const rig = phoneRig()
		settle(rig, 0.42, 260, 4)

		const x = WIDTH / 3
		const tied = tieIndex(rig.nodes, x)

		/* drag a plaque hard sideways — the nodes slide along x under the load */
		const tag = rig.tags[1]
		tag.grip = { f: 0.5, x: tag.hang.x + 260, y: tag.hang.y + 120 }
		for (let i = 0; i < 60; i++) step(rig, 0, 0.42, 0.985, 4)

		/* the argmin has moved; the tied index has not, and that is the fix —
		   re-picking it per frame is what made the knot jump a whole segment */
		expect(tieIndex(rig.nodes, x)).not.toBe(tied)
		expect(tieAt(rig.nodes, tied).x).toBeCloseTo(rig.nodes[tied].x)
	})

	it('keeps the grain stable across repaints, unlike Math.random', () => {
		const first = Array.from({ length: 8 }, () => grainSeed('BC-001'))

		expect(new Set(first.map((g) => `${g.gx},${g.gy}`)).size).toBe(1)
	})
})
