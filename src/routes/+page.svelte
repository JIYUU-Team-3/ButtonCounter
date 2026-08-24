<script lang="ts">
	import { onMount } from 'svelte';
	import Counter from '$lib/components/Counter.svelte';
	import Credits from '$lib/components/Credits.svelte';

	const FADE = 72;

	let stock: HTMLDivElement;

	onMount(() => {
		const de = document.scrollingElement!;
		let frame = 0;
		let last = -1;

		function write() {
			frame = 0;
			const top = de.scrollTop;
			if (top === last) return;
			last = top;
			const bottom = top + de.clientHeight;
			stock.style.setProperty('--fade-a', `${top}px`);
			stock.style.setProperty('--fade-b', `${top + FADE}px`);
			stock.style.setProperty('--fade-c', `${bottom - FADE}px`);
			stock.style.setProperty('--fade-d', `${bottom}px`);
		}

		function schedule() {
			if (!frame) frame = requestAnimationFrame(write);
		}

		function remeasure() {
			last = -1;
			schedule();
		}

		write();
		addEventListener('scroll', schedule, { passive: true });
		addEventListener('resize', remeasure);
		visualViewport?.addEventListener('resize', remeasure);

		return () => {
			if (frame) cancelAnimationFrame(frame);
			removeEventListener('scroll', schedule);
			removeEventListener('resize', remeasure);
			visualViewport?.removeEventListener('resize', remeasure);
		};
	});
</script>

<main class="scroller">
	<div class="stock" bind:this={stock} aria-hidden="true"></div>

	<Counter />
	<Credits />
</main>

<style>
	.scroller {
		position: relative;
		background: var(--cream);
		isolation: isolate;
		color: var(--ink);
	}
</style>
