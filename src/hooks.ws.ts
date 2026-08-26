export { message } from 'svelte-realtime/server'

import type { UpgradeContext } from 'svelte-adapter-uws'

export function upgrade({ cookies, requestId }: UpgradeContext) {
	const visitor = cookies.visitor_id
	return {
		id: visitor ?? `anon:${requestId}`,
		durable: Boolean(visitor),
	}
}
