import { env } from '$env/dynamic/private'
import { drizzle } from 'drizzle-orm/d1'

type Database = ReturnType<typeof drizzle>

export const db = new Proxy({} as Database, {
	get: (_, prop) => {
		const d1 = (env as Record<string, any>).DB || (process.env as Record<string, any>).DB
		if (!d1) {
			throw new Error('D1 database binding "DB" is not available')
		}
		const instance = drizzle(d1)
		return Reflect.get(instance, prop, instance)
	},
})
