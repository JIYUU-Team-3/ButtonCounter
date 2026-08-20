import { env } from '$env/dynamic/private';
import { drizzle } from 'drizzle-orm/libsql';

type Database = ReturnType<typeof drizzle>;

let instance: Database | null = null;

function connect(): Database {
	if (!env.TURSO_DATABASE_URL) {
		throw new Error('TURSO_DATABASE_URL is not set');
	}
	return drizzle({
		connection: {
			url: env.TURSO_DATABASE_URL,
			authToken: env.TURSO_AUTH_TOKEN
		}
	});
}
/** Connects on first use, not on import. */
export const db = new Proxy({} as Database, {
	get: (_, prop) => Reflect.get((instance ??= connect()), prop, instance)
});
