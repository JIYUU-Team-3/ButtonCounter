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
	let wake: (() => void) | null = null;
	let latest = 0;
	let seeded = false;

	/* Subscribed BEFORE the opening read, not after the opening yield.
	   Subscribing later leaves a window — the read's own await, and the gap
	   until the consumer comes back for a second value — in which a write is
	   seen by nobody: `latest` still holds the pre-window number, so the reader
	   parks and shows a stale count until the NEXT press happens to wake it. On
	   a busy counter that is invisible; on a quiet one a press appears to do
	   nothing. */
	const unsubscribe = subscribe((value) => {
		latest = value;
		seeded = true;
		wake?.();
	});

	const onAbort = () => wake?.()
	signal.addEventListener('abort', onAbort, { once: true })

	try {
		const initial = await readCount();
		/* checked after the await, never before: a value that arrived while the
		   read was in flight is newer than the read's own result */
		if (!seeded) {
			latest = initial;
			seeded = true;
		}

		let sent = latest;
		yield sent;

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
