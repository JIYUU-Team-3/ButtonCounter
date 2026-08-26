import { command, getRequestEvent, query } from '$app/server'
import { incrementCount, watchCount } from '../../lib/server/counter.ts'

export const getCount = query.live(() => watchCount(getRequestEvent().request.signal))

export const increment = command(async () => {
	await incrementCount()
})
