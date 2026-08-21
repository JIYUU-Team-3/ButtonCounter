<script lang="ts">
	import { getCount, increment } from './counter/counter.remote.ts';

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

	async function bump() {
		unconfirmed++;
		try {
			await increment();
		} catch {
			unconfirmed = Math.max(0, unconfirmed - 1);
		}
	}

	function guardKeyRepeat(event: KeyboardEvent) {
		if (event.repeat) event.preventDefault();
	}
</script>

<main class="scroller">
	<section class="pane pane--face">
		<div class="spine">
			<h1 class="logotype">Button Counter</h1>
		</div>

		<div class="face">
			<div>
				<div class="count">
					{#if count.error}
						Error
					{:else if displayed !== null}
						{displayed}
					{:else}
						—
					{/if}
				</div>
				{#if count.error || !count.connected}
					<p class="status">
						{count.error ? 'Could not load the count' : 'Disconnected'}
					</p>
				{/if}
			</div>

			<button
				class="mark"
				type="button"
				onclick={bump}
				onkeydown={guardKeyRepeat}
				disabled={!count.ready || !count.connected}
			>
				<span class="mark__caption">Press</span>
			</button>
		</div>
	</section>
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

	.pane--face {
		margin: auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2rem;
	}

	.logotype {
		font-size: 1rem;
		font-weight: 500;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		opacity: 0.6;
		margin: 0;
	}

	.face {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2rem;
	}

	.count {
		font-size: 6rem;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	.status {
		text-align: center;
		color: #f66;
		margin: 0.5rem 0 0;
	}

	.mark {
		width: 8rem;
		height: 8rem;
		border-radius: 50%;
		border: none;
		background: #111;
		color: #f7f3eb;
		font-size: 1rem;
		font-weight: 600;
		text-transform: uppercase;
		cursor: pointer;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		user-select: none;
		-webkit-user-select: none;
		transition: transform 90ms ease-out;
	}

	.mark:active {
		transform: scale(0.96);
	}

	.mark:disabled {
		opacity: 0.4;
		cursor: default;
	}
</style>
