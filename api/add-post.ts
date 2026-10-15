import { publishingAuthorization } from '../src/lib/server/admin-auth'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createPost } from '../src/lib/server/post-api'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST')
    return res
      .status(405)
      .json({ success: false, message: 'Method not allowed' })
  let body: unknown
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ success: false, message: '请求体无效' })
  }
  const result = await createPost(body, publishingAuthorization(req.headers))
  return res.status(result.status).json(result.body)
}
