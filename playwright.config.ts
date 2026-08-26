import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { defineConfig, devices } from '@playwright/test'

const databasePath = join(tmpdir(), `button-counter-e2e-${randomUUID()}.db`)

process.env.BUTTON_COUNTER_E2E_DB_PATH = databasePath

export default defineConfig({
	testDir: './e2e',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	globalTeardown: './e2e/global-teardown.ts',
	reporter: [['list'], ['html', { open: 'never' }]],
	use: {
		...devices['Desktop Chrome'],
		baseURL: 'http://127.0.0.1:4174',
		headless: false,
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure',
	},
	projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
	webServer: {
		command: 'npx tsx e2e/prepare-database.ts && npm run dev -- --host 127.0.0.1 --port 4174',
		url: 'http://127.0.0.1:4174',
		reuseExistingServer: false,
		timeout: 120_000,
		env: {
			TURSO_DATABASE_URL: `file:${databasePath}`,
			TURSO_AUTH_TOKEN: '',
		},
	},
})
