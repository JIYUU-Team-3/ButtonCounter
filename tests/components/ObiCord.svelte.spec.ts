import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-svelte'
import ObiCord from '$lib/components/ObiCord.svelte'

const roster = [
	{ jp: 'サティヤ', role: 'Project lead', handle: 'Jerry12sir' },
	{ jp: 'ティシャ', role: 'Backend', handle: 'Uteytithya' },
	{ jp: 'マーヌット', role: 'Design & front end', handle: 'Hout-Manut' },
]

function plaques() {
	return document.querySelectorAll<HTMLAnchorElement>('a.ema')
}

describe('ObiCord.svelte', () => {
	it('hangs one plaque per person', () => {
		render(ObiCord, { roster })

		expect(plaques()).toHaveLength(roster.length)
	})

	it('prints the name, the role and the handle on each plaque', async () => {
		render(ObiCord, { roster })

		await expect.element(page.getByText('サティヤ')).toBeInTheDocument()
		await expect.element(page.getByText('Project lead')).toBeInTheDocument()
		await expect.element(page.getByText('@Jerry12sir')).toBeInTheDocument()
	})

	it('points each plaque at that person on GitHub', () => {
		render(ObiCord, { roster })

		expect([...plaques()].map((a) => a.getAttribute('href'))).toEqual(
			roster.map((p) => `https://github.com/${p.handle}`),
		)
	})

	it('marks the Japanese name as Japanese', () => {
		render(ObiCord, { roster })

		expect(plaques()[0].querySelector('.ema__name')?.getAttribute('lang')).toBe('ja')
	})

	it('renders nothing but the cord for an empty roster', () => {
		render(ObiCord, { roster: [] })

		expect(plaques()).toHaveLength(0)
		expect(document.querySelector('.cord')).not.toBeNull()
	})
})

// 回帰テスト（Regression)
describe('regression', () => {
	it('renders the plaques before any simulation runs, so they are never blank', () => {
		render(ObiCord, { roster })

		/* the markup binds through a nullable `handlers`; if it were required
		   the plaques could not paint until the rig existed */
		for (const el of plaques()) expect(el.textContent).not.toBe('')
	})

	it('leaves every plaque in the tab order', () => {
		render(ObiCord, { roster })

		for (const el of plaques()) {
			el.focus()
			expect(document.activeElement).toBe(el)
		}
	})

	it('keeps outbound links from leaking the referrer', () => {
		render(ObiCord, { roster })

		for (const el of plaques()) expect(el.rel).toBe('noreferrer')
	})

	it('gives each plaque its own grain, and the same grain on every render', () => {
		render(ObiCord, { roster })
		const first = [...plaques()].map((a) => a.getAttribute('style'))

		expect(new Set(first).size).toBe(roster.length)

		/* a second cord, same people: the grain is seeded from the handle, so a
		   repaint must ink the same boards rather than re-rolling them */
		render(ObiCord, { roster })
		const second = [...plaques()].slice(-roster.length).map((a) => a.getAttribute('style'))

		expect(second).toEqual(first)
	})

	it('hangs the first person read on the rightmost plaque', () => {
		render(ObiCord, { roster })

		/* the roster reads right-to-left, so DOM order is reading order and the
		   layout, not the markup, is what reverses it */
		expect(plaques()[0].href).toContain(roster[0].handle)
	})
})
