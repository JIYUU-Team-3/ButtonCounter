import { expect, test, type Page } from '@playwright/test'

const countValue = (page: Page) => page.getByTestId('count-value')
const pressButton = (page: Page) => page.getByRole('button', { name: /press/i })

async function openCounter(page: Page) {
	await page.goto('/')
	await expect(pressButton(page)).toBeEnabled()
	await expect(countValue(page)).toHaveText(/^\d[\d,]*$/)
}

async function readCount(page: Page) {
	return Number((await countValue(page).innerText()).replaceAll(',', ''))
}

async function performIncrement(page: Page, action: () => Promise<void>) {
	const before = await readCount(page)
	const completed = page.waitForResponse(
		(response) => response.request().method() === 'POST' && response.ok(),
	)

	await action()
	await completed
	await expect.poll(() => readCount(page)).toBe(before + 1)

	return before + 1
}

test.describe.configure({ mode: 'serial' })

test('loads the shared counter', async ({ page }) => {
	await openCounter(page)
	await expect(page.getByRole('heading', { name: /button counter/i })).toBeVisible()
})

test('increments on click and persists after reload', async ({ page }) => {
	await openCounter(page)
	const incremented = await performIncrement(page, () => pressButton(page).click())

	await page.reload()
	await expect(pressButton(page)).toBeEnabled()
	await expect.poll(() => readCount(page)).toBe(incremented)
})

test('increments with Enter and Space', async ({ page }) => {
	await openCounter(page)
	await performIncrement(page, () => page.keyboard.press('Enter'))
	await performIncrement(page, () => page.keyboard.press('Space'))
})

test('synchronizes independent browser contexts', async ({ browser, page }) => {
	const secondContext = await browser.newContext()
	const secondPage = await secondContext.newPage()

	try {
		await Promise.all([openCounter(page), openCounter(secondPage)])
		const start = await readCount(page)
		await expect.poll(() => readCount(secondPage)).toBe(start)

		await performIncrement(page, () => pressButton(page).click())
		await expect.poll(() => readCount(secondPage)).toBe(start + 1)

		await performIncrement(secondPage, () => pressButton(secondPage).click())
		await expect.poll(() => readCount(page)).toBe(start + 2)
	} finally {
		await secondContext.close()
	}
})

test('catches up after reconnecting without a reload', async ({ browser, page }) => {
	const offlineContext = await browser.newContext()
	const offlinePage = await offlineContext.newPage()

	try {
		await Promise.all([openCounter(page), openCounter(offlinePage)])
		const start = await readCount(page)
		await expect.poll(() => readCount(offlinePage)).toBe(start)

		await offlineContext.setOffline(true)
		await performIncrement(page, () => pressButton(page).click())
		await expect.poll(() => readCount(offlinePage)).toBe(start)

		await offlineContext.setOffline(false)
		await expect.poll(() => readCount(offlinePage), { timeout: 30_000 }).toBe(start + 1)
	} finally {
		await offlineContext.close()
	}
})
