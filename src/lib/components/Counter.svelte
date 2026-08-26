<script lang="ts">
	import { onMount } from 'svelte'
	import { getCount, increment } from '../../routes/counter/counter.remote.ts'

	const count = getCount()

	let unconfirmed = $state(0)
	let lastSeen: number | undefined

	const displayed = $derived(count.ready ? count.current + unconfirmed : null)

	$effect(() => {
		if (!count.ready) return
		const current = count.current
		if (lastSeen !== undefined && current > lastSeen) {
			unconfirmed = Math.max(0, unconfirmed - (current - lastSeen))
		}
		lastSeen = current
	})

	$effect(() => {
		if (!count.ready) return
		writeLastCount(count.current)
	})

	let showDisconnected = $state(false)

	$effect(() => {
		if (count.error || count.connected) {
			showDisconnected = false
			return
		}
		const timer = setTimeout(() => {
			showDisconnected = true
		}, 800)
		return () => clearTimeout(timer)
	})

	type Cell = { kind: 'digit' | 'sep'; ch: string; nonce: number; rank: number }

	let cells = $state<Cell[]>([])

	let countEl: HTMLDivElement
	let blurPeak = $state(6)
	const BLUR_RATIO = 0.125
	const BLUR_ANISO = 2.9
	const BLUR_STOPS = [1, 0.62, 0.38, 0.22, 0.12, 0.062, 0.028, 0.01]
	let rendered = $state(0)
	let announced = $state('')
	let rollSeq = 0

	function groups(n: number) {
		return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
	}

	function paint(value: number, animate: boolean) {
		const s = groups(value)
		const lengthChanged = cells.length !== s.length
		const next: Cell[] = []
		let rank = 0

		for (let i = 0; i < s.length; i++) {
			const ch = s[i]
			if (ch === ',') {
				next.push({ kind: 'sep', ch, nonce: 0, rank: 0 })
				continue
			}
			const prev = lengthChanged ? undefined : cells[i]
			const changed = !prev || prev.ch !== ch
			const roll = animate && !reduced && changed
			next.push({
				kind: 'digit',
				ch,
				nonce: roll ? ++rollSeq : (prev?.nonce ?? 0),
				rank: roll ? rank++ : 0,
			})
		}
		cells = next
	}

	let reduced = false
	let started = false
	let target = 0
	let from = 0
	let startedAt = 0
	let raf = 0
	let catchupMs = 500
	let ease = (t: number) => 1 - Math.pow(1 - t, 3)
	let announceTimer: ReturnType<typeof setTimeout> | undefined

	const CACHE_KEY = 'bc:lastCount'

	function readLastCount(): number | null {
		try {
			const raw = localStorage.getItem(CACHE_KEY)
			if (raw === null) return null
			const n = Number(raw)
			return Number.isFinite(n) && n >= 0 ? n : null
		} catch {
			return null
		}
	}

	function writeLastCount(n: number) {
		try {
			localStorage.setItem(CACHE_KEY, String(n))
		} catch {}
	}

	const cached = readLastCount()
	if (cached !== null) {
		started = true
		rendered = cached
		target = cached
		paint(cached, false)
		announced = `${groups(cached)} presses`
	}

	function bezier(x1: number, y1: number, x2: number, y2: number) {
		const cx = 3 * x1
		const bx = 3 * (x2 - x1) - cx
		const ax = 1 - cx - bx
		const cy = 3 * y1
		const by = 3 * (y2 - y1) - cy
		const ay = 1 - cy - by
		const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t
		const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx

		return (x: number) => {
			let t = x
			for (let i = 0; i < 6; i++) {
				const d = slopeX(t)
				if (Math.abs(d) < 1e-6) break
				const err = sampleX(t) - x
				if (Math.abs(err) < 1e-6) break
				t -= err / d
			}
			t = Math.min(1, Math.max(0, t))
			return ((ay * t + by) * t + cy) * t
		}
	}

	function readMotionTokens() {
		const s = getComputedStyle(document.documentElement)
		const dur = parseFloat(s.getPropertyValue('--duration-very-slow'))
		if (Number.isFinite(dur) && dur > 0) catchupMs = dur

		const raw = s.getPropertyValue('--ease-smooth-out').trim()
		const m = raw.match(/cubic-bezier\(([^)]+)\)/)
		if (m) {
			const p = m[1].split(',').map((v) => parseFloat(v))
			if (p.length === 4 && p.every(Number.isFinite)) ease = bezier(p[0], p[1], p[2], p[3])
		}
	}

	function stopTween() {
		if (raf) cancelAnimationFrame(raf)
		raf = 0
	}

	function land(value: number, cascade: boolean) {
		rendered = value
		paint(value, cascade)
		announce(value)
	}

	function step(now: number) {
		const t = Math.min(1, (now - startedAt) / catchupMs)
		if (t >= 1) {
			raf = 0
			land(target, true)
			return
		}
		const v = Math.round(from + (target - from) * ease(t))
		if (v !== rendered) {
			rendered = v
			paint(v, false)
		}
		raf = requestAnimationFrame(step)
	}

	function seek(to: number) {
		const delta = to - rendered
		target = to

		if (!started) {
			started = true
			stopTween()
			rendered = to
			paint(to, false)
			announced = `${groups(to)} presses`
			return
		}
		if (reduced || delta <= 0 || delta === 1) {
			stopTween()
			land(to, delta === 1)
			return
		}
		from = rendered
		startedAt = performance.now()
		if (!raf) raf = requestAnimationFrame(step)
	}

	const OTHERS_THROTTLE_MS = 8000
	let lastOthersAnnounce = 0

	function announce(value: number, mine = false) {
		if (!mine) {
			const now = performance.now()
			if (now - lastOthersAnnounce < OTHERS_THROTTLE_MS) return
			lastOthersAnnounce = now
		}
		clearTimeout(announceTimer)
		announceTimer = setTimeout(() => {
			announced = `${groups(value)} presses`
		}, 400)
	}

	$effect(() => {
		const to = displayed
		if (to === null || to === target) return
		seek(to)
	})

	$effect(() => () => {
		stopTween()
		clearTimeout(announceTimer)
		clearTimeout(shakeTimer)
		if (shakeRaf) cancelAnimationFrame(shakeRaf)
	})

	let pressed = $state(false)
	let errored = $state(false)
	let shaking = $state(false)
	let markSr = $state('Add one to the count')
	let shakeTimer: ReturnType<typeof setTimeout> | undefined
	let shakeRaf = 0

	async function bump() {
		if (raf) from += 1
		target += 1
		rendered += 1
		paint(rendered, true)
		announce(rendered, true)

		navigator.vibrate?.(10)
		unconfirmed++

		try {
			await increment()
		} catch {
			unconfirmed = Math.max(0, unconfirmed - 1)
			fail()
		}
	}

	function fail() {
		errored = true
		markSr = "Your last press didn't land — press again"
		shaking = false
		clearTimeout(shakeTimer)
		shakeRaf = requestAnimationFrame(() => {
			shakeRaf = 0
			shaking = true
			shakeTimer = setTimeout(() => {
				shaking = false
				errored = false
				markSr = 'Add one to the count'
			}, 420)
		})
	}

	function isTypingTarget(target: EventTarget | null) {
		if (!(target instanceof HTMLElement)) return false
		if (target.isContentEditable) return true
		return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
	}

	function onWindowKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Enter' && event.key !== ' ') return
		if (isTypingTarget(event.target)) return
		if (!count.ready) return
		event.preventDefault()
		pressed = true
		if (event.repeat) return
		bump()
	}

	function onWindowKeyUp(event: KeyboardEvent) {
		if (event.key !== 'Enter' && event.key !== ' ') return
		pressed = false
	}

	function onPointerDown() {
		pressed = true
		bump()
	}
	function onPointerUp() {
		pressed = false
	}

	onMount(() => {
		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
		const onMotion = () => {
			reduced = motionQuery.matches
			if (reduced) {
				stopTween()
				rendered = target
				paint(target, false)
			}
		}
		motionQuery.addEventListener('change', onMotion)
		reduced = motionQuery.matches
		readMotionTokens()

		window.addEventListener('keydown', onWindowKeyDown)
		window.addEventListener('keyup', onWindowKeyUp)

		const measureBlur = () => {
			const fs = parseFloat(getComputedStyle(countEl).fontSize)
			if (Number.isFinite(fs) && fs > 0) blurPeak = fs * BLUR_RATIO
		}
		measureBlur()
		const countRo = new ResizeObserver(measureBlur)
		countRo.observe(countEl)

		return () => {
			window.removeEventListener('keydown', onWindowKeyDown)
			window.removeEventListener('keyup', onWindowKeyUp)
			motionQuery.removeEventListener('change', onMotion)
			countRo.disconnect()
		}
	})
</script>

<svg class="filters" aria-hidden="true" focusable="false">
	<defs>
		{#each BLUR_STOPS as frac, i (i)}
			<filter id="roll-blur-{i}" x="-80%" y="-160%" width="260%" height="420%">
				<feGaussianBlur
					stdDeviation="{((blurPeak * frac) / BLUR_ANISO).toFixed(3)} {(blurPeak * frac).toFixed(
						3,
					)}"
				/>
			</filter>
		{/each}
	</defs>
</svg>

<section class="pane pane--face" aria-labelledby="count-label">
	<div class="spine">
		<h1 class="logotype">Button<br />Counter</h1>
		<div class="spine__rule"></div>
	</div>

	<div class="face">
		<div>
			<div class="count" bind:this={countEl} aria-hidden="true">
				{#if count.error || cells.length === 0}
					<span class="digit"><span class="digit__v">—</span></span>
				{:else}
					{#each cells as cell, i (i)}
						{#if cell.kind === 'sep'}
							<span class="count__sep">,</span>
						{:else}
							{#key cell.nonce}
								<span
									class="digit"
									class:is-rolling={cell.nonce > 0}
									style="--stagger: calc({cell.rank} * var(--duration-stagger))"
								>
									<span class="digit__v">{cell.ch}</span>
								</span>
							{/key}
						{/if}
					{/each}
				{/if}
			</div>

			<p class="count__label" id="count-label">Total press{rendered === 1 ? '' : 'es'}</p>

			<p
				class="status"
				class:is-quiet={!count.error && !showDisconnected}
				role="status"
				aria-live="polite"
			>
				{#if count.error}Could not load the count{:else if showDisconnected}Disconnected{/if}
			</p>

			<p class="sr" role="status" aria-live="polite">{announced}</p>
		</div>

		<button
			class="mark"
			class:is-pressed={pressed}
			class:is-error={errored}
			class:is-shaking={shaking}
			type="button"
			onpointerdown={onPointerDown}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
			onpointerleave={onPointerUp}
			disabled={!count.ready}
		>
			<span class="mark__disc" aria-hidden="true"></span>
			<span class="mark__caption">Press</span>
			<span class="sr">{markSr}</span>
		</button>
	</div>
</section>

<style>
	.filters {
		position: absolute;
		width: 0;
		height: 0;
		overflow: hidden;
	}

	.spine {
		position: absolute;
		top: max(var(--gut), var(--safe-t));
		left: max(var(--gut), var(--safe-l));
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
		z-index: 4;
	}

	.logotype {
		font-family: var(--display);
		color: var(--obi);
		font-size: clamp(2.6rem, 5.4vw, 4.6rem);
		line-height: 0.78;
		letter-spacing: 0.01em;
		text-transform: uppercase;
		margin: 0;
		transform: scaleX(0.86);
		transform-origin: left top;
	}

	.spine__rule {
		width: clamp(3rem, 6vw, 5.5rem);
		border-top: var(--rule) solid var(--obi);
	}

	.face {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: clamp(1.1rem, 2.6vw, 2rem);
		flex: 1;
		padding-block: clamp(4.5rem, 12vh, 8rem) 0;
	}

	.count {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 0.02em;
		font-family: var(--display);
		font-size: clamp(3.4rem, 15.5vw, 12rem);
		line-height: 0.84;
		color: var(--foil);
		position: relative;
		isolation: isolate;
		transform: scaleX(0.9);
		padding-bottom: 0.14em;
	}

	.digit {
		display: inline-block;
		width: 0.58em;
		text-align: center;
		position: relative;
	}

	.digit__v {
		display: block;
		padding-block: 0.42em;
		margin-block: -0.42em;
		will-change: transform, filter;
	}

	.count__sep {
		width: 0.22em;
	}

	.count__label {
		font-size: 0.62rem;
		letter-spacing: 0.26em;
		text-transform: uppercase;
		color: var(--ink);
		text-align: center;
		font-weight: 600;
		margin: 1.35rem 0 0;
	}

	.digit.is-rolling {
		animation: roll var(--duration-medium) var(--ease-smooth-out) both;
		animation-delay: var(--stagger, 0ms);
	}

	.digit.is-rolling .digit__v {
		animation: roll-blur var(--duration-medium) var(--ease-smooth-out) both;
		animation-delay: var(--stagger, 0ms);
	}

	@keyframes roll {
		0% {
			transform: translateY(0.22em);
			opacity: 0;
		}
		30% {
			opacity: 0.55;
		}
		60% {
			opacity: 1;
		}
		82% {
			transform: translateY(-0.015em);
		}
		91% {
			transform: translateY(-0.005em);
		}
		97% {
			transform: translateY(-0.002em);
		}
		100% {
			transform: translateY(0);
			opacity: 1;
		}
	}

	@keyframes roll-blur {
		0% {
			filter: url('#roll-blur-0');
		}
		7% {
			filter: url('#roll-blur-1');
		}
		15% {
			filter: url('#roll-blur-2');
		}
		23% {
			filter: url('#roll-blur-3');
		}
		31% {
			filter: url('#roll-blur-4');
		}
		40% {
			filter: url('#roll-blur-5');
		}
		49% {
			filter: url('#roll-blur-6');
		}
		58% {
			filter: url('#roll-blur-7');
		}
		66% {
			filter: none;
		}
		100% {
			filter: none;
		}
	}

	.status {
		margin: 0.85rem auto 0;
		padding: 0.32rem 0.6rem;
		max-width: 26rem;
		border-top: var(--rule) solid var(--obi);
		border-bottom: var(--rule) solid var(--obi);
		font-size: 0.58rem;
		letter-spacing: 0.19em;
		text-transform: uppercase;
		font-weight: 600;
		color: var(--obi);
		text-align: center;
	}

	.status.is-quiet {
		visibility: hidden;
		border-color: transparent;
	}

	.mark {
		-webkit-appearance: none;
		appearance: none;
		border: 0;
		padding: 0;
		background: none;
		cursor: pointer;
		display: block;
		width: clamp(9.2rem, 25vw, 13.5rem);
		height: clamp(9.2rem, 25vw, 13.5rem);
		border-radius: 50%;
		position: relative;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		user-select: none;
		-webkit-user-select: none;
		margin-bottom: 3rem;
		--travel: 0rem;
		--scale: 1;
	}

	.mark__disc {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		overflow: hidden;
		background: var(--obi);
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23f)' opacity='0.3'/%3E%3C/svg%3E");
		background-blend-mode: multiply;
		transform: translateY(var(--travel)) scale(var(--scale));
		box-shadow:
			0 0.14rem 0.24rem -0.06rem color-mix(in srgb, var(--ink) 40%, transparent),
			0 0.5rem 0.7rem -0.28rem color-mix(in srgb, var(--ink) 34%, transparent);
		transition:
			transform var(--motion-spring-release) var(--spring),
			box-shadow 190ms ease-out;
	}

	@media (hover: hover) and (pointer: fine) {
		.mark:hover:not(:disabled) {
			--travel: -0.19rem;
		}
		.mark:hover:not(:disabled) .mark__disc {
			box-shadow:
				0 0.22rem 0.34rem -0.04rem color-mix(in srgb, var(--ink) 42%, transparent),
				0 0.85rem 1.05rem -0.15rem color-mix(in srgb, var(--ink) 36%, transparent);
		}
	}

	.mark:active,
	.mark.is-pressed,
	.mark:hover.is-pressed:not(:disabled) {
		--travel: 0.3rem;
		--scale: 0.99;
	}

	.mark:active .mark__disc,
	.mark.is-pressed .mark__disc,
	.mark:hover.is-pressed:not(:disabled) .mark__disc {
		transition:
			transform var(--duration-micro) cubic-bezier(0.3, 0.7, 0.4, 1),
			box-shadow var(--duration-micro) ease-out;
		box-shadow:
			0 0.05rem 0.1rem -0.02rem color-mix(in srgb, var(--ink) 44%, transparent),
			0 0.1rem 0.18rem -0.08rem color-mix(in srgb, var(--ink) 30%, transparent);
	}

	.mark:focus-visible {
		outline: none;
	}
	.mark:focus-visible .mark__disc {
		outline: 2px solid var(--ink);
		outline-offset: 6px;
	}

	.mark:disabled {
		cursor: default;
		opacity: 0.4;
	}

	.mark.is-error .mark__disc {
		outline: 2px solid var(--obi);
		outline-offset: 6px;
	}

	.mark.is-shaking .mark__disc {
		animation: mark-shake calc(var(--duration-micro) * 4.5) var(--ease-in-out) both;
	}

	@keyframes mark-shake {
		0%,
		100% {
			transform: translateY(var(--travel)) scale(var(--scale)) translateX(0);
		}
		20% {
			transform: translateY(var(--travel)) scale(var(--scale))
				translateX(calc(var(--distance-base) * -1));
		}
		40% {
			transform: translateY(var(--travel)) scale(var(--scale)) translateX(var(--distance-base));
		}
		60% {
			transform: translateY(var(--travel)) scale(var(--scale))
				translateX(calc(var(--distance-small) * -1));
		}
		80% {
			transform: translateY(var(--travel)) scale(var(--scale)) translateX(var(--distance-micro));
		}
	}

	.mark__caption {
		position: absolute;
		top: calc(100% + 1.15rem);
		left: 50%;
		transform: translateX(-50%);
		white-space: nowrap;
		font-size: 0.62rem;
		letter-spacing: 0.26em;
		text-transform: uppercase;
		font-weight: 600;
		color: var(--ink);
	}

	@media (max-width: 46rem) {
		.spine {
			position: static;
			margin-bottom: 0;
		}
		.logotype {
			font-size: clamp(2.2rem, 12vw, 3.4rem);
		}
		.face {
			padding-block: clamp(1.5rem, 6vh, 3rem) 0;
			gap: clamp(2.2rem, 7vh, 4rem);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.digit.is-rolling,
		.digit.is-rolling .digit__v {
			animation: none;
		}
		.mark,
		.mark__disc {
			transition: none;
		}
		.mark.is-shaking .mark__disc {
			animation: none;
		}
	}
</style>
