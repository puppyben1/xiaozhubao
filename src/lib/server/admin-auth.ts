import { createHmac, timingSafeEqual } from 'node:crypto'

export const ADMIN_COOKIE = 'blog_admin'
export const SESSION_SECONDS = 12 * 60 * 60

export function adminConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD)
}

function equal(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

function sign(value: string) {
  return createHmac('sha256', process.env.ADMIN_PASSWORD || '')
    .update(`blog-admin-session:${value}`)
    .digest('base64url')
}

export function validAdminPassword(password: string) {
  // Compare fixed-length digests, including for differently sized passwords.
  return (
    adminConfigured() &&
    equal(sign(password), sign(process.env.ADMIN_PASSWORD!))
  )
}

export function validAdminCredentials(username: string, password: string) {
  const passwordValid = validAdminPassword(password)
  return (
    equal(sign(username), sign(process.env.ADMIN_USERNAME || 'puppyben')) &&
    passwordValid
  )
}

export function createAdminSession(now = Date.now()) {
  if (!adminConfigured()) throw new Error('Admin login is not configured')
  const expires = String(Math.floor(now / 1000) + SESSION_SECONDS)
  return `${expires}.${sign(expires)}`
}

export function hasAdminSession(
  cookie: string | null | undefined,
  now = Date.now(),
) {
  if (!adminConfigured() || !cookie || cookie.length > 16384) return false
  const value = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_COOKIE}=`))
    ?.slice(ADMIN_COOKIE.length + 1)
  if (!value || !/^\d{10}\.[A-Za-z0-9_-]{43}$/.test(value)) return false
  const [expires, signature] = value.split('.')
  const remaining = Number(expires) - Math.floor(now / 1000)
  return (
    remaining > 0 &&
    remaining <= SESSION_SECONDS &&
    equal(signature, sign(expires))
  )
}

export function sameOrigin(
  origin: string | null | undefined,
  host: string | null | undefined,
) {
  if (!origin || !host) return false
  try {
    const url = new URL(origin)
    return ['http:', 'https:'].includes(url.protocol) && url.host === host
  } catch {
    return false
  }
}

type HeaderValues = Record<string, string | string[] | undefined>

// Both Astro and Vercel adapters resolve the session at this boundary.
// Publishing credentials stay on the server. Cookie writes require a same-site origin.
export function publishingAuthorization(headers: Headers | HeaderValues) {
  const get = (name: string): string | null => {
    const value = headers instanceof Headers ? headers.get(name) : headers[name]
    return typeof value === 'string' ? value : null
  }
  const explicit = get('authorization')
  if (explicit) return explicit
  if (
    !hasAdminSession(get('cookie')) ||
    !sameOrigin(get('origin'), get('host'))
  )
    return null
  return process.env.THOUGHT_API_TOKEN
    ? `Bearer ${process.env.THOUGHT_API_TOKEN}`
    : null
}
