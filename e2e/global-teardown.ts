import { rm } from 'node:fs/promises'

export default async function globalTeardown() {
	const databasePath = process.env.BUTTON_COUNTER_E2E_DB_PATH
	if (!databasePath) return

	await Promise.all(
		[databasePath, `${databasePath}-shm`, `${databasePath}-wal`].map((path) =>
			rm(path, { force: true }),
		),
	)
}
