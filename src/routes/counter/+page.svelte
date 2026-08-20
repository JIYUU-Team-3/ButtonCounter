<script lang="ts">
	import { getCount, increment } from './counter.remote.ts';

	const count = getCount();

	let pending = $state(0);

	async function bump() {
		pending++;
		try {
			await increment();
		} finally {
			pending--;
		}
	}
</script>

<main class="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-8">
	<h1 class="text-sm font-medium tracking-widest text-gray-500 uppercase">Shared counter</h1>

	{#if count.error}
		<p class="text-red-600">Could not load the count: {count.error.message}</p>
	{:else if count.ready}
		<p class="text-7xl font-bold tabular-nums">{count.current}</p>
	{:else}
		<p class="text-7xl font-bold text-gray-300 tabular-nums">—</p>
	{/if}

	<button
		onclick={bump}
		disabled={!count.ready}
		class="rounded-full bg-black px-8 py-3 text-lg font-semibold text-white transition hover:bg-gray-800 disabled:opacity-40"
	>
		Increment
	</button>

	<p class="flex items-center gap-2 text-sm text-gray-500">
		<span
			class="inline-block size-2 rounded-full {count.connected ? 'bg-green-500' : 'bg-gray-400'}"
		></span>
		{count.connected ? 'Live' : 'Disconnected'}
		{#if pending > 0}
			· syncing…
		{/if}
	</p>

	{#if !count.connected}
		<button class="text-sm underline" onclick={() => count.reconnect()}>Reconnect</button>
	{/if}
</main>
