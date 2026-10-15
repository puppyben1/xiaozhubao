import { publishingAuthorization } from '../src/lib/server/admin-auth'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createAlbum, type AlbumRequest } from '../src/lib/server/album-api'
import { setCorsHeaders } from '../src/lib/server/api-utils'

function parseBody(req: VercelRequest): AlbumRequest {
  if (typeof req.body === 'string') {
    return JSON.parse(req.body) as AlbumRequest
  }

  return (req.body || {}) as AlbumRequest
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  setCorsHeaders(req, res, 'POST, OPTIONS', 'Content-Type, Authorization')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Max-Age', '86400')
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed' })
    return
  }

  try {
    const result = await createAlbum(
      parseBody(req),
      publishingAuthorization(req.headers),
    )
    res.status(result.status).json(result.body)
  } catch {
    res.status(400).json({ success: false, message: '请求体无效' })
  }
}
