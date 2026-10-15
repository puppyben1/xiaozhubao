import { defineMiddleware } from 'astro:middleware'
import { hasAdminSession } from './lib/server/admin-auth'

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname.replace(/\/$/, '')
  const protectedPage =
    path === '/admin' || /^\/(posts|moments|photos|thoughts)\/new$/.test(path)
  const adminPage = protectedPage || path.startsWith('/admin/')
  if (
    protectedPage &&
    !hasAdminSession(context.request.headers.get('cookie'))
  ) {
    return new Response(null, {
      status: 303,
      headers: {
        Location: '/admin/login',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  }
  const response = await next()
  if (adminPage) {
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
    response.headers.set('Referrer-Policy', 'same-origin')
  }
  return response
})
