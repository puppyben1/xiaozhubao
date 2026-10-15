import assert from 'node:assert/strict'
import { createServer } from 'vite'

const previous = { ...process.env }
const originalFetch = globalThis.fetch
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  resolve: {
    alias: {
      '@lib': new URL('../src/lib', import.meta.url).pathname.replace(
        /^\/([A-Za-z]:)/,
        '$1',
      ),
    },
  },
})
try {
  delete process.env.COMMENTS_REPO
  delete process.env.GITHUB_REPO
  process.env.CONTENT_REPO = 'example/blog'
  process.env.GITHUB_TOKEN = 'test-only'
  const helper = await server.ssrLoadModule(
    '/src/lib/server/comments-github.ts',
  )
  assert.equal(helper.hasCommentsRepo(), true)
  assert.equal(helper.getCommentsRepo().fullName, 'example/blog')
  process.env.COMMENTS_REPO = 'example/comments'
  assert.equal(helper.getCommentsRepo().fullName, 'example/comments')
  delete process.env.COMMENTS_REPO
  const read = await server.ssrLoadModule('/src/pages/api/comments.ts')
  const write = await server.ssrLoadModule('/src/pages/api/submit-comment.ts')
  let writes = 0
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /example\/blog/)
    if (String(url).includes('/search/issues'))
      return Response.json({ total_count: 0, items: [] })
    const body = JSON.parse(String(init?.body))
    assert.equal(init?.method, 'POST')
    writes++
    if (String(url).endsWith('/issues'))
      return Response.json({ number: 1 }, { status: 201 })
    assert.match(body.body, /name: 匿名/)
    assert.match(body.body, /hello/)
    return Response.json({ id: 1 }, { status: 201 })
  }
  const response = await read.ALL({
    request: new Request('https://example.com/api/comments?slug=test'),
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { comments: [], count: 0 })
  const request = () =>
    new Request('https://example.com/api/submit-comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'test', title: 'Test', content: 'hello' }),
    })
  assert.equal((await write.ALL({ request: request() })).status, 200)
  assert.equal(writes, 2)
  globalThis.fetch = async () => Response.json({}, { status: 403 })
  const denied = await write.ALL({ request: request() })
  assert.equal(denied.status, 502)
  assert.match((await denied.json()).error, /Issues: Read and write/)
  console.log(
    'Comments: repository fallback, override, anonymous publish and permission errors passed',
  )
} finally {
  globalThis.fetch = originalFetch
  process.env = previous
  await server.close()
}
