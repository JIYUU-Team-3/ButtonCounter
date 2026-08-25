import { eq, sql } from 'drizzle-orm'
import { counts } from '../../../migrations/schema.ts'
import { db } from './db.ts'

const COUNTER_ID = 1

type Listener = (value: number) => void

const listeners = new Set<Listener>()

let loaded: Promise<number> | null = null

async function load(): Promise<number> {
	const [row] = await db
		.select({ count: counts.count })
		.from(counts)
		.where(eq(counts.id, COUNTER_ID))

	if (row) return row.count

	await db.insert(counts).values({ id: COUNTER_ID, count: 0 }).onConflictDoNothing()
	return 0
}

export function readCount(): Promise<number> {
	return (loaded ??= load())
}

export async function incrementCount(): Promise<number> {
	const [row] = await db
		.update(counts)
		.set({ count: sql`${counts.count} + 1` })
		.where(eq(counts.id, COUNTER_ID))
		.returning({ count: counts.count })

	if (!row) {
		await readCount()
		return incrementCount()
	}

	const value = row.count
	loaded = Promise.resolve(value)

	for (const listener of listeners) listener(value)

	return value
}

function subscribe(listener: Listener): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

export async function* watchCount(signal: AbortSignal): AsyncGenerator<number> {
	let latest = await readCount()
	let sent = latest

	yield latest

	let wake: (() => void) | null = null

	const unsubscribe = subscribe((value) => {
		latest = value
		wake?.()
	})

	const onAbort = () => wake?.()
	signal.addEventListener('abort', onAbort, { once: true })

	try {
		while (!signal.aborted) {
			if (latest === sent) {
				await new Promise<void>((resolve) => (wake = resolve))
				wake = null
			}

			if (signal.aborted) break

			sent = latest
			yield sent
		}
	} finally {
		signal.removeEventListener('abort', onAbort)
		unsubscribe()
	}
}
