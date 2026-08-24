<script lang="ts">
	import ObiBand from './ObiBand.svelte';
	import ObiCord from './ObiCord.svelte';

	/* Right-to-left in the DOM is right-to-left on the cloth: .roster is
	   row-reverse, and vertical Japanese columns read from the right, so the
	   first person listed here is the first person read. */
	const roster = [
		{ jp: 'サティヤ', role: 'Project lead', handle: 'Jerry12sir' },
		{ jp: 'ティシャ', role: 'Backend', handle: 'Uteytithya' },
		{ jp: 'マーヌット', role: 'Design & front end', handle: 'Hout-Manut' },
		{ jp: 'ポーチェン', role: 'Reviews & dev ops', handle: 'Porchhenng' },
		{ jp: 'ヴィサル', role: 'Testing', handle: 'salxz696969' }
	];

	const REPO = 'JIYUU-Team-3/ButtonCounter';

	/* The stack's barcode is print furniture, not data — but a random one
	   re-prints differently on every render and on every Cloth repaint, which
	   reads as a glitch rather than as ink. Derive it from the catalog number
	   so the same sleeve always carries the same code. */
	function bars(seed: string, count: number) {
		let h = 0;
		for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
		return Array.from({ length: count }, () => {
			h = (h * 1664525 + 1013904223) >>> 0;
			return { wide: ((h >>> 8) & 3) === 0, half: ((h >>> 16) & 7) === 0 };
		});
	}

	const barcode = bars('BC-001 · 26 · 08 · 24', 46);
</script>

<section class="pane pane--credits" aria-labelledby="credits-title">
	<h2 class="sr" id="credits-title">The people who built it</h2>

	<ObiBand>
		{#snippet overlay()}
			<ObiCord {roster} />
		{/snippet}

		<div class="credits">
			<!-- The crest is the strip that shows under the face. It carries what
			     the sleeve says about itself; the body below carries who made it. -->
			<div class="crest">
				<div class="credits__block">
					<p class="credits__mark">Button<br />Counter</p>
				</div>

				<div class="vcols">
					<span class="vcol vcol--wordmark">ボタン・カウンター</span>
					<span class="vcol vcol--thin" aria-hidden="true">一つの数字</span>
					<!-- <span class="vcol vcol--thin vcol--en">ONE NUMBER</span> -->
					<span class="vcol vcol--thin vcol--en">SINCE 2026</span>
					<!-- <span class="vcol vcol--thin" aria-hidden="true">戻らない</span> -->
					<!-- <span class="vcol vcol--thin vcol--en">NEVER DOWN</span> -->
					<span class="vcol vcol--thin" aria-hidden="true">押す</span>
					<span class="vcol vcol--thin">BC-001</span>
				</div>
			</div>

			<div class="body">
				<div class="credits__stack">
					<span class="chip">Team 3</span>
					<div class="barcode" aria-hidden="true">
						{#each barcode as bar, i (i)}
							<i class:w={bar.wide} class:h={bar.half}></i>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</ObiBand>

	<div class="foot">
		<!-- <div class="foot__group">
			<span class="micro">First press 26 · 08 · 24</span>
		</div> -->
		<a class="link" href="https://github.com/{REPO}" rel="noreferrer">github.com/{REPO}</a>
	</div>
</section>
