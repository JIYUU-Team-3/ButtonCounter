export { message } from 'svelte-realtime/server'

import type { UpgradeContext } from 'svelte-adapter-uws';

export function upgrade({ cookies, requestId }: UpgradeContext) {
    const vistor = cookies.visitor_id;
    return {
        id: vistor ?? 'anon:${requestId}',
        durable: Boolean(vistor)
    };
};