import { env } from '$env/dynamic/private'
import { drizzle } from 'drizzle-orm/libsql'

type Database = ReturnType<typeof drizzle>

let instance: Database | null = null

function connect(): Database {
	const rawUrl = env.TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL
	const rawToken = env.TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN
	if (!rawUrl) {
		throw new Error('TURSO_DATABASE_URL is not set')
	}
	const url = rawUrl.trim().replace(/^\uFEFF/, '')
	const authToken = rawToken?.trim().replace(/^\uFEFF/, '')
	return drizzle({
		connection: {
			url,
			authToken,
		},
	})
}

/** Connects on first use, not on import. */
export const db = new Proxy({} as Database, {
	get: (_, prop) => Reflect.get((instance ??= connect()), prop, instance),
})

