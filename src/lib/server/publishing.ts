import { timingSafeEqual } from 'node:crypto'

export function getPublishingStatus() {
  return {
    content: Boolean(
      process.env.GITHUB_TOKEN?.trim() &&
      process.env.THOUGHT_API_TOKEN &&
      (process.env.CONTENT_REPO?.trim() || process.env.GITHUB_REPO?.trim()),
    ),
    images: Boolean(process.env.R2_IMAGE_BASE_URL?.trim()),
  }
}

export function hasPublishingToken(authorization: string | null | undefined) {
  const supplied = Buffer.from(authorization?.match(/^Bearer (.+)$/)?.[1] || '')
  const expected = Buffer.from(process.env.THOUGHT_API_TOKEN || '')
  return (
    expected.length > 0 &&
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected)
  )
}
