import type { APIRoute } from 'astro'
import { hasAdminSession, sameOrigin } from '@lib/server/admin-auth'
import { checkPublishingAccess } from '@lib/server/github-publishing'

export const prerender = false
export const POST: APIRoute = async ({ request }) => {
  const headers = { 'Cache-Control': 'no-store' }
  if (
    !hasAdminSession(request.headers.get('cookie')) ||
    !sameOrigin(request.headers.get('origin'), request.headers.get('host'))
  )
    return Response.json(
      { success: false, message: '请重新登录后检查' },
      { status: 401, headers },
    )
  const result = await checkPublishingAccess()
  return Response.json(result, { headers })
}
