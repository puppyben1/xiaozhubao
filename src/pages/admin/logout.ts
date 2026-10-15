import type { APIRoute } from 'astro'
import { ADMIN_COOKIE, sameOrigin } from '@lib/server/admin-auth'

export const prerender = false
export const POST: APIRoute = ({ request, cookies }) => {
  if (!sameOrigin(request.headers.get('origin'), request.headers.get('host'))) {
    return new Response('请求来源无效', { status: 403 })
  }
  cookies.delete(ADMIN_COOKIE, { path: '/' })
  return new Response(null, {
    status: 303,
    headers: { Location: '/admin/login', 'Cache-Control': 'no-store' },
  })
}
