<script lang="ts">
	import Counter from '$lib/components/Counter.svelte';
</script>

<div class="ground" aria-hidden="true"></div>
<div class="stock" aria-hidden="true"></div>

<main class="scroller">
	<Counter />
</main>

<style>
	.ground {
		position: fixed;
		inset: 0;
		z-index: 0;
		background: var(--cream);
		pointer-events: none;
	}

	.scroller {
		position: relative;
		height: 100dvh;
		overflow-y: auto;
		overflow-x: hidden;
		overscroll-behavior-y: contain;
		scroll-snap-type: y mandatory;
		scroll-behavior: smooth;
		color: var(--ink);
	}
</style>
