import assert from 'node:assert/strict'
import sharp from 'sharp'
import {
  uploadRepositoryImage,
  MAX_IMAGE_BYTES,
} from '../src/lib/server/image-api.ts'
import { createUploadSign } from '../src/lib/server/upload-api.ts'
import { readApiResponse } from '../src/lib/api-response.ts'
import { webApiContext } from '../src/lib/server/web-api-context.ts'

const originalFetch = globalThis.fetch
const previous = { ...process.env }
try {
  const { req, res } = await webApiContext(
    new Request('https://example.com/api/likes?ids=a&ids=b', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"fingerprint":"abc"}',
    }),
  )
  assert.deepEqual(req.query.ids, ['a', 'b'])
  assert.deepEqual(req.body, { fingerprint: 'abc' })
  res.setHeader('Cache-Control', 'no-store')
  const adapted = res.status(429).json({ error: 'limited' })
  assert.equal(adapted.status, 429)
  assert.equal(adapted.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(await adapted.json(), { error: 'limited' })
  process.env.GITHUB_TOKEN = 'test-only'
  process.env.THOUGHT_API_TOKEN = 'test-only'
  process.env.CONTENT_REPO = 'example/blog'
  const image = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#ace' },
  })
    .png()
    .toBuffer()
  const request = (
    body: Uint8Array = image,
    headers: Record<string, string> = {},
  ) =>
    new Request('https://example.com/api/upload-image?folder=albums', {
      method: 'POST',
      body: new Uint8Array(body),
      headers: { 'Content-Type': 'image/png', ...headers },
    })
  let writes = 0
  globalThis.fetch = async (url, init) => {
    writes++
    assert.match(
      String(url),
      /\/contents\/public\/uploads\/albums\/[a-f0-9-]+\.webp$/,
    )
    const payload = JSON.parse(String(init?.body))
    assert.equal(payload.sha, undefined)
    const metadata = await sharp(
      Buffer.from(payload.content, 'base64'),
    ).metadata()
    assert.equal(metadata.format, 'webp')
    assert.equal(metadata.exif, undefined)
    return Response.json({ commit: { sha: 'a'.repeat(40) } }, { status: 201 })
  }
  assert.equal((await uploadRepositoryImage(request(), null)).status, 401)
  assert.equal((await createUploadSign({}, null)).status, 401)
  assert.equal(
    (
      await uploadRepositoryImage(
        request(image, { 'Content-Length': String(MAX_IMAGE_BYTES + 1) }),
        'Bearer test-only',
      )
    ).status,
    413,
  )
  assert.equal(
    (
      await uploadRepositoryImage(
        request(new Uint8Array(MAX_IMAGE_BYTES + 1)),
        'Bearer test-only',
      )
    ).status,
    413,
  )
  assert.equal(
    (
      await uploadRepositoryImage(
        request(Buffer.from('not an image')),
        'Bearer test-only',
      )
    ).status,
    400,
  )
  assert.equal(writes, 0)
  const result = await uploadRepositoryImage(request(), 'Bearer test-only')
  assert.equal(result.status, 201)
  assert.match(
    JSON.stringify(result.body),
    /raw.githubusercontent.com\/example\/blog\/a{40}\/public\/uploads/,
  )
  assert.equal(writes, 1)
  globalThis.fetch = async () => Response.json({}, { status: 403 })
  assert.equal(
    (await uploadRepositoryImage(request(), 'Bearer test-only')).status,
    502,
  )
  await assert.rejects(
    readApiResponse(
      new Response('A server error has occurred', { status: 500 }),
    ),
    /HTTP 500/,
  )
  await assert.rejects(readApiResponse(Response.json(null)), /无效结果/)
  console.log(
    'Image checks passed: auth, bounded input, decode, WebP write, GitHub failures and non-JSON responses.',
  )
} finally {
  globalThis.fetch = originalFetch
  for (const key of ['GITHUB_TOKEN', 'THOUGHT_API_TOKEN', 'CONTENT_REPO']) {
    if (previous[key] === undefined) delete process.env[key]
    else process.env[key] = previous[key]
  }
}
