import { eq, sql } from 'drizzle-orm'
import { counts } from '../../../migrations/schema.ts'
import { db } from './db.ts'

const COUNTER_ID = 1

type Listener = (value: number) => void

const listeners = new Set<Listener>()

async function load(): Promise<number> {
	try {
		const [row] = await db
			.select({ count: counts.count })
			.from(counts)
			.where(eq(counts.id, COUNTER_ID))

		if (row) return row.count

		await db.insert(counts).values({ id: COUNTER_ID, count: 0 }).onConflictDoNothing()
		return 0
	} catch (e) {
		console.error('load count error:', e)
		throw e
	}
}

export function readCount(): Promise<number> {
	return load()
}

export async function incrementCount(): Promise<number> {
	const [row] = await db
		.update(counts)
		.set({ count: sql`${counts.count} + 1` })
		.where(eq(counts.id, COUNTER_ID))
		.returning({ count: counts.count })

	if (!row) {
		await load()
		const [reRow] = await db
			.update(counts)
			.set({ count: sql`${counts.count} + 1` })
			.where(eq(counts.id, COUNTER_ID))
			.returning({ count: counts.count })
		const value = reRow?.count ?? 1
		for (const listener of listeners) listener(value)
		return value
	}

	const value = row.count
	for (const listener of listeners) listener(value)
	return value
}

function subscribe(listener: Listener): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal.aborted) return resolve()
		const timer = setTimeout(resolve, ms)
		signal.addEventListener(
			'abort',
			() => {
				clearTimeout(timer)
				resolve()
			},
			{ once: true },
		)
	})
}

export async function* watchCount(signal: AbortSignal): AsyncGenerator<number> {
	let wake: (() => void) | null = null
	let latest = 0
	let seeded = false

	const unsubscribe = subscribe((value) => {
		latest = value
		seeded = true
		wake?.()
	})

	const onAbort = () => wake?.()
	signal.addEventListener('abort', onAbort, { once: true })

	try {
		const initial = await readCount()
		if (!seeded) {
			latest = initial
			seeded = true
		}

		let sent = latest
		yield sent

		while (!signal.aborted) {
			if (latest === sent) {
				await Promise.race([
					new Promise<void>((resolve) => {
						wake = resolve
					}),
					sleep(2500, signal),
				])
				wake = null

				if (signal.aborted) break

				try {
					const current = await load()
					if (current !== latest) {
						latest = current
					}
				} catch {}
			}

			if (signal.aborted) break

			if (latest !== sent) {
				sent = latest
				yield sent
			}
		}
	} finally {
		signal.removeEventListener('abort', onAbort)
		unsubscribe()
	}
}
