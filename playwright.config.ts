import { defineConfig, devices } from '@playwright/test'
import { databasePath } from './test/e2e/database.ts'

const database = databasePath()

export default defineConfig({
	testDir: './test/e2e',
	/* One shared counter behind every test, so they run one at a time. */
	fullyParallel: false,
	workers: 1,
	/* The reconnect test waits on a real socket coming back; give CI a second
	   go at it rather than failing a branch on network timing. */
	retries: process.env.CI ? 2 : 0,
	globalSetup: './test/e2e/global-setup.ts',
	/* Cleanup lives in a reporter, not in globalTeardown — see the note in
	   test/e2e/cleanup-reporter.ts for why globalTeardown is too early. */
	reporter: [['list'], ['html', { open: 'never' }], ['./test/e2e/cleanup-reporter.ts']],
	use: {
		...devices['Desktop Chrome'],
		baseURL: 'http://127.0.0.1:4174',
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure',
	},
	projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
	webServer: {
		/* vite directly, not `npm run dev`: one less process in the tree for
		   Playwright to kill, which is one less thing holding the database open
		   after the run. */
		command: `npx tsx test/e2e/prepare-database.ts && npx vite dev --host 127.0.0.1 --port 4174`,
		url: 'http://127.0.0.1:4174',
		reuseExistingServer: false,
		timeout: 120_000,
		env: {
			TURSO_DATABASE_URL: `file:${database}`,
			TURSO_AUTH_TOKEN: '',
		},
	},
})
