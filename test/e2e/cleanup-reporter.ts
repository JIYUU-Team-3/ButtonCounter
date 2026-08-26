import type { Reporter } from '@playwright/test/reporter'
import { removeDatabase } from './database.ts'

/**
 * Deletes the run's database once the dev server is actually gone.
 *
 * There is no config hook that runs late enough to do this. Playwright orders
 * its teardowns as: globalTeardown, THEN the webServer plugin — so a
 * globalTeardown on Windows is asked to unlink a file the dev server still has
 * open, which is an EBUSY every time. A reporter's `onExit` is the last thing
 * the runner does, after the plugins are torn down, so by then the handle is
 * released and the delete succeeds.
 */
export default class CleanupReporter implements Reporter {
	printsToStdio() {
		return false
	}

	async onExit() {
		const path = process.env.BUTTON_COUNTER_E2E_DB_PATH
		if (!path) return

		/* A killed process can take a moment to give its handles back, so try a
		   few times before leaving it for the next run's sweep. */
		for (let attempt = 0; attempt < 5; attempt++) {
			if (await removeDatabase(path)) return
			await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)))
		}

		console.log('[e2e] database still locked; it will be swept on the next run')
	}
}
