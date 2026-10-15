import { publishingAuthorization } from '@lib/server/admin-auth'
import type { APIRoute } from 'astro'
import { createThought } from '@lib/server/thought-api'

export const prerender = false
export const POST: APIRoute = async ({ request }) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { success: false, message: '请求体无效' },
      { status: 400 },
    )
  }
  const result = await createThought(
    body,
    publishingAuthorization(request.headers),
  )
  return Response.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  })
}
