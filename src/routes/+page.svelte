<script lang="ts">
	import Counter from '$lib/components/Counter.svelte';
</script>

<main class="scroller">
	<Counter />
</main>

<style>
	.scroller {
		min-height: 100svh;
		display: flex;
		background: #f7f3eb;
		color: #111;
		padding: max(2rem, env(safe-area-inset-top)) max(2rem, env(safe-area-inset-right))
			max(2rem, env(safe-area-inset-bottom)) max(2rem, env(safe-area-inset-left));
	}
</style>
