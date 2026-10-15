import assert from 'node:assert/strict'
import { createPost } from '../src/lib/server/post-api.ts'
import { renderMarkdownPreview } from '../src/lib/markdown-preview.ts'
import { createThought } from '../src/lib/server/thought-api.ts'

const originalFetch = globalThis.fetch
const keys = [
  'GITHUB_TOKEN',
  'THOUGHT_API_TOKEN',
  'CONTENT_REPO',
  'GITHUB_REPO',
  'CONTENT_BRANCH',
]
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
let writes = 0
const post = {
  title: '标题 "引号"\n换行',
  content: '## 第一篇\n\n正文',
  slug: 'first-post',
  section: 'notes',
  tags: ['标签"', '换\n行'],
  requestId: '99d2f2f6-47c8-4c11-8cfc-fcc1c8c0dc2b',
}
try {
  for (const key of keys) delete process.env[key]
  assert.equal((await createPost(post, 'Bearer editor-secret')).status, 503)
  assert.equal((await createThought({ content: '动态' }, null)).status, 503)
  process.env.GITHUB_TOKEN = 'test-server-token'
  process.env.THOUGHT_API_TOKEN = 'editor-secret'
  process.env.CONTENT_REPO = 'example/blog'
  process.env.CONTENT_BRANCH = 'main'
  globalThis.fetch = async (url, init) => {
    writes++
    assert.equal(
      String(url),
      'https://api.github.com/repos/example/blog/contents/src/content/posts/web/first-post.md',
    )
    assert.equal(init?.method, 'PUT')
    const payload = JSON.parse(String(init?.body))
    assert.equal(payload.branch, 'main')
    assert.equal(
      payload.sha,
      undefined,
      'New posts must not overwrite existing files',
    )
    const markdown = Buffer.from(payload.content, 'base64').toString('utf8')
    assert.ok(markdown.includes('section: "notes"'))
    assert.ok(markdown.includes('slug: "posts/first-post"'))
    assert.ok(markdown.includes('title: "标题 \\"引号\\"\\n换行"'))
    assert.ok(markdown.endsWith('## 第一篇\n\n正文\n'))
    return Response.json(
      { commit: { html_url: 'https://github.com/example/blog/commit/123' } },
      { status: 201 },
    )
  }
  assert.equal((await createPost(post, null)).status, 401)
  assert.equal((await createPost(post, 'Bearer incorrect')).status, 401)
  for (const invalid of [
    null,
    { ...post, slug: '../escape' },
    { ...post, slug: 'new' },
    { ...post, tags: [1] },
    { ...post, section: 'invalid' },
    { ...post, title: '' },
    { ...post, content: '' },
    { ...post, cover: 'javascript:alert(1)' },
  ]) {
    assert.equal(
      (await createPost(invalid, 'Bearer editor-secret')).status,
      400,
    )
  }
  assert.equal(writes, 0)
  assert.equal((await createThought({ content: '动态' }, null)).status, 401)
  assert.equal(
    (
      await createThought(
        { content: '动态', tags: [1] },
        'Bearer editor-secret',
      )
    ).status,
    400,
  )
  const created = await createPost(post, 'Bearer editor-secret')
  assert.equal(created.status, 201)
  assert.equal(writes, 1)
  globalThis.fetch = async (url, init) => {
    assert.match(
      String(url),
      /\/contents\/src\/content\/thoughts\/\d{4}\/\d{2}\/\d{2}_today\.md$/,
    )
    const payload = JSON.parse(String(init?.body))
    const markdown = Buffer.from(payload.content, 'base64').toString('utf8')
    const tagsLine = markdown
      .split('\n')
      .find((line) => line.startsWith('tags: '))!
    assert.deepEqual(JSON.parse(tagsLine.slice(6)), post.tags)
    return Response.json(
      {
        content: { html_url: 'https://github.com/example/blog/file' },
        commit: {
          sha: '123',
          html_url: 'https://github.com/example/blog/commit/123',
        },
      },
      { status: 201 },
    )
  }
  const thought = await createThought(
    { content: '今天的动态', tags: post.tags, name: 'today' },
    'Bearer editor-secret',
  )
  assert.equal(thought.status, 201)
  globalThis.fetch = async () => Response.json({}, { status: 422 })
  assert.equal((await createPost(post, 'Bearer editor-secret')).status, 409)
  globalThis.fetch = async () => {
    throw new Error('secret transport diagnostics')
  }
  const failure = await createPost(post, 'Bearer editor-secret')
  assert.equal(failure.status, 502)
  assert.ok(!JSON.stringify(failure).includes('secret transport'))

  const preview = renderMarkdownPreview(
    '<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))\n\n![x](https://example.com/a"onerror="x)\n\n```html\n<script>alert(1)</script>\n```\n\n## 标题\n\n- 项目\n- 第二项',
  )
  assert.ok(!preview.includes('<script>'))
  assert.ok(!preview.includes('href="javascript:'))
  assert.ok(!preview.includes(' onerror="'))
  assert.ok(preview.includes('&lt;img'))
  assert.ok(preview.includes('<h2>标题</h2>'))
  assert.ok(preview.includes('<ul>'))
  assert.ok(
    renderMarkdownPreview('`**代码**`').includes('<code>**代码**</code>'),
  )
  console.log(
    'Publishing checks passed: authorization, validation, GitHub write, conflict, failures and escaped preview.',
  )
} finally {
  globalThis.fetch = originalFetch
  for (const key of keys) {
    if (previous[key] === undefined) delete process.env[key]
    else process.env[key] = previous[key]
  }
}
