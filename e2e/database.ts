import { randomUUID } from 'node:crypto'
import { readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/* One throwaway SQLite file per run, in the OS temp dir. The prefix is what
   makes the leftovers findable later — see sweepDatabases. */
const PREFIX = 'button-counter-e2e-'

/** The database plus the sidecars SQLite keeps beside it in WAL mode. */
function filesOf(path: string): string[] {
	return [path, `${path}-shm`, `${path}-wal`]
}

/**
 * Where this run's database lives.
 *
 * The config module is evaluated once per PROCESS — the runner, and again in
 * every worker — so minting a fresh uuid at module scope hands the workers a
 * different path than the one the server was started with. The first process
 * to ask publishes its choice through the environment, which every child
 * inherits, so the whole run agrees on one file.
 */
export function databasePath(): string {
	const chosen = (process.env.BUTTON_COUNTER_E2E_DB_PATH ||= join(
		tmpdir(),
		`${PREFIX}${randomUUID()}.db`,
	))
	return chosen
}

/**
 * Delete a run's database if the OS will let us.
 *
 * Windows will not: an open handle makes the file undeletable, and Playwright
 * runs globalTeardown BEFORE it stops the webServer, so the dev server still
 * holds the connection open at that moment. Failing here would fail an
 * otherwise green run over a temp file, so this reports rather than throws —
 * whatever survives is swept at the start of the next run.
 */
export async function removeDatabase(path: string): Promise<boolean> {
	const results = await Promise.all(
		filesOf(path).map(async (file) => {
			try {
				await rm(file, { force: true })
				return true
			} catch {
				return false
			}
		}),
	)
	return results.every(Boolean)
}

/**
 * Clear out databases left behind by earlier runs.
 *
 * Safe to take everything that is not this run's own file: the webServer binds
 * a fixed port with reuseExistingServer off, so a second run cannot be in
 * flight beside this one. Anything still locked is skipped and picked up by a
 * later sweep.
 */
export async function sweepDatabases(current: string): Promise<number> {
	const dir = tmpdir()
	const keep = new Set(filesOf(current))

	let entries: string[]
	try {
		entries = await readdir(dir)
	} catch {
		return 0
	}

	const stale = entries
		.filter((name) => name.startsWith(PREFIX))
		.map((name) => join(dir, name))
		.filter((path) => !keep.has(path))

	const removed = await Promise.all(
		stale.map(async (path) => {
			try {
				await rm(path, { force: true })
				return 1
			} catch {
				return 0
			}
		}),
	)
	return removed.reduce<number>((a, b) => a + b, 0)
}
