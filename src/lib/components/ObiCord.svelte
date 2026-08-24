<script lang="ts">
	import { onMount } from 'svelte';
	import {
		attachTag,
		calm,
		cordPath,
		createRig,
		energy,
		grainSeed,
		sagOf,
		settle,
		step,
		sweep,
		tagAngle,
		tieAt,
		tieIndex,
		type Rig,
		type Tag
	} from '$lib/obi/cord';

	type Person = { jp: string; role: string; handle: string };
	type Props = { roster: Person[] };

	const { roster }: Props = $props();

	/* Simulation constants, in the band's own pixel space. One fixed step is
	   1/60s; every force below is an acceleration in px per step squared, so
	   they read as "how far this pulls in one frame" rather than as SI units. */
	const DT = 1000 / 60;
	const GRAVITY = 0.42;
	const DAMP = 0.985;
	/* Braid, not wire. Segment count is what buys the cord its flex: a coarse
	   chain can only bend at its few joints, so it swings as a stiff arc no
	   matter how it is damped. Short segments let a wave actually travel along
	   it. The extra iteration pays for the softness — a long chain at three
	   passes visibly stretches under the plaque loads and reads as rubber. */
	/* Four, and it stays four. This is the number that makes the cord read as
	   cord: the chain is soft at this pass count, a wave travels visibly along
	   it, and a dragged plaque bends its neighbourhood instead of levering a
	   rigid line. Raising it buys arithmetically correct inextensibility and
	   costs exactly the quality the whole thing exists for. The droop it
	   implies is paid for in rope LENGTH instead — see ropeFor(). */
	const ITERATIONS = 4;
	/* 64, not 16. This chain is pinned at BOTH ends, which is the slow case for
	   a position solver — convergence goes as the square of the node count, so
	   at 16px spacing a desktop span is ~95 nodes and never converges within a
	   frame budget: every node hangs slightly below its neighbours and the
	   error accumulates into ~570px of droop. Coarser nodes converge far
	   better, and crucially they do NOT stiffen the cord — same integrator,
	   same passes, same softness, same stretch. The rendered curve is
	   Catmull-Rom through the nodes, so a coarser chain is not a more angular
	   line. Measured: 95 nodes → 571px sag, 29 nodes → 269px, and with the
	   rest length below it, 67px. */
	const NODE_STEP = 64;
	const MASS = 2.4; /* plaque against a cord node's 1 — this is what dips it */
	const KNOT_AT = 1 / 3;

	/* Sag is a depth in px, never a slack ratio. A fixed ratio makes the dip
	   scale with the span it crosses: the 1.05 that drops a 390px phone cord by
	   53px drops a 1440px desktop cord by 197px, which hangs the plaques clean
	   off the foot of the band.

	   The target now falls as the span widens — not merely constant. A long
	   cord reading as taut is right; the same absolute droop that looks like
	   braid at 390px looks like a slack washing line at 1440px.

	   These numbers stay small on purpose. Most of the visible curve is not the
	   bare catenary at all, it is the scalloping the five plaque loads dig into
	   it, so the base can be shallow and the cord still reads as cord. */
	/* Sag as a share of the BAND'S HEIGHT — the space the cord has to fill —
	   not of the span it crosses. Phone portrait is tall and carries a deep,
	   balanced hang; landscape is 185px tall and carries almost none. Matching
	   the two would be wrong in both directions. 0.17 lands portrait at ~109px,
	   which is the droop this was tuned against by eye. */
	const SAG_RATIO = 0.17;
	const SAG_MIN = 14;
	const SAG_MAX = 150;

	/* Cursor sweep: radius is in plaque widths, gain converts pointer px/frame
	   into displacement px. 60 px/frame is treated as full speed. */
	const SWEEP_RADIUS = 2.2;
	const SWEEP_GAIN = 0.025;

	/* Sleep: the loop stops outright once nothing is moving, and only a
	   pointer, a focus, a resize or coming into view starts it again. A cord that
	   idles a rAF forever is the difference between a detail and a battery
	   complaint on the phone this page is mostly opened on. */
	const REST_ENERGY = 0.015;
	const REST_FRAMES = 40;

	const TAP_SLOP = 8; /* px of movement still counted as a tap, not a drag */
	const TAP_TIME = 400;

	/* clearance the outermost plaque keeps from the band's edge */
	const EDGE = 12;

	/* How far the plaques may be scaled down to fit a short band. 0.55 was too
	   high: a landscape phone leaves roughly 150px of body against a plaque
	   wanting 224 plus its stem and the cord's sag, so the fit loop hit the
	   floor still overflowing and gave up — which is why the plaques were being
	   sliced off at the foot rather than merely looking small. */
	const FIT_MIN = 0.36;

	const grain = $derived(roster.map((p) => grainSeed(p.handle)));

	let root: HTMLDivElement;
	let castEl: SVGPathElement;
	let lineEl: SVGPathElement;
	let knotEl: SVGGElement;
	const loopEls: SVGLineElement[] = [];
	const emaEls: HTMLAnchorElement[] = [];
	const shadeEls: HTMLElement[] = [];

	let reduced = $state(false);
	let box = $state({ w: 0, h: 0 });

	/* Assigned once the rig exists. The markup binds through it so the plaques
	   can render (and be tabbed to, and be followed as links) before any
	   simulation is running. */
	let handlers: {
		grab: (e: PointerEvent, i: number) => void;
		move: (e: PointerEvent) => void;
		release: (e: PointerEvent) => void;
		focus: (i: number) => void;
	} | null = null;

	/* A drag must not end in navigation. Set on release, consumed by the click
	   that the browser fires immediately after. */
	const dragged: boolean[] = [];

	function click(event: MouseEvent, i: number) {
		if (!dragged[i]) return;
		event.preventDefault();
		dragged[i] = false;
	}

	onMount(() => {
		const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
		reduced = motion.matches;

		let rig: Rig | null = null;
		/* Fixed the moment the rig is built and only re-resolved when it is
		   rebuilt — a knot stays tied to one place on the rope. Re-picking the
		   nearest node each frame let the choice flip between neighbours as the
		   cord stretched, which is the teleport. */
		let knotNode = 0;
		let raf = 0;
		let running = false;
		let disposed = false;
		let last = 0;
		let debt = 0;
		let quiet = 0;
		let visible = true;

		/* Scroll deliberately does NOT drive the rig. Coupling the band's own
		   motion into the sim is physically right — the plaques should lag an
		   accelerating frame — but scroll on this page arrives as large discrete
		   jumps from snap and from trackpad momentum, not as smooth travel, so
		   the honest force reads as a twitch. The plaques hang still through a
		   scroll and answer the pointer instead. */

		/* Pointer travel accumulated between frames and consumed by the sim, so
		   the push reflects how far the cursor actually moved in that frame
		   rather than how often the device happened to report it. */
		let cursor = { x: 0, y: 0, dx: 0, dy: 0, live: false };
		let sweepRadius = 140;

		function measure() {
			const r = root.getBoundingClientRect();
			box = { w: Math.round(r.width), h: Math.round(r.height) };
			return box;
		}

		/* CSS owns the plaque's size; JS only reads it back, so the responsive
		   clamps stay in one place instead of being duplicated as magic numbers. */
		function plaqueSize() {
			const el = emaEls[0];
			if (!el) return { w: 64, h: 150 };
			return { w: el.offsetWidth || 64, h: el.offsetHeight || 150 };
		}

		/* The outermost plaques must clear the band's edges, and at 390px the
		   preferred gap does not leave room for them — five plaques and four
		   generous gaps come to 394px inside a 390px band, so both ends were
		   being sliced by the band's own overflow. The gap gives way first: it
		   is the part of the spacing nobody can measure by eye, whereas a
		   shrunken plaque is immediately visible. */
		function layout(width: number, tagW: number) {
			const n = roster.length;
			const room = width - EDGE * 2 - n * tagW;
			const gap = Math.max(tagW * 0.16, Math.min(tagW * 0.42, room / (n - 1)));
			const span = n * tagW + (n - 1) * gap;
			const start = (width - span) / 2 + tagW / 2;
			/* index 0 is the first person read, and the roster reads right-to-left,
			   so the first person hangs rightmost */
			return roster.map((_, i) => start + (n - 1 - i) * (tagW + gap));
		}

		/**
		 * Cut the rope to the length that SETTLES at the sag we asked for.
		 *
		 * There is no closed form for this. The catenary one says slack is just
		 * above 1, but that assumes an inextensible line, and this chain is
		 * deliberately soft — few passes, so it stretches under the plaque loads
		 * and most of the droop is stretch rather than length. Solving that
		 * analytically would mean stiffening the solver, and the softness is the
		 * part that reads as rope, so it stays.
		 *
		 * Bisection instead: build, settle, measure, halve the interval. Sag
		 * falls monotonically as the rope shortens, so ten passes pin it to
		 * well under a pixel. This runs on mount and on resize, never per frame.
		 */
		/**
		 * Cut the rope to the length that SETTLES at the sag we asked for.
		 *
		 * Not a catenary calculation. The catenary assumes an inextensible
		 * line; this chain is deliberately soft, so most of the droop is
		 * stretch rather than length and no closed form predicts it. Stiffening
		 * the solver would make the formula true and cost the softness that
		 * makes the cord read as cord, so instead the rope is simply cut short
		 * — well below the span — and the stretch lets it back out to the line
		 * it should hold. A cord tied taut over a band is exactly that: a
		 * pre-tensioned soft spring.
		 *
		 * Bisection because sag falls monotonically as the rope shortens. Ten
		 * passes pin it to under a pixel. Runs on mount and resize, never per
		 * frame.
		 */
		function ropeFor(target: number, w: number, xs: number[], loop: number, body: number): Rig {
			/* Above 1 is allowed and often needed: a 390px-wide span cannot droop
			   109px on a rope that merely spans it, so the cord is genuinely
			   longer than the gap — which is what "tied with some slack in it"
			   physically means. Sag turns very sharply just past 1, so bisection
			   rather than any formula. */
			let lo = 0.1;
			let hi = 2.5;

			function make(slack: number) {
				const r = createRig(w, xs, NODE_STEP, slack);
				for (const x of xs) attachTag(r, x, loop, body, MASS);
				settle(r, GRAVITY, 260, ITERATIONS);
				return r;
			}

			/* Seeded with the TIGHTEST rope, and that matters more than it looks.
			   `best` only advances on a probe that comes in at or under target,
			   so when the target is below what the cord can physically reach at
			   this width — a short band asking for less droop than the chain's
			   own stretch allows — no probe ever qualifies. Seeded from `hi`
			   that returned the slackest rope in the range, so the failure was
			   not "a little droopy", it was maximum droop. Landscape hit it
			   first because the shortest band asks for the smallest sag. Failing
			   tight is the right direction: too flat is a missed target, too
			   slack is a broken layout. */
			let best = make(lo);
			if (sagOf(best) >= target) return best;

			for (let i = 0; i < 10; i++) {
				const mid = (lo + hi) / 2;
				const r = make(mid);
				if (sagOf(r) > target) hi = mid;
				else {
					lo = mid;
					best = r;
				}
			}
			return best;
		}

		/** How far the lowest plaque's foot reaches. */
		function reach(r: Rig, plaqueH: number) {
			let low = 0;
			for (const t of r.tags) low = Math.max(low, t.hang.y + plaqueH);
			return low;
		}

		function build() {
			const { w } = measure();
			if (w < 1) return;

			/* A landscape phone leaves the band body ~185px tall against a plaque
			   that wants 224px, so the plaques have to be told the height they
			   have rather than deriving it from width alone. One ratio scales the
			   box and its type together, so the plaque shrinks without reflowing
			   into a different object. Reset to 1 first or each rebuild would
			   measure an already-shrunk plaque and ratchet downward. */
			/* Both reset before measuring: --ema-fit so the plaque is measured at
			   its natural size rather than an already-shrunk one, --cord-shift so
			   the layer's offset inside the band is read without last build's
			   centring folded into it. */
			root.style.setProperty('--ema-fit', '1');
			root.style.setProperty('--cord-shift', '0px');
			const natural = plaqueSize();

			/* The band, not this layer, is what the plaques have to look centred
			   in — this layer starts below the crest clearance, so centring
			   inside it lands everything low. */
			const band = root.closest('.obi');
			const bandBox = band?.getBoundingClientRect();
			const bandH = bandBox?.height ?? box.h;
			const layerTop = bandBox ? root.getBoundingClientRect().top - bandBox.top : 0;
			const floor = box.h - 10;

			/* Sag is set by the band's HEIGHT, not its width, and deliberately is
			   NOT normalised across viewports. A tall portrait band wants a deep
			   hang — tightening it there just empties the bottom of the cloth —
			   while a landscape band 185px tall wants almost none. Height is the
			   space being filled, so height is what the droop should answer to. */
			const baseSag = Math.max(SAG_MIN, Math.min(SAG_MAX, box.h * SAG_RATIO));

			/* First guess from the room in both axes. Height will be short: the
			   cord's own sag and the scallop the loads dig into it both push the
			   plaques lower than the bare stem does, and neither is known until
			   the rig has settled — the loop below measures that and corrects.
			   Width has no such unknown, so once the gap has been squeezed to its
			   minimum this is exact, and it is the only thing standing between a
			   very narrow band and five plaques sliced off at both ends. */
			const fitH = (box.h - natural.w * 0.18 - 14) / natural.h;
			const n = roster.length;
			const fitW = (w - EDGE * 2) / (n * natural.w + (n - 1) * natural.w * 0.16);
			let fit = Math.max(FIT_MIN, Math.min(1, fitH, fitW));

			let assembly = 0;
			let plaqueH = natural.h;

			for (let pass = 0; pass < 4; pass++) {
				root.style.setProperty('--ema-fit', fit.toFixed(3));
				const plaque = plaqueSize();
				const xs = layout(w, plaque.w);
				/* A short stem reads as a plaque hung on a cord; a long one reads
				   as a pendulum on a string, and invites the eye to treat the stem
				   as the thing being swung. */
				const loop = Math.round(plaque.w * 0.18);
				const body = Math.round(plaque.h * 0.9);
				sweepRadius = plaque.w * SWEEP_RADIUS;

				/* Take the sag out first — it is free to give up and costs nothing
				   but a flatter cord. Only shrink the plaques once the cord is as
				   taut as it is allowed to get, because shrinking them is the one
				   correction a reader can actually see. */
				let sag = baseSag;
				let built = ropeFor(sag, w, xs, loop, body);
				for (let attempt = 0; attempt < 4; attempt++) {
					const spill = reach(built, plaque.h) - floor;
					if (spill <= 0 || sag <= 3) break;
					sag = Math.max(3, sag - spill - 2);
					built = ropeFor(sag, w, xs, loop, body);
				}
				rig = built;
				knotNode = tieIndex(built.nodes, built.width * KNOT_AT);
				assembly = reach(built, plaque.h);
				plaqueH = plaque.h;

				const drop = reach(built, plaque.h);
				const over = drop - floor;
				if (over <= 0 || fit <= FIT_MIN) break;
				/* measured, not guessed: scale by how much of the drop actually fit */
				fit = Math.max(FIT_MIN, fit * ((drop - over) / drop));
			}

			/* Centre THE PLAQUES IN THE BAND.

			   Two corrections over the obvious version. The thing being centred
			   is the ema block, not the whole rig — the rope is the suspension,
			   and centring pins-to-foot just parks the rope's origin mid-band
			   and pushes every plaque below the middle. And the box it is centred
			   in is the band, not this layer, which begins below the crest
			   clearance and so reads low by exactly that clearance.

			   A translate on the layer, not a change of origin: the physics keeps
			   working in its own space with the pins at y=0, and pointer
			   coordinates stay correct because they are read from this element's
			   own rect, which the transform moves too. */
			if (rig) {
				let top = Infinity;
				let bottom = 0;
				for (const t of rig.tags) {
					top = Math.min(top, t.hang.y);
					bottom = Math.max(bottom, t.hang.y + plaqueH);
				}
				/* Bounded at both ends. Zero is the fold: below it the cord would
				   show under the hero pane. `room` is what the band has left once
				   the assembly is accounted for, so the shift can never push the
				   lowest plaque out through the foot. Between the two it is free
				   to centre, which on any band tall enough also lands the cord
				   far below the fold on its own — that is where the toolbar
				   clearance now comes from. */
				const want = bandH / 2 - layerTop - (top + bottom) / 2;
				const room = Math.max(0, box.h - assembly);
				const shift = Math.min(Math.max(want, 0), room);
				root.style.setProperty('--cord-shift', `${shift.toFixed(1)}px`);
			}

			draw();
		}

		function draw() {
			if (!rig) return;
			lineEl.setAttribute('d', cordPath(rig.nodes));
			castEl.setAttribute('d', cordPath(rig.nodes));

			const tie = tieAt(rig.nodes, knotNode);
			knotEl.setAttribute('transform', `translate(${tie.x} ${tie.y}) rotate(${tie.deg})`);

			for (let i = 0; i < rig.tags.length; i++) {
				const t = rig.tags[i];
				const node = rig.nodes[t.anchor];
				const deg = tagAngle(t);

				loopEls[i]?.setAttribute('x1', node.x.toFixed(2));
				loopEls[i]?.setAttribute('y1', node.y.toFixed(2));
				loopEls[i]?.setAttribute('x2', t.hang.x.toFixed(2));
				loopEls[i]?.setAttribute('y2', t.hang.y.toFixed(2));

				const ema = emaEls[i];
				if (ema) {
					ema.style.transform = `translate3d(${t.hang.x.toFixed(2)}px, ${t.hang.y.toFixed(2)}px, 0) rotate(${deg.toFixed(2)}deg)`;
				}

				/* The shadow lags the swing instead of being welded under the
				   plaque. A shadow that tracks a moving object exactly is the
				   tell that neither is real. */
				const shade = shadeEls[i];
				if (shade) {
					const sx = Math.sin((deg * Math.PI) / 180) * 7;
					shade.style.transform = `translate3d(${sx.toFixed(2)}px, 6px, 0)`;
				}
			}
		}

		function frame(now: number) {
			if (disposed || !rig) return;
			const delta = Math.min(now - last, DT * 5);
			last = now;

			/* Applied once per frame, not once per substep: this is an impulse
			   from something that happened in real time, not a standing force. */
			if (cursor.live && (cursor.dx || cursor.dy)) {
				sweep(rig, cursor.x, cursor.y, cursor.dx, cursor.dy, sweepRadius, SWEEP_GAIN);
			}
			cursor.dx = 0;
			cursor.dy = 0;

			debt = Math.min(debt + delta, DT * 5);
			while (debt >= DT) {
				step(rig, 0, GRAVITY, DAMP, ITERATIONS);
				debt -= DT;
			}
			draw();

			/* a plaque held perfectly still is still held — never sleep under a
			   pointer, or the next move would start from a stalled loop */
			const held = rig.tags.some((t) => t.grip !== null);
			quiet = energy(rig) < REST_ENERGY && !held ? quiet + 1 : 0;
			if (quiet > REST_FRAMES) {
				running = false;
				return;
			}
			raf = requestAnimationFrame(frame);
		}

		function wake() {
			if (disposed || running || reduced || !visible || !rig) return;
			running = true;
			quiet = 0;
			last = performance.now();
			debt = 0;
			raf = requestAnimationFrame(frame);
		}

		/* ---------------- pointer ---------------- */

		function local(event: PointerEvent) {
			const r = root.getBoundingClientRect();
			return { x: event.clientX - r.left, y: event.clientY - r.top };
		}

		function grab(event: PointerEvent, index: number) {
			if (reduced || !rig || event.button !== 0) return;
			const tag = rig.tags[index];
			if (!tag) return;
			const p = local(event);
			const el = emaEls[index];
			el.setPointerCapture(event.pointerId);

			/* Project the grab onto the plaque's own hang→tail axis. That
			   fraction is what decides which end leads when you pull: grabbed
			   near the pierce hole the top leads and the foot trails, grabbed
			   low the foot leads. Clamped just inside the ends so the split
			   never degenerates onto a single particle. */
			const ax = tag.tail.x - tag.hang.x;
			const ay = tag.tail.y - tag.hang.y;
			const len = ax * ax + ay * ay || 1;
			const raw = ((p.x - tag.hang.x) * ax + (p.y - tag.hang.y) * ay) / len;
			const f = Math.max(0.05, Math.min(0.95, raw));

			/* the grip's offset from the axis, so taking hold does not snap the
			   plaque sideways onto the cursor */
			const gx = tag.hang.x + ax * f;
			const gy = tag.hang.y + ay * f;

			tag.grip = { f, x: gx, y: gy };
			drags.set(event.pointerId, {
				tag,
				index,
				dx: gx - p.x,
				dy: gy - p.y,
				sx: event.clientX,
				sy: event.clientY,
				at: performance.now(),
				moved: false
			});
			wake();
		}

		/* Only the target moves. Neither particle is pinned, so both keep
		   integrating while held and the release velocity is whatever the
		   simulation already had — no hand-stamped throw, and no momentum
		   mismatch between the two ends to invert the plaque. */
		function move(event: PointerEvent) {
			const d = drags.get(event.pointerId);
			if (!d?.tag.grip) return;
			const p = local(event);
			d.tag.grip.x = p.x + d.dx;
			d.tag.grip.y = p.y + d.dy;
			if (Math.hypot(event.clientX - d.sx, event.clientY - d.sy) > TAP_SLOP) d.moved = true;
			wake();
		}

		function release(event: PointerEvent) {
			const d = drags.get(event.pointerId);
			if (!d) return;
			drags.delete(event.pointerId);
			d.tag.grip = null;
			/* a drag ends as a drag, never as a navigation */
			dragged[d.index] = d.moved || performance.now() - d.at > TAP_TIME;
			emaEls[d.index]?.releasePointerCapture?.(event.pointerId);
			wake();
		}

		const drags = new Map<
			number,
			{
				tag: Tag;
				index: number;
				dx: number;
				dy: number;
				sx: number;
				sy: number;
				at: number;
				moved: boolean;
			}
		>();

		handlers = { grab, move, release, focus: (i: number) => rig && calm(rig.tags[i]) };

		/* ---------------- lifecycle ---------------- */

		build();

		const io = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					visible = e.isIntersecting;
					if (visible) wake();
				}
			},
			{ threshold: 0 }
		);
		io.observe(root);

		const ro = new ResizeObserver(() => {
			build();
			wake();
		});
		ro.observe(root);

		/* Mouse only. A touch pointermove is already a drag or a scroll, and
		   feeding it in here would double-push whatever the finger is holding.
		   Listening on the window rather than the layer because the overlay is
		   pointer-events:none — the cursor never enters it. */
		const onHover = (event: PointerEvent) => {
			if (reduced || event.pointerType !== 'mouse') return;
			const r = root.getBoundingClientRect();
			const x = event.clientX - r.left;
			const y = event.clientY - r.top;
			if (cursor.live) {
				cursor.dx += x - cursor.x;
				cursor.dy += y - cursor.y;
			}
			cursor.x = x;
			cursor.y = y;
			cursor.live = true;
			/* only bother waking when the cursor is near enough to do anything */
			if (y > -sweepRadius && y < box.h + sweepRadius) wake();
		};

		const onLeave = () => {
			cursor.live = false;
			cursor.dx = 0;
			cursor.dy = 0;
		};
		const onHide = () => {
			if (document.hidden) visible = false;
			else {
				visible = true;
				wake();
			}
		};
		const onMotion = (e: MediaQueryListEvent) => {
			reduced = e.matches;
			if (reduced) running = false;
			else wake();
		};

		window.addEventListener('pointermove', onHover, { passive: true });
		document.addEventListener('pointerleave', onLeave);
		document.addEventListener('visibilitychange', onHide);
		motion.addEventListener('change', onMotion);

		return () => {
			disposed = true;
			running = false;
			cancelAnimationFrame(raf);
			io.disconnect();
			ro.disconnect();
			window.removeEventListener('pointermove', onHover);
			document.removeEventListener('pointerleave', onLeave);
			document.removeEventListener('visibilitychange', onHide);
			motion.removeEventListener('change', onMotion);
		};
	});
</script>

<div class="cord" class:is-static={reduced} bind:this={root}>
	<svg
		class="cord__svg"
		viewBox="0 0 {box.w} {box.h}"
		preserveAspectRatio="none"
		aria-hidden="true"
	>
		<!-- the seam first: a soft offset stroke is what sits the cord ON the
		     band instead of letting it read as printed INTO it -->
		<path class="cord__cast" bind:this={castEl} />
		{#each roster as person, i (person.handle)}
			<line class="cord__loop" bind:this={loopEls[i]} />
		{/each}
		<path class="cord__line" bind:this={lineEl} />
		<g class="cord__knot" bind:this={knotEl}>
			<rect class="cord__wrap" x="-5" y="-7" width="10" height="14" />
			<path class="cord__tail" d="M-2 6 C -3 16 -6 22 -8 30" />
			<path class="cord__tail" d="M2 6 C 3 15 5 21 6 27" />
		</g>
	</svg>

	{#each roster as person, i (person.handle)}
		<a
			class="ema"
			bind:this={emaEls[i]}
			href="https://github.com/{person.handle}"
			rel="noreferrer"
			style="--gx: {grain[i].gx}px; --gy: {grain[i].gy}px"
			onpointerdown={(e) => handlers?.grab(e, i)}
			onpointermove={(e) => handlers?.move(e)}
			onpointerup={(e) => handlers?.release(e)}
			onpointercancel={(e) => handlers?.release(e)}
			onfocus={() => handlers?.focus(i)}
			onclick={(e) => click(e, i)}
		>
			<span class="ema__shade" bind:this={shadeEls[i]} aria-hidden="true"></span>
			<!-- the sawn edge; same pentagon the face is clipped to -->
			<!-- <svg class="ema__edge" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
				<polygon points="50,0 100,13 100,100 0,100 0,13" vector-effect="non-scaling-stroke" />
			</svg> -->
			<span class="ema__face">
				<span class="ema__name" lang="ja">{person.jp}</span>
				<span class="ema__role">{person.role}</span>
				<span class="ema__at">@{person.handle}</span>
			</span>
		</a>
	{/each}
</div>
