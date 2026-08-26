import { createClient } from '@libsql/client'

const databaseUrl = process.env.TURSO_DATABASE_URL
if (!databaseUrl) throw new Error('TURSO_DATABASE_URL is not set')

const client = createClient({ url: databaseUrl })
try {
	await client.executeMultiple(`
		CREATE TABLE counts (
			id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			count integer DEFAULT 0 NOT NULL
		);
		INSERT INTO counts (id, count) VALUES (1, 1);
	`)
} finally {
	client.close()
}
