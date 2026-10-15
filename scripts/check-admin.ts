import assert from 'node:assert/strict'
import {
  adminConfigured,
  validAdminPassword,
  validAdminCredentials,
  createAdminSession,
  hasAdminSession,
  publishingAuthorization,
  SESSION_SECONDS,
} from '../src/lib/server/admin-auth.ts'

const previous = {
  password: process.env.ADMIN_PASSWORD,
  username: process.env.ADMIN_USERNAME,
  token: process.env.THOUGHT_API_TOKEN,
}
try {
  delete process.env.ADMIN_PASSWORD
  assert.equal(adminConfigured(), false)
  assert.equal(validAdminPassword(''), false)
  assert.equal(hasAdminSession('blog_admin=anything'), false)
  assert.throws(() => createAdminSession())
  process.env.ADMIN_PASSWORD = 'test-only-admin-password'
  process.env.ADMIN_USERNAME = 'puppyben'
  process.env.THOUGHT_API_TOKEN = 'test-only-server-publishing-token'
  assert.equal(validAdminPassword('wrong'), false)
  assert.equal(validAdminPassword(process.env.ADMIN_PASSWORD), true)
  assert.equal(
    validAdminCredentials('puppyben', process.env.ADMIN_PASSWORD),
    true,
  )
  assert.equal(
    validAdminCredentials('wrong-user', process.env.ADMIN_PASSWORD),
    false,
  )
  assert.equal(validAdminCredentials('puppyben', 'wrong-password'), false)
  const now = 1792000000000
  const session = createAdminSession(now)
  const cookie = `other=abc; blog_admin=${session}`
  assert.equal(hasAdminSession(cookie, now), true)
  assert.equal(hasAdminSession(cookie, now + SESSION_SECONDS * 1000), false)
  assert.equal(
    hasAdminSession(cookie.replace('blog_admin=', 'blog_admin=9'), now),
    false,
  )
  assert.equal(
    hasAdminSession(`blog_admin=${session.slice(0, -1)}!`, now),
    false,
  )
  assert.equal(hasAdminSession('blog_admin=malformed', now), false)
  process.env.ADMIN_PASSWORD = 'rotated-test-password'
  assert.equal(hasAdminSession(cookie, now), false)
  const liveCookie = `blog_admin=${createAdminSession()}`
  const headers = {
    cookie: liveCookie,
    origin: 'https://xiaozhubao.top',
    host: 'xiaozhubao.top',
  }
  assert.equal(
    publishingAuthorization(headers),
    `Bearer ${process.env.THOUGHT_API_TOKEN}`,
  )
  assert.equal(
    publishingAuthorization(new Headers(headers)),
    `Bearer ${process.env.THOUGHT_API_TOKEN}`,
  )
  assert.equal(
    publishingAuthorization({ ...headers, origin: 'https://attacker.example' }),
    null,
  )
  assert.equal(publishingAuthorization({ ...headers, origin: undefined }), null)
  assert.equal(publishingAuthorization({ ...headers, cookie: '' }), null)
  assert.equal(
    publishingAuthorization({ authorization: 'Bearer legacy-token' }),
    'Bearer legacy-token',
  )
  delete process.env.THOUGHT_API_TOKEN
  assert.equal(publishingAuthorization(headers), null)
  console.log(
    'Admin checks passed: password, signatures, expiry, rotation, both adapters and CSRF rejection.',
  )
} finally {
  for (const [name, value] of [
    ['ADMIN_PASSWORD', previous.password],
    ['ADMIN_USERNAME', previous.username],
    ['THOUGHT_API_TOKEN', previous.token],
  ]) {
    if (value === undefined) delete process.env[name!]
    else process.env[name!] = value
  }
}
