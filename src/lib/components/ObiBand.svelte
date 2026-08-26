<script lang="ts">
	import { onMount, type Snippet } from 'svelte'

	/* `children` is printed ON the cloth and is rasterised with it. `overlay`
	   is the layer of real objects tied OVER the cloth — it sits above the
	   output canvas and is never rasterised, so a rigid thing hung on the band
	   stays rigid instead of rippling with the drape. */
	type Props = { children: Snippet; overlay?: Snippet }

	const { children, overlay }: Props = $props()

	let band: HTMLDivElement
	let src: HTMLCanvasElement
	let content: HTMLDivElement
	let out: HTMLCanvasElement

	/* Cloth rasterises `content` into `src` with drawElementImage and paints the
	   drape into `out`. The subtree stays real DOM — it is laid out, focusable,
	   and Enter activates a link inside it — but hit-testing stops at the canvas,
	   so a mouse click lands on <canvas>, never on the anchor. `out` is
	   pointer-events:none, so the click reaches the band; from there the anchor
	   is found by measuring the content's own layout boxes, which sit at the same
	   coordinates as the band. Keyboard already worked; this gives the pointer
	   the same reach. Runs only while Cloth is active — on the flat path the
	   anchors are ordinary DOM and this never fires. */
	let clothActive = $state(false)

	function forwardClick(event: MouseEvent) {
		if (!clothActive || event.defaultPrevented || event.button !== 0) return
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
		/* The overlay's own anchors are live DOM above the output canvas — they
		   were never rasterised, so they handle their own clicks. Forwarding
		   here as well would fire the link twice. */
		if ((event.target as Element | null)?.closest('.obi__over')) return

		const anchors = content.querySelectorAll<HTMLAnchorElement>('a[href]')
		for (const anchor of anchors) {
			const box = anchor.getBoundingClientRect()
			if (box.width < 1 || box.height < 1) continue
			if (
				event.clientX >= box.left &&
				event.clientX <= box.right &&
				event.clientY >= box.top &&
				event.clientY <= box.bottom
			) {
				anchor.click()
				return
			}
		}
	}

	onMount(() => {
		let cloth: { resize(): void; destroy(): void } | null = null
		let ro: ResizeObserver | undefined
		let dprQuery: MediaQueryList | undefined
		let pending = 0
		let disposed = false

		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
		const dpr = () => Math.min(window.devicePixelRatio || 1, 2)

		function remeasure() {
			const box = band.getBoundingClientRect()
			if (box.width < 1 || box.height < 1) return
			const r = dpr()
			content.style.width = box.width + 'px'
			content.style.height = box.height + 'px'
			src.width = Math.max(1, Math.round(box.width * r))
			src.height = Math.max(1, Math.round(box.height * r))
		}

		function schedule() {
			if (pending || disposed) return
			pending = requestAnimationFrame(() => {
				pending = 0
				if (disposed) return
				remeasure()
				cloth?.resize()
			})
		}

		function watchDpr() {
			if (disposed) return
			dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
			dprQuery.addEventListener('change', onDpr, { once: true })
		}
		function onDpr() {
			if (disposed) return
			schedule()
			watchDpr()
		}

		function printFlat() {
			clothActive = false
			src.hidden = true
			if (content.parentNode === src) band.insertBefore(content, out)
			content.style.width = ''
			content.style.height = ''
		}

		async function startCloth() {
			let mod
			try {
				mod = await import('$lib/vendor/cloth-vanilla.js')
			} catch {
				return
			}
			if (disposed || !mod.supportsHtmlInCanvas()) return

			try {
				remeasure()
				src.hidden = false
				src.appendChild(content)
				cloth = mod.createCloth(
					{ source: src, content, output: out },
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
						backing: [0.894, 0.0, 0.31],
					},
				)
			} catch {
				cloth = null
			}

			if (disposed) {
				cloth?.destroy()
				return
			}
			if (!cloth) {
				printFlat()
				return
			}

			clothActive = true
			ro = new ResizeObserver(schedule)
			ro.observe(band)
			watchDpr()
		}

		startCloth()

		return () => {
			disposed = true
			if (pending) cancelAnimationFrame(pending)
			ro?.disconnect()
			dprQuery?.removeEventListener('change', onDpr)
			cloth?.destroy()
		}
	})
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="obi band--one" bind:this={band} onclick={forwardClick} role="presentation">
	<canvas class="obi__src" bind:this={src} hidden aria-hidden="true" {...{ layoutsubtree: 'true' }}
	></canvas>
	<div class="obi__content" bind:this={content}>
		<span class="obi__weave" aria-hidden="true"></span>
		{@render children()}
	</div>
	<canvas class="obi__out" bind:this={out} aria-hidden="true"></canvas>
	{#if overlay}
		<div class="obi__over">{@render overlay()}</div>
	{/if}
</div>
