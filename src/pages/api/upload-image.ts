import type { APIRoute } from 'astro'
import { publishingAuthorization } from '@lib/server/admin-auth'
import { uploadRepositoryImage } from '@lib/server/image-api'

export const prerender = false
export const POST: APIRoute = async ({ request }) => {
  const result = await uploadRepositoryImage(
    request,
    publishingAuthorization(request.headers),
  )
  return Response.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  })
}
