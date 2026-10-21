import assert from 'node:assert/strict'
import path from 'node:path'
import {
  collectContentImageProblems,
  type ContentImageEntry,
} from '../src/lib/content-images.ts'

const contentDir = path.resolve('src/content')
const publicDir = path.resolve('public')
const entryPath = path.join(contentDir, 'posts', 'web', 'test.md')
const existing = new Set([
  path.join(contentDir, 'posts', 'web', 'pic.png'),
  path.join(contentDir, 'posts', 'images', 'shared.png'),
  path.join(publicDir, 'uploads', 'posts', 'pic.webp'),
])
const exists = (file: string) => existing.has(file)
const entry = (text: string): ContentImageEntry => ({
  file: 'src/content/posts/web/test.md',
  absolutePath: entryPath,
  text,
})
const scan = (text: string) =>
  collectContentImageProblems([entry(text)], {
    contentDir,
    publicDir,
    exists,
  })

assert.deepEqual(scan('![x](pic.png)').problems, [])
assert.deepEqual(scan('![x](../images/shared.png)').problems, [])
assert.deepEqual(scan('![x](pic.png "title")').problems, [])
assert.deepEqual(scan('![x](/uploads/posts/pic.webp)').problems, [])

const missing = scan('![x](missing.png)')
assert.equal(missing.problems.length, 1)
assert.equal(missing.problems[0].line, 1)
assert.match(missing.problems[0].reason, /不存在/)

const outside = scan('![x](../../../../public/uploads/posts/pic.webp)')
assert.equal(outside.problems.length, 1)
assert.match(outside.problems[0].reason, /src\/content/)

const missingPublic = scan('![x](/uploads/posts/missing.webp)')
assert.equal(missingPublic.problems.length, 1)
assert.match(missingPublic.problems[0].reason, /public\//)

assert.deepEqual(scan('![x](https://example.com/a.png)'), {
  problems: [],
  local: 0,
  external: 1,
})
assert.deepEqual(scan('```md\n![x](missing.png)\n```').problems, [])
assert.deepEqual(scan('example: `![x](missing.png)`').problems, [])
assert.deepEqual(scan('```md\r\n![x](missing.png)\r\n```').problems, [])

// A four-backtick fence containing a three-backtick block must not desync.
const nested = scan(
  '````md\n```ts\n![x](missing.png)\n```\n````\n![x](/uploads/posts/pic.webp)',
)
assert.deepEqual(nested.problems, [])
assert.equal(nested.local, 1)

assert.equal(scan('<img src="missing.png">').problems.length, 1)
assert.deepEqual(scan('<img src="https://example.com/a.png">').problems, [])

const multiline = scan('line one\n\n![x](missing.png)')
assert.equal(multiline.problems[0].line, 3)

console.log(
  'Content image checks passed: relative, site-absolute, external, fence, inline-code and HTML cases.',
)
