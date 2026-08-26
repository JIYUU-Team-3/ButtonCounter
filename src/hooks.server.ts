import type { Handle } from '@sveltejs/kit'
import { dev } from '$app/environment'
// import { getTextDirection } from '$lib/paraglide/runtime';
// import { paraglideMiddleware } from '$lib/paraglide/server';

// const handleParaglide: Handle = ({ event, resolve }) => paraglideMiddleware(event.request, ({ request, locale }) => {
// 	event.request = request;

// 	return resolve(event, {
// 		transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale).replace('%paraglide.dir%', getTextDirection(locale))
// 	});
// });

export const handle: Handle = async ({ event, resolve }) => {
	if (!event.cookies.get('visitor_id')) {
		event.cookies.set('visitor_id', crypto.randomUUID(), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: !dev,
			maxAge: 60 * 60 * 24 * 365,
		})
	}
	return resolve(event)
}
