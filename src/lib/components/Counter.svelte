<script lang="ts">
	import { onMount } from 'svelte';
	import { getCount, increment } from '../../routes/counter/counter.remote.ts';

	const count = getCount();

	let unconfirmed = $state(0);
	let lastSeen: number | undefined;

	const displayed = $derived(count.ready ? count.current + unconfirmed : null);

	$effect(() => {
		if (!count.ready) return;
		const current = count.current;
		if (lastSeen !== undefined && current > lastSeen) {
			unconfirmed = Math.max(0, unconfirmed - (current - lastSeen));
		}
		lastSeen = current;
	});

	$effect(() => {
		if (!count.ready) return;
		writeLastCount(count.current);
	});

	let showDisconnected = $state(false);

	$effect(() => {
		if (count.error || count.connected) {
			showDisconnected = false;
			return;
		}
		const timer = setTimeout(() => {
			showDisconnected = true;
		}, 800);
		return () => clearTimeout(timer);
	});

	type Cell = { kind: 'digit' | 'sep'; ch: string; nonce: number; rank: number };

	let cells = $state<Cell[]>([]);

	let countEl: HTMLDivElement;
	let blurPeak = $state(6);
	const BLUR_RATIO = 0.125;
	const BLUR_ANISO = 2.9;
	const BLUR_STOPS = [1, 0.62, 0.38, 0.22, 0.12, 0.062, 0.028, 0.01];
	let rendered = $state(0);
	let announced = $state('');
	let rollSeq = 0;

	function groups(n: number) {
		return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	}

	function paint(value: number, animate: boolean) {
		const s = groups(value);
		const lengthChanged = cells.length !== s.length;
		const next: Cell[] = [];
		let rank = 0;

		for (let i = 0; i < s.length; i++) {
			const ch = s[i];
			if (ch === ',') {
				next.push({ kind: 'sep', ch, nonce: 0, rank: 0 });
				continue;
			}
			const prev = lengthChanged ? undefined : cells[i];
			const changed = !prev || prev.ch !== ch;
			const roll = animate && !reduced && changed;
			next.push({
				kind: 'digit',
				ch,
				nonce: roll ? ++rollSeq : (prev?.nonce ?? 0),
				rank: roll ? rank++ : 0
			});
		}
		cells = next;
	}

	let reduced = false;
	let started = false;
	let target = 0;
	let from = 0;
	let startedAt = 0;
	let raf = 0;
	let catchupMs = 500;
	let ease = (t: number) => 1 - Math.pow(1 - t, 3);
	let announceTimer: ReturnType<typeof setTimeout> | undefined;

	const CACHE_KEY = 'bc:lastCount';

	function readLastCount(): number | null {
		try {
			const raw = localStorage.getItem(CACHE_KEY);
			if (raw === null) return null;
			const n = Number(raw);
			return Number.isFinite(n) && n >= 0 ? n : null;
		} catch {
			return null;
		}
	}

	function writeLastCount(n: number) {
		try {
			localStorage.setItem(CACHE_KEY, String(n));
		} catch {}
	}

	const cached = readLastCount();
	if (cached !== null) {
		started = true;
		rendered = cached;
		target = cached;
		paint(cached, false);
		announced = `${groups(cached)} presses`;
	}

	function bezier(x1: number, y1: number, x2: number, y2: number) {
		const cx = 3 * x1;
		const bx = 3 * (x2 - x1) - cx;
		const ax = 1 - cx - bx;
		const cy = 3 * y1;
		const by = 3 * (y2 - y1) - cy;
		const ay = 1 - cy - by;
		const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
		const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

		return (x: number) => {
			let t = x;
			for (let i = 0; i < 6; i++) {
				const d = slopeX(t);
				if (Math.abs(d) < 1e-6) break;
				const err = sampleX(t) - x;
				if (Math.abs(err) < 1e-6) break;
				t -= err / d;
			}
			t = Math.min(1, Math.max(0, t));
			return ((ay * t + by) * t + cy) * t;
		};
	}

	function readMotionTokens() {
		const s = getComputedStyle(document.documentElement);
		const dur = parseFloat(s.getPropertyValue('--duration-very-slow'));
		if (Number.isFinite(dur) && dur > 0) catchupMs = dur;

		const raw = s.getPropertyValue('--ease-smooth-out').trim();
		const m = raw.match(/cubic-bezier\(([^)]+)\)/);
		if (m) {
			const p = m[1].split(',').map((v) => parseFloat(v));
			if (p.length === 4 && p.every(Number.isFinite)) ease = bezier(p[0], p[1], p[2], p[3]);
		}
	}

	function stopTween() {
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
	}

	function land(value: number, cascade: boolean) {
		rendered = value;
		paint(value, cascade);
		announce(value);
	}

	function step(now: number) {
		const t = Math.min(1, (now - startedAt) / catchupMs);
		if (t >= 1) {
			raf = 0;
			land(target, true);
			return;
		}
		const v = Math.round(from + (target - from) * ease(t));
		if (v !== rendered) {
			rendered = v;
			paint(v, false);
		}
		raf = requestAnimationFrame(step);
	}

	function seek(to: number) {
		const delta = to - rendered;
		target = to;

		if (!started) {
			started = true;
			stopTween();
			rendered = to;
			paint(to, false);
			announced = `${groups(to)} presses`;
			return;
		}
		if (reduced || delta <= 0 || delta === 1) {
			stopTween();
			land(to, delta === 1);
			return;
		}
		from = rendered;
		startedAt = performance.now();
		if (!raf) raf = requestAnimationFrame(step);
	}

	const OTHERS_THROTTLE_MS = 8000;
	let lastOthersAnnounce = 0;

	function announce(value: number, mine = false) {
		if (!mine) {
			const now = performance.now();
			if (now - lastOthersAnnounce < OTHERS_THROTTLE_MS) return;
			lastOthersAnnounce = now;
		}
		clearTimeout(announceTimer);
		announceTimer = setTimeout(() => {
			announced = `${groups(value)} presses`;
		}, 400);
	}

	$effect(() => {
		const to = displayed;
		if (to === null || to === target) return;
		seek(to);
	});

	$effect(() => () => {
		stopTween();
		clearTimeout(announceTimer);
		clearTimeout(shakeTimer);
		if (shakeRaf) cancelAnimationFrame(shakeRaf);
	});

	let pressed = $state(false);
	let errored = $state(false);
	let shaking = $state(false);
	let markSr = $state('Add one to the count');
	let shakeTimer: ReturnType<typeof setTimeout> | undefined;
	let shakeRaf = 0;

	async function bump() {
		if (raf) from += 1;
		target += 1;
		rendered += 1;
		paint(rendered, true);
		announce(rendered, true);

		navigator.vibrate?.(10);
		unconfirmed++;

		try {
			await increment();
		} catch {
			unconfirmed = Math.max(0, unconfirmed - 1);
			fail();
		}
	}

	function fail() {
		errored = true;
		markSr = "Your last press didn't land — press again";
		shaking = false;
		clearTimeout(shakeTimer);
		shakeRaf = requestAnimationFrame(() => {
			shakeRaf = 0;
			shaking = true;
			shakeTimer = setTimeout(() => {
				shaking = false;
				errored = false;
				markSr = 'Add one to the count';
			}, 420);
		});
	}

	function isTypingTarget(target: EventTarget | null) {
		if (!(target instanceof HTMLElement)) return false;
		if (target.isContentEditable) return true;
		return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
	}

	function onWindowKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		if (isTypingTarget(event.target)) return;
		if (!count.ready) return;
		event.preventDefault();
		pressed = true;
		if (event.repeat) return;
		bump();
	}

	function onWindowKeyUp(event: KeyboardEvent) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		pressed = false;
	}

	function onPointerDown() {
		pressed = true;
		bump();
	}
	function onPointerUp() {
		pressed = false;
	}

	let band: HTMLDivElement;
	let bandSrc: HTMLCanvasElement;
	let bandContent: HTMLDivElement;
	let bandOut: HTMLCanvasElement;

	onMount(() => {
		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const onMotion = () => {
			reduced = motionQuery.matches;
			if (reduced) {
				stopTween();
				rendered = target;
				paint(target, false);
			}
		};
		motionQuery.addEventListener('change', onMotion);
		reduced = motionQuery.matches;
		readMotionTokens();

		window.addEventListener('keydown', onWindowKeyDown);
		window.addEventListener('keyup', onWindowKeyUp);

		const measureBlur = () => {
			const fs = parseFloat(getComputedStyle(countEl).fontSize);
			if (Number.isFinite(fs) && fs > 0) blurPeak = fs * BLUR_RATIO;
		};
		measureBlur();
		const countRo = new ResizeObserver(measureBlur);
		countRo.observe(countEl);

		let cloth: { resize(): void; destroy(): void } | null = null;
		let ro: ResizeObserver | undefined;
		let dprQuery: MediaQueryList | undefined;
		let pending = 0;
		let disposed = false;

		const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

		function remeasure() {
			const box = band.getBoundingClientRect();
			if (box.width < 1 || box.height < 1) return;
			const r = dpr();
			bandContent.style.width = box.width + 'px';
			bandContent.style.height = box.height + 'px';
			bandSrc.width = Math.max(1, Math.round(box.width * r));
			bandSrc.height = Math.max(1, Math.round(box.height * r));
		}

		function schedule() {
			if (pending || disposed) return;
			pending = requestAnimationFrame(() => {
				pending = 0;
				if (disposed) return;
				remeasure();
				cloth?.resize();
			});
		}

		function watchDpr() {
			if (disposed) return;
			dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
			dprQuery.addEventListener('change', onDpr, { once: true });
		}
		function onDpr() {
			if (disposed) return;
			schedule();
			watchDpr();
		}

		function printFlat() {
			bandSrc.hidden = true;
			if (bandContent.parentNode === bandSrc) band.insertBefore(bandContent, bandOut);
			bandContent.style.width = '';
			bandContent.style.height = '';
		}

		async function startCloth() {
			let mod;
			try {
				mod = await import('$lib/vendor/cloth-vanilla.js');
			} catch {
				return;
			}
			if (disposed || !mod.supportsHtmlInCanvas()) return;

			try {
				remeasure();
				bandSrc.hidden = false;
				bandSrc.appendChild(bandContent);
				cloth = mod.createCloth(
					{ source: bandSrc, content: bandContent, output: bandOut },
					{
						pin: 'left',
						wind: reduced ? 0 : 0.4,
						speed: 0.32,
						amplitude: 24,
						drape: 16,
						damping: 1.7,
						brush: reduced ? 0 : 1.5,
						brushSize: 190,
						light: 0.2,
						sheen: 0.07,
						shadow: 0.2,
						cornerRadius: 0,
						perspective: 1500,
						backing: [0.894, 0.0, 0.31]
					}
				);
			} catch {
				cloth = null;
			}

			if (disposed) {
				cloth?.destroy();
				return;
			}
			if (!cloth) {
				printFlat();
				return;
			}

			ro = new ResizeObserver(schedule);

			ro.observe(band);
			watchDpr();
		}

		startCloth();

		return () => {
			disposed = true;
			window.removeEventListener('keydown', onWindowKeyDown);
			window.removeEventListener('keyup', onWindowKeyUp);
			motionQuery.removeEventListener('change', onMotion);
			countRo.disconnect();
			if (pending) cancelAnimationFrame(pending);
			ro?.disconnect();
			dprQuery?.removeEventListener('change', onDpr);
			cloth?.destroy();
		};
	});
</script>

<svg class="filters" aria-hidden="true" focusable="false">
	<defs>
		{#each BLUR_STOPS as frac, i (i)}
			<filter id="roll-blur-{i}" x="-80%" y="-160%" width="260%" height="420%">
				<feGaussianBlur
					stdDeviation="{((blurPeak * frac) / BLUR_ANISO).toFixed(3)} {(blurPeak * frac).toFixed(
						3
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

	<div class="obi band--edge" bind:this={band}>
		<canvas
			class="obi__src"
			bind:this={bandSrc}
			hidden
			aria-hidden="true"
			{...{ layoutsubtree: 'true' }}
		></canvas>
		<div class="obi__content" bind:this={bandContent}>
			<span class="obi__weave" aria-hidden="true"></span>
			<div class="credits">
				<div class="credits__block">
					<p class="credits__mark">Button<br />Counter</p>
				</div>

				<div class="vcols">
					<span class="vcol" aria-hidden="true">ボタン・カウンター</span>
					<span class="vcol vcol--thin" aria-hidden="true">一つの数字</span>
					<span class="vcol vcol--thin" aria-hidden="true">自由チーム</span>
					<span class="vcol vcol--thin vcol--en" aria-hidden="true">SVELTEKIT</span>
					<span class="vcol vcol--thin vcol--en" aria-hidden="true">TYPESCRIPT</span>
					<span class="vcol vcol--thin vcol--en" aria-hidden="true">TURSO</span>
					<ul class="vcols__names" lang="ja">
						<li class="vcol vcol--thin">サティヤ</li>
						<li class="vcol vcol--thin">ティシャ</li>
						<li class="vcol vcol--thin">マーヌット</li>
						<li class="vcol vcol--thin">ポーチェン</li>
						<li class="vcol vcol--thin">ヴィサル</li>
					</ul>
				</div>
			</div>
		</div>
		<canvas class="obi__out" bind:this={bandOut} aria-hidden="true"></canvas>
	</div>
</section>

<style>
	.filters {
		position: absolute;
		width: 0;
		height: 0;
		overflow: hidden;
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}

	.pane {
		position: relative;
		scroll-snap-align: start;
		scroll-snap-stop: always;
		min-height: 52svh;
		padding-block: var(--gut);
		padding-inline: max(var(--gut), var(--safe-l)) max(var(--gut), var(--safe-r));
		display: flex;
		flex-direction: column;
	}

	.pane--face {
		min-height: 100dvh;
		padding-top: max(var(--gut), var(--safe-t));
		padding-bottom: 0;
		justify-content: center;
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

	.spine__meta {
		font-size: 0.6rem;
		letter-spacing: 0.19em;
		text-transform: uppercase;
		color: var(--ink);
		display: flex;
		flex-direction: column;
		gap: 0.34rem;
		font-weight: 500;
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

	.obi {
		position: relative;
		background: var(--obi);
		color: var(--white);
		isolation: isolate;
		overflow: hidden;
	}

	.obi__weave {
		position: absolute;
		inset: 0;
		z-index: 0;
		pointer-events: none;
		background-color: var(--obi);
		background-image:
			linear-gradient(
				180deg,
				rgba(0, 0, 0, 0.22) 0 1.5px,
				rgba(255, 255, 255, 0.09) 1.5px 3px,
				rgba(0, 0, 0, 0.09) 3px 5px,
				transparent 5px 12px
			),
			linear-gradient(
				0deg,
				rgba(0, 0, 0, 0.19) 0 1.5px,
				rgba(255, 255, 255, 0.07) 1.5px 3px,
				rgba(0, 0, 0, 0.08) 3px 5px,
				transparent 5px 12px
			);
		background-repeat: no-repeat, no-repeat;
		background-size:
			100% 12px,
			100% 12px;
		background-position: top, bottom;
		box-shadow:
			inset 0 9px 15px -10px rgba(0, 0, 0, 0.34),
			inset 0 -9px 15px -10px rgba(0, 0, 0, 0.28);
	}

	.obi__weave::before {
		content: '';
		position: absolute;
		inset: 0;
		mix-blend-mode: multiply;
		opacity: 0.7;
		background-image:
			repeating-linear-gradient(
				0deg,
				rgba(0, 0, 0, 0.13) 0 1px,
				rgba(0, 0, 0, 0.04) 1px 2.1px,
				rgba(0, 0, 0, 0) 2.1px 4.2px
			),
			repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.06) 0 1px, rgba(0, 0, 0, 0) 1px 3.1px),
			repeating-linear-gradient(64deg, rgba(0, 0, 0, 0.05) 0 1px, rgba(0, 0, 0, 0) 1px 7px),
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='340' height='340'%3E%3Cfilter id='weft'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.012 0.85' numOctaves='3' seed='11' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='linear' slope='0.6'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='340' height='340' filter='url(%23weft)'/%3E%3C/svg%3E"),
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='340' height='340'%3E%3Cfilter id='warp'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8 0.016' numOctaves='2' seed='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='linear' slope='0.34'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='340' height='340' filter='url(%23warp)'/%3E%3C/svg%3E");
		background-size:
			auto,
			auto,
			auto,
			340px 340px,
			340px 340px;
	}

	.obi__weave::after {
		content: '';
		position: absolute;
		inset: 0;
		mix-blend-mode: screen;
		opacity: 0.19;
		background-image:
			repeating-linear-gradient(
				0deg,
				rgba(255, 255, 255, 0) 0 2.2px,
				rgba(255, 255, 255, 0.2) 2.2px 2.9px,
				rgba(255, 255, 255, 0) 2.9px 4.2px
			),
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='340' height='340'%3E%3Cfilter id='fuzz'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.014 0.7' numOctaves='3' seed='19' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='gamma' amplitude='0.5' exponent='1.5'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='340' height='340' filter='url(%23fuzz)'/%3E%3C/svg%3E"),
			linear-gradient(
				97deg,
				transparent 0 16%,
				rgba(255, 238, 200, 0.26) 36%,
				rgba(255, 250, 232, 0.34) 46%,
				rgba(255, 238, 200, 0.22) 57%,
				transparent 78%
			);
		background-size:
			auto,
			340px 340px,
			190% 100%;
		background-position:
			0 0,
			0 0,
			28% 0;
		background-repeat: repeat, repeat, no-repeat;
	}

	.obi__content {
		position: absolute;
		inset: 0;
		z-index: 3;
		overflow: hidden;
	}

	.obi__src {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: 3;
	}
	.obi__src[hidden] {
		display: none;
	}

	.obi__out {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: 4;
		pointer-events: none;
	}

	.credits {
		position: relative;
		z-index: 1;
		height: 100%;
		display: flex;
		justify-content: space-between;
		align-items: stretch;
		gap: clamp(0.9rem, 2.4vw, 2rem);
		padding-block: clamp(0.9rem, 2.2vw, 1.7rem);
		padding-inline: max(var(--gut), var(--safe-l)) max(var(--gut), var(--safe-r));
		overflow: hidden;
	}

	.credits__block {
		flex: 0 1 auto;
		max-width: 38%;
		padding-right: clamp(0.6rem, 2vw, 1.6rem);
	}

	.credits__mark {
		font-family: var(--display);
		font-size: clamp(2rem, 5vw, 4.2rem);
		line-height: 0.78;
		text-transform: uppercase;
		color: var(--white);
		transform: scaleX(0.86);
		transform-origin: left top;
		margin: 0;
		flex: none;
	}

	.vcols__names {
		display: contents;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.vcols {
		display: flex;
		flex-direction: row-reverse;
		gap: clamp(0.55rem, 1.5vw, 1.15rem);
		overflow: hidden;
		flex: 1;
		justify-content: space-between;
		align-items: stretch;
	}

	.vcol {
		writing-mode: vertical-rl;
		font-family: var(--jp);
		font-size: clamp(0.6rem, 1.15vw, 0.78rem);
		letter-spacing: 0.14em;
		line-height: 1.5;
		color: var(--white);
		white-space: nowrap;
		font-weight: 500;
	}

	.vcol--thin {
		font-weight: 400;
		opacity: 0.92;
	}
	.vcol:nth-child(even) {
		align-self: flex-end;
	}
	.vcol:nth-child(3n) {
		align-self: center;
	}

	.band--edge {
		margin-inline: calc(max(var(--gut), var(--safe-l)) * -1)
			calc(max(var(--gut), var(--safe-r)) * -1);
		height: clamp(6.2rem, 13svh, 9rem);
		flex: none;
	}

	.band--edge .credits {
		align-items: center;
		padding-block: 0.7rem;
		/* ...but the wordmark stays above the indicator. */
		padding-bottom: calc(0.7rem + var(--safe-b));
	}

	.band--edge .credits__mark {
		font-size: clamp(1.35rem, 2.9vw, 2.3rem);
	}

	.band--edge .vcol {
		font-size: clamp(0.52rem, 0.95vw, 0.66rem);
		letter-spacing: 0.11em;
	}

	.band--edge .vcols {
		/* shrink to the columns themselves so .credits' space-between keeps
		   them against the band's right edge */
		flex: 0 1 auto;
		justify-content: flex-end;
		gap: clamp(0.7rem, 2.2vw, 1.9rem);
		margin-bottom: calc(var(--safe-b) * -1);
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
		.credits__block {
			max-width: 34%;
		}
		.vcol--en {
			display: none;
		}
		.pane {
			min-height: 56svh;
		}
		.pane--face {
			min-height: 100dvh;
		}
		.band--edge {
			height: clamp(5.4rem, 12svh, 7rem);
		}
		.vcols {
			gap: 0.5rem;
		}
	}

	@media (max-width: 30rem) {
		.credits {
			padding-inline: max(calc(var(--gut) * 0.8), var(--safe-l))
				max(calc(var(--gut) * 0.8), var(--safe-r));
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
