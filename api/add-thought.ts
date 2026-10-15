import { publishingAuthorization } from '../src/lib/server/admin-auth'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createThought } from '../src/lib/server/thought-api'
import { getSiteUrl, setCorsHeaders } from '../src/lib/server/api-utils'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res, 'GET, POST, OPTIONS', 'Content-Type, Authorization')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method === 'GET')
    return res.status(200).json({
      name: 'Astro Doge Add Thought API',
      version: '1.0.0',
      description:
        'Create a new thought entry and commit it to your content repo.',
      endpoint: '/api/add-thought',
      method: 'POST',
      site: getSiteUrl(),
      timeZone: process.env.SITE_TIMEZONE?.trim() || 'UTC',
      contentDirectory:
        process.env.THOUGHTS_CONTENT_DIR?.trim() || 'src/content/thoughts',
      requiredEnv: [
        'GITHUB_TOKEN',
        'CONTENT_REPO or GITHUB_REPO',
        'CONTENT_BRANCH',
        'THOUGHT_API_TOKEN',
      ],
    })
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
  const result = await createThought(body, publishingAuthorization(req.headers))
  return res.status(result.status).json(result.body)
}
