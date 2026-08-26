import { databasePath, sweepDatabases } from './database.ts'

export default async function globalSetup() {
	/* Windows cannot delete a database the dev server still has open, so the
	   previous run may have had to leave one behind. It is unlocked now. */
	const swept = await sweepDatabases(databasePath())
	if (swept > 0) console.log(`[e2e] swept ${swept} leftover database file(s)`)
}
