import { createClient } from '@libsql/client'

const databaseUrl = process.env.TURSO_DATABASE_URL
if (!databaseUrl) throw new Error('TURSO_DATABASE_URL is not set')

const client = createClient({ url: databaseUrl })
try {
	/* Idempotent: a run that reuses a database file — a retried webServer
	   start, or a sweep that could not remove the last one — must find the
	   schema it expects rather than dying on "table counts already exists". */
	await client.executeMultiple(`
		CREATE TABLE IF NOT EXISTS counts (
			id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			count integer DEFAULT 0 NOT NULL
		);
		INSERT OR IGNORE INTO counts (id, count) VALUES (1, 1);
	`)
} finally {
	client.close()
}
