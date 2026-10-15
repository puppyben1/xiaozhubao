import { publishingAuthorization } from '@lib/server/admin-auth'
import type { APIRoute } from 'astro'
import {
  createUploadSign,
  type UploadSignRequest,
} from '@lib/server/upload-api'

export const prerender = false

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

export const OPTIONS: APIRoute = () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  })

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json()) as UploadSignRequest
    const result = await createUploadSign(
      body,
      publishingAuthorization(request.headers),
    )

    return jsonResponse(result.body, result.status)
  } catch {
    return jsonResponse({ success: false, message: '请求体无效' }, 400)
  }
}
