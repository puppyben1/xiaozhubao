import type { APIRoute } from 'astro'
import { webApiContext } from '@lib/server/web-api-context'
import crypto from 'crypto'
import {
  buildGitHubHeaders,
  getRepoFromEnv,
  hasAnyEnv,
  getSiteUrl,
  setCorsHeaders,
} from '@lib/server/api-utils'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const SITE_URL = getSiteUrl()
const OWNER_NAME = process.env.OWNER_NAME?.trim() || ''
const OWNER_EMAIL = process.env.OWNER_EMAIL?.trim().toLowerCase() || ''
const OWNER_TOKEN = process.env.OWNER_TOKEN || process.env.THOUGHT_API_TOKEN

const RATE_LIMIT_WINDOW = 60 * 1000
const RATE_LIMIT_MAX = 3
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

interface CommentPayload {
  slug: string
  title: string
  name?: string
  email?: string
  website?: string
  content: string
  replyToId?: string
  replyToName?: string
  userAgent?: string
  ownerToken?: string
  _gotcha?: string
}

interface CommentMeta {
  name: string
  email?: string
  website?: string
  reply_to?: number
  reply_to_name?: string
  ua?: string
  is_owner?: boolean
}

interface GitHubIssueComment {
  id: number
  body: string
}

interface OwnerCommandResult {
  command: 'delete' | 'star' | 'unstar'
  message: string
  deletedIds?: number[]
  targetId: number
}

const md5 = (value: string) =>
  crypto.createHash('md5').update(value).digest('hex')

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const record = rateLimitMap.get(ip)
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return true
  }
  if (record.count >= RATE_LIMIT_MAX) return false
  record.count++
  return true
}

function getCommentsRepo() {
  return getRepoFromEnv('COMMENTS_REPO', 'GITHUB_REPO')
}

function githubHeaders() {
  return buildGitHubHeaders(GITHUB_TOKEN, 'astro-doge-comments', true)
}

function parseYamlMeta(yamlContent: string): Record<string, string> {
  const meta: Record<string, string> = {}
  for (const line of yamlContent.split('\n')) {
    const colonIndex = line.indexOf(': ')
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim()
      const value = line.slice(colonIndex + 2).trim()
      meta[key] = value
    }
  }
  return meta
}

function parseCommentMeta(body: string): Record<string, string> {
  const metaMatch = body.match(/<!--\n([\s\S]*?)\n-->/)
  if (!metaMatch) return {}
  return parseYamlMeta(metaMatch[1])
}

function setCommentMetaValue(
  body: string,
  key: string,
  value: string | undefined,
): string {
  const metaMatch = body.match(/<!--\n([\s\S]*?)\n-->/)
  if (!metaMatch) throw new Error('Comment metadata not found')

  const lines = metaMatch[1]
    .split('\n')
    .filter((line) => line.trim().length > 0)
  const index = lines.findIndex((line) => line.startsWith(`${key}: `))

  if (value === undefined) {
    if (index >= 0) lines.splice(index, 1)
  } else if (index >= 0) {
    lines[index] = `${key}: ${value}`
  } else {
    lines.push(`${key}: ${value}`)
  }

  return body.replace(/<!--\n[\s\S]*?\n-->/, `<!--\n${lines.join('\n')}\n-->`)
}

function getOwnerCommand(
  content: string,
): OwnerCommandResult['command'] | null {
  const command = content.trim().toLowerCase()
  if (command === '/delete') return 'delete'
  if (command === '/star') return 'star'
  if (command === '/unstar') return 'unstar'
  return null
}

function buildCommentBody(meta: CommentMeta, content: string): string {
  const yamlLines = [
    `name: ${meta.name}`,
    meta.email && `email: ${meta.email}`,
    meta.website && `website: ${meta.website}`,
    meta.reply_to && `reply_to: ${meta.reply_to}`,
    meta.reply_to_name && `reply_to_name: ${meta.reply_to_name}`,
    meta.ua && `ua: ${meta.ua}`,
    meta.is_owner && `is_owner: ${meta.is_owner}`,
  ].filter(Boolean)

  const avatar = meta.email
    ? `https://weavatar.com/avatar/${md5(meta.email.toLowerCase())}?s=80&d=identicon`
    : 'https://weavatar.com/avatar/?d=mp'

  const websiteLink =
    meta.website && meta.website !== SITE_URL
      ? ` · [${new URL(meta.website).hostname}](${meta.website})`
      : ''

  return `<!--
${yamlLines.join('\n')}
-->

**${meta.name}**${websiteLink} · [头像](${avatar})

${content}`
}

async function findOrCreateIssue(slug: string, title: string): Promise<number> {
  const { owner, repo } = getCommentsRepo()

  const search = await fetch(
    `https://api.github.com/search/issues?q=repo:${owner}/${repo}+is:issue+label:comments+"slug:${slug}"+in:body`,
    { headers: githubHeaders() },
  )
  if (!search.ok) throw new Error('Failed to search issues')

  const data = await search.json()
  if (data.total_count > 0) return data.items[0].number

  const articleUrl = `${SITE_URL}/${slug}`.replace(/([^:]\/)\/+/g, '$1')

  const create = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues`,
    {
      method: 'POST',
      headers: githubHeaders(),
      body: JSON.stringify({
        title,
        body: `# 文章评论\n\n**文章**: [${title}](${articleUrl})\n\n<!-- slug:${slug} -->\n\n此 Issue 用于存储评论，请勿手动修改。`,
        labels: ['comments'],
      }),
    },
  )
  if (!create.ok) throw new Error('Failed to create issue')

  return (await create.json()).number
}

async function findIssue(slug: string): Promise<number | null> {
  const { owner, repo } = getCommentsRepo()
  const search = await fetch(
    `https://api.github.com/search/issues?q=repo:${owner}/${repo}+is:issue+label:comments+"slug:${slug}"+in:body`,
    { headers: githubHeaders() },
  )
  if (!search.ok) throw new Error('Failed to search issues')

  const data = await search.json()
  return data.total_count > 0 ? data.items[0].number : null
}

async function fetchIssueComments(
  issueNumber: number,
): Promise<GitHubIssueComment[]> {
  const { owner, repo } = getCommentsRepo()
  const allComments: GitHubIssueComment[] = []

  for (let page = 1; page <= 10; page += 1) {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100&page=${page}`,
      { headers: githubHeaders() },
    )
    if (!response.ok) throw new Error('Failed to fetch comments')

    const comments = (await response.json()) as GitHubIssueComment[]
    allComments.push(...comments)
    if (comments.length < 100) break
  }

  return allComments
}

function collectCommentThreadIds(
  comments: GitHubIssueComment[],
  targetId: number,
): number[] {
  const children = new Map<number, number[]>()
  for (const comment of comments) {
    const meta = parseCommentMeta(comment.body)
    const replyTo = Number(meta.reply_to)
    if (!Number.isSafeInteger(replyTo) || replyTo <= 0) continue

    const ids = children.get(replyTo) || []
    ids.push(comment.id)
    children.set(replyTo, ids)
  }

  const ids = [targetId]
  for (let index = 0; index < ids.length; index += 1) {
    const childIds = children.get(ids[index]) || []
    ids.push(...childIds)
  }

  return ids
}

async function deleteGitHubComment(commentId: number): Promise<void> {
  const { owner, repo } = getCommentsRepo()
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/comments/${commentId}`,
    {
      method: 'DELETE',
      headers: githubHeaders(),
    },
  )

  if (response.status === 204 || response.status === 404) return
  throw new Error(`Failed to delete comment ${commentId}`)
}

async function updateGitHubComment(
  commentId: number,
  body: string,
): Promise<void> {
  const { owner, repo } = getCommentsRepo()
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/comments/${commentId}`,
    {
      method: 'PATCH',
      headers: githubHeaders(),
      body: JSON.stringify({ body }),
    },
  )

  if (!response.ok) throw new Error(`Failed to update comment ${commentId}`)
}

async function handleOwnerCommand(
  slug: string,
  targetId: number,
  command: OwnerCommandResult['command'],
): Promise<OwnerCommandResult> {
  const issueNumber = await findIssue(slug)
  if (!issueNumber) throw new Error('Comment issue not found')

  const comments = await fetchIssueComments(issueNumber)
  const target = comments.find((comment) => comment.id === targetId)
  if (!target) throw new Error('Target comment not found')

  if (command === 'delete') {
    const deletedIds = collectCommentThreadIds(comments, targetId)
    await Promise.all(deletedIds.map((id) => deleteGitHubComment(id)))
    return {
      command,
      targetId,
      deletedIds,
      message:
        deletedIds.length > 1
          ? `已删除这条留言和 ${deletedIds.length - 1} 条回复`
          : '已删除这条留言',
    }
  }

  const nextBody = setCommentMetaValue(
    target.body,
    'featured',
    command === 'star' ? 'true' : undefined,
  )
  await updateGitHubComment(targetId, nextBody)

  return {
    command,
    targetId,
    message: command === 'star' ? '已设为精选留言' : '已取消精选留言',
  }
}

async function addComment(
  issueNumber: number,
  meta: CommentMeta,
  content: string,
): Promise<void> {
  const { owner, repo } = getCommentsRepo()

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    {
      method: 'POST',
      headers: githubHeaders(),
      body: JSON.stringify({ body: buildCommentBody(meta, content) }),
    },
  )

  if (!response.ok) throw new Error('Failed to add comment')
}

export const prerender = false
export const ALL: APIRoute = async ({ request }) => {
  const { req, res } = await webApiContext(request)
  setCorsHeaders(req, res, 'POST, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!GITHUB_TOKEN || !hasAnyEnv('COMMENTS_REPO', 'GITHUB_REPO')) {
    return res.status(500).json({ error: 'Server configuration error' })
  }

  const ip = (
    req.headers['x-forwarded-for']?.toString().split(',')[0] ||
    req.socket?.remoteAddress ||
    'unknown'
  ).trim()

  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: '评论太频繁，请稍后再试' })
  }

  try {
    const body = req.body as CommentPayload

    if (body._gotcha) return res.status(200).json({ success: true })
    if (!body.slug || !body.title || !body.content?.trim()) {
      return res.status(400).json({ error: '请填写留言内容' })
    }

    const name = body.name?.trim() || '匿名'
    const email = body.email?.trim().toLowerCase() || undefined
    const website = body.website?.trim() || undefined
    const content = body.content.trim()

    if (name.length > 50) {
      return res.status(400).json({ error: '昵称不能超过 50 个字符' })
    }
    if (content.length > 1000) {
      return res.status(400).json({ error: '评论内容不能超过 1000 个字符' })
    }
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: '请输入有效的邮箱地址' })
    }
    if (website) {
      try {
        new URL(website)
      } catch {
        return res.status(400).json({ error: '请输入有效的网站地址' })
      }
    }

    const isOwnerName = OWNER_NAME !== '' && name === OWNER_NAME
    const isOwnerEmail = OWNER_EMAIL !== '' && email === OWNER_EMAIL
    let isOwner = false
    let isOwnerAuthenticated = false

    if (isOwnerName || isOwnerEmail) {
      if (!OWNER_TOKEN) {
        return res
          .status(500)
          .json({ error: '服务器配置错误：未设置 OWNER_TOKEN' })
      }
      if (body.ownerToken !== OWNER_TOKEN) {
        return res.status(403).json({
          error:
            isOwnerName && isOwnerEmail
              ? '博主身份验证失败：token 无效'
              : '名称或邮箱与博主相同，需要验证身份',
        })
      }
      isOwnerAuthenticated = true
      isOwner = isOwnerName && isOwnerEmail
    }

    const ownerCommand = getOwnerCommand(content)
    if (ownerCommand) {
      if (!isOwnerAuthenticated) {
        return res.status(403).json({ error: '管理命令需要博主身份验证' })
      }

      const targetId = Number(body.replyToId)
      if (!Number.isSafeInteger(targetId) || targetId <= 0) {
        return res.status(400).json({ error: '管理命令只能作为回复发送' })
      }

      const result = await handleOwnerCommand(body.slug, targetId, ownerCommand)
      return res.status(200).json({ success: true, ...result })
    }

    const meta: CommentMeta = { name }
    if (email) meta.email = email
    if (website) meta.website = website
    if (body.userAgent) meta.ua = body.userAgent
    if (isOwner) meta.is_owner = true
    if (body.replyToId && body.replyToName) {
      meta.reply_to = Number.parseInt(body.replyToId, 10)
      meta.reply_to_name = body.replyToName
    }

    const issueNumber = await findOrCreateIssue(body.slug, body.title)
    await addComment(issueNumber, meta, content)

    return res.status(200).json({ success: true, message: '评论提交成功！' })
  } catch (error) {
    console.error('Comment error:', error)
    return res.status(500).json({ error: '提交评论时出错，请稍后重试' })
  }
}
