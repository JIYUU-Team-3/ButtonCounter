import { beforeEach, describe, expect, it, vi } from 'vitest'

// 単体テスト
const fake = vi.hoisted(() => {
	const rows = new Map<number, number>()
	const calls = { select: 0, insert: 0, update: 0 }

	let missingUpdates = 0

	let gate: Promise<void> | null = null
	let open: (() => void) | null = null

	const db = {
		select: () => {
			calls.select++
			return {
				from: () => ({
					where: async () => {
						const seen = rows.has(1) ? [{ count: rows.get(1)! }] : []
						if (gate) await gate
						return seen
					},
				}),
			}
		},
		insert: () => ({
			values: (row: { id: number; count: number }) => ({
				onConflictDoNothing: async () => {
					calls.insert++
					if (!rows.has(row.id)) rows.set(row.id, row.count)
				},
			}),
		}),
		update: () => ({
			set: () => ({
				where: () => ({
					returning: async () => {
						calls.update++
						if (missingUpdates > 0) {
							missingUpdates--
							return []
						}
						if (!rows.has(1)) return []
						const next = rows.get(1)! + 1
						rows.set(1, next)
						return [{ count: next }]
					},
				}),
			}),
		}),
	}

	return {
		db,
		rows,
		calls,
		missNextUpdates(n: number) {
			missingUpdates = n
		},
		holdReads() {
			gate = new Promise<void>((resolve) => (open = resolve))
			return () => {
				open?.()
				gate = null
				open = null
			}
		},
		reset() {
			rows.clear()
			calls.select = calls.insert = calls.update = 0
			missingUpdates = 0
			gate = null
			open = null
		},
	}
})

vi.mock('$lib/server/db', () => ({ db: fake.db }))

async function freshCounter() {
	vi.resetModules()
	return import('$lib/server/counter')
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function pending(promise: Promise<unknown>): Promise<boolean> {
	const marker = Symbol('pending')
	const raced = await Promise.race([
		promise,
		new Promise((resolve) => setTimeout(() => resolve(marker), 25)),
	])
	return raced === marker
}

beforeEach(() => {
	fake.reset()
})

describe('readCount', () => {
	it('reads the stored count', async () => {
		fake.rows.set(1, 42)
		const { readCount } = await freshCounter()

		await expect(readCount()).resolves.toBe(42)
	})

	it('seeds the row at zero when the table is empty', async () => {
		const { readCount } = await freshCounter()

		await expect(readCount()).resolves.toBe(0)
		expect(fake.rows.get(1)).toBe(0)
	})

	it('does not clobber a row another process inserted first', async () => {
		const { readCount } = await freshCounter()
		await readCount()

		expect(fake.calls.insert).toBe(1)
		/* the insert is onConflictDoNothing, so a racing writer keeps its value */
		fake.rows.set(1, 7)
		const again = await freshCounter()
		await expect(again.readCount()).resolves.toBe(7)
	})
})

describe('incrementCount', () => {
	it('returns the value it wrote', async () => {
		fake.rows.set(1, 9)
		const { incrementCount } = await freshCounter()

		await expect(incrementCount()).resolves.toBe(10)
		expect(fake.rows.get(1)).toBe(10)
	})

	it('increments in the database, not in memory', async () => {
		fake.rows.set(1, 0)
		const { incrementCount } = await freshCounter()

		await Promise.all([incrementCount(), incrementCount(), incrementCount()])

		expect(fake.rows.get(1)).toBe(3)
	})

	it('seeds the row and retries when there is nothing to update', async () => {
		const { incrementCount } = await freshCounter()
		fake.missNextUpdates(1)

		await expect(incrementCount()).resolves.toBe(1)
		expect(fake.calls.insert).toBe(1)
		expect(fake.calls.update).toBe(2)
	})
})

describe('watchCount', () => {
	it('opens with the current value', async () => {
		fake.rows.set(1, 5)
		const { watchCount } = await freshCounter()
		const stream = watchCount(new AbortController().signal)

		await expect(stream.next()).resolves.toMatchObject({ value: 5, done: false })
	})

	it('pushes every increment to a waiting reader', async () => {
		fake.rows.set(1, 0)
		const { watchCount, incrementCount } = await freshCounter()
		const stream = watchCount(new AbortController().signal)
		await stream.next()

		const next = stream.next()
		await incrementCount()

		await expect(next).resolves.toMatchObject({ value: 1, done: false })
	})

	it('feeds several readers from one increment', async () => {
		fake.rows.set(1, 0)
		const { watchCount, incrementCount } = await freshCounter()
		const a = watchCount(new AbortController().signal)
		const b = watchCount(new AbortController().signal)
		await Promise.all([a.next(), b.next()])

		const both = Promise.all([a.next(), b.next()])
		await incrementCount()

		await expect(both).resolves.toMatchObject([{ value: 1 }, { value: 1 }])
	})

	it('ends when the request is aborted', async () => {
		fake.rows.set(1, 3)
		const { watchCount } = await freshCounter()
		const controller = new AbortController()
		const stream = watchCount(controller.signal)
		await stream.next()

		controller.abort()

		await expect(stream.next()).resolves.toMatchObject({ done: true })
	})

	it('releases a reader that is parked waiting for a change', async () => {
		fake.rows.set(1, 3)
		const { watchCount } = await freshCounter()
		const controller = new AbortController()
		const stream = watchCount(controller.signal)
		await stream.next()

		const parked = stream.next()
		expect(await pending(parked)).toBe(true)

		controller.abort()

		await expect(parked).resolves.toMatchObject({ done: true })
	})

	it('ends immediately when handed an already-aborted signal', async () => {
		fake.rows.set(1, 3)
		const { watchCount } = await freshCounter()
		const controller = new AbortController()
		controller.abort()
		const stream = watchCount(controller.signal)

		/* the opening value is unconditional — a client that connected gets the
		   number once even if it hung up in the same tick */
		await expect(stream.next()).resolves.toMatchObject({ value: 3, done: false })
		await expect(stream.next()).resolves.toMatchObject({ done: true })
	})
})

// 回帰テスト
describe('regression', () => {
	it('loads the count once, however many callers ask for it', async () => {
		fake.rows.set(1, 12)
		const { readCount } = await freshCounter()

		await Promise.all([readCount(), readCount(), readCount()])
		await readCount()

		expect(fake.calls.select).toBe(1)
	})

	it('shares the in-flight load rather than starting a second one', async () => {
		fake.rows.set(1, 12)
		const { readCount } = await freshCounter()

		const [a, b] = await Promise.all([readCount(), readCount()])

		expect([a, b]).toEqual([12, 12])
		expect(fake.calls.select).toBe(1)
	})

	it('refreshes the cache from a write instead of re-reading', async () => {
		fake.rows.set(1, 0)
		const { readCount, incrementCount } = await freshCounter()
		await readCount()
		const selects = fake.calls.select

		await incrementCount()

		await expect(readCount()).resolves.toBe(1)
		expect(fake.calls.select).toBe(selects)
	})

	it('opens a new stream from the cache, not from the database', async () => {
		fake.rows.set(1, 4)
		const { watchCount } = await freshCounter()
		await watchCount(new AbortController().signal).next()
		await watchCount(new AbortController().signal).next()

		expect(fake.calls.select).toBe(1)
	})

	it('does not re-send a value the reader already has', async () => {
		fake.rows.set(1, 0)
		const { watchCount } = await freshCounter()
		const stream = watchCount(new AbortController().signal)
		await stream.next()

		/* nothing has changed, so the second read must park rather than repeat 0 */
		expect(await pending(stream.next())).toBe(true)
	})

	it('drops its listener when a reader disconnects, so a rebuild is not fed twice', async () => {
		fake.rows.set(1, 0)
		const { watchCount, incrementCount } = await freshCounter()

		const gone = new AbortController()
		const stream = watchCount(gone.signal)
		await stream.next()
		gone.abort()
		await stream.next()
		await flush()

		const live = watchCount(new AbortController().signal)
		await live.next()
		const next = live.next()
		await incrementCount()

		/* the surviving reader still gets exactly the next value */
		await expect(next).resolves.toMatchObject({ value: 1, done: false })
	})

	it('does not miss a write that lands before the reader comes back', async () => {
		fake.rows.set(1, 0)
		const { watchCount, incrementCount } = await freshCounter()
		const stream = watchCount(new AbortController().signal)
		await stream.next()

		/* the press happens in the gap between the opening value and the
		   consumer asking for the next one — nobody is parked on the stream.
		   Subscribing only once a reader parks lost this write outright: the
		   stream sat on a stale count until some later press woke it. */
		await incrementCount()

		await expect(stream.next()).resolves.toMatchObject({ value: 1, done: false })
	})

	it('does not miss a write that lands while the opening read is in flight', async () => {
		fake.rows.set(1, 0)
		const { watchCount, incrementCount } = await freshCounter()

		const release = fake.holdReads()
		const stream = watchCount(new AbortController().signal)
		const opening = stream.next()
		await flush()

		await incrementCount()
		release()

		/* the held read comes back with 0, but 1 is newer — the opening value
		   must be the later of the two, not whichever resolved last */
		await expect(opening).resolves.toMatchObject({ value: 1, done: false })
	})

	it('still opens on the stored count when nothing is racing the read', async () => {
		fake.rows.set(1, 6)
		const { watchCount } = await freshCounter()

		await expect(watchCount(new AbortController().signal).next()).resolves.toMatchObject({
			value: 6,
			done: false,
		})
	})

	it('parks after an opening value it received from a write, not a read', async () => {
		fake.rows.set(1, 0)
		const { watchCount, incrementCount } = await freshCounter()
		const stream = watchCount(new AbortController().signal)
		await stream.next()
		await incrementCount()
		await stream.next()

		/* opened at 1 by the racing write; 1 is still current, so the next read
		   must park rather than repeat it */
		expect(await pending(stream.next())).toBe(true)
	})

	it('resumes at the current value after a burst, not once per write', async () => {
		fake.rows.set(1, 0)
		const { watchCount, incrementCount } = await freshCounter()
		const stream = watchCount(new AbortController().signal)
		await stream.next()

		const parked = stream.next()
		await flush()
		await incrementCount()
		await expect(parked).resolves.toMatchObject({ value: 1, done: false })

		/* two more land while the reader is between reads. It is a live view of
		   one number, not a queue of events, so it comes back at 3 — a reader
		   that fell behind must never be walked through the values it missed. */
		await incrementCount()
		await incrementCount()

		await expect(stream.next()).resolves.toMatchObject({ value: 3, done: false })
	})
})
