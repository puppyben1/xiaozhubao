import { githubPublishingError } from './github-publishing.ts'
import { getPublishingStatus, hasPublishingToken } from './publishing.ts'
import { z } from 'astro/zod'
import { buildGitHubHeaders, getRepoFromEnv } from './api-utils.ts'

const postSchema = z.object({
  title: z.string().trim().min(1, '请填写标题').max(200),
  description: z.string().trim().max(1000).default(''),
  content: z.string().trim().min(1, '请填写正文').max(200_000),
  slug: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      '网址标识只能使用小写字母、数字和连字符',
    )
    .max(80)
    .refine((value) => value !== 'new', '请换一个网址标识，new 是编辑页地址'),
  section: z.enum(['posts', 'notes', 'questions']).default('posts'),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  cover: z
    .string()
    .trim()
    .max(2000)
    .default('')
    .refine(
      (value) => !value || /^(https?:\/\/|\/(?!\/))/.test(value),
      '封面请使用 http(s) 或站内图片地址',
    ),
})

export async function createPost(
  body: unknown,
  authorization: string | null | undefined,
) {
  const fail = (status: number, message: string) => ({
    status,
    body: { success: false, message },
  })
  if (!getPublishingStatus().content) {
    return fail(
      503,
      '发布尚未配置：请在服务器配置 GitHub 内容仓库、写入凭证和发布 Token。',
    )
  }
  if (!hasPublishingToken(authorization)) return fail(401, '发布凭证无效')
  // The id is retained by the composer, so retrying an uncertain request cannot create a second article.
  const submission = z.object({ requestId: z.uuid() }).safeParse(body)
  const parsed = postSchema.safeParse(body)
  if (!parsed.success || !submission.success) {
    return fail(
      400,
      parsed.success ? '发布请求标识无效' : parsed.error.issues[0].message,
    )
  }
  const post = parsed.data
  const requestId = submission.data.requestId
  const filePath = `src/content/posts/web/${post.slug}.md`
  const permalink = `/posts/${post.slug}`
  const metadata = {
    title: post.title,
    description: post.description,
    section: post.section,
    date: new Date().toISOString(),
    slug: permalink.slice(1),
    cover: post.cover,
    tags: post.tags,
    draft: false,
  }
  const markdown = `---\n${Object.entries(metadata)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n')}\n---\n\n${post.content}\n`
  try {
    const { owner, repo } = getRepoFromEnv('CONTENT_REPO', 'GITHUB_REPO')
    const branch = process.env.CONTENT_BRANCH?.trim() || 'main'
    const headers = buildGitHubHeaders(
      process.env.GITHUB_TOKEN,
      'puppyben-publishing',
      true,
    )
    const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath}`
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers,
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        message: `feat(blog): publish ${post.title} [${requestId}]`,
        content: Buffer.from(markdown).toString('base64'),
        branch,
      }),
    })
    if (response.status === 409 || response.status === 422) {
      return fail(
        409,
        '该网址标识已存在或提交冲突。请先检查 GitHub 是否已收到上次提交；新文章请换一个标识。',
      )
    }
    if (!response.ok) return fail(502, githubPublishingError(response))
    const result = (await response.json()) as { commit?: { html_url?: string } }
    return {
      status: 201,
      body: {
        success: true,
        message: '已提交到 GitHub，等待 Vercel 部署完成后文章才会显示。',
        data: { filePath, url: permalink, commitUrl: result.commit?.html_url },
      },
    }
  } catch {
    return fail(
      502,
      '暂时无法确认提交结果。草稿已保留，请先检查 GitHub 提交记录再重试。',
    )
  }
}
