import { githubPublishingError } from './github-publishing.ts'
import { randomUUID } from 'node:crypto'
import { z } from 'astro/zod'
import { buildGitHubHeaders, getRepoFromEnv } from './api-utils.ts'
import { getPathPartsInTimeZone, toZonedISOString } from './timezone.ts'
import { getPublishingStatus, hasPublishingToken } from './publishing.ts'

const thoughtSchema = z.object({
  content: z.string().trim().min(1, '内容不能为空').max(100_000),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  name: z.string().trim().max(80).default(''),
})

export async function createThought(
  body: unknown,
  authorization: string | null | undefined,
) {
  const fail = (status: number, message: string) => ({
    status,
    body: { success: false, message },
  })
  if (!getPublishingStatus().content)
    return fail(
      503,
      '发布尚未配置：请先配置 GitHub 内容仓库、写入凭证和发布 Token。',
    )
  if (!hasPublishingToken(authorization)) return fail(401, '无效的 API Token')
  const parsed = thoughtSchema.safeParse(body)
  if (!parsed.success) return fail(400, parsed.error.issues[0].message)
  try {
    const now = new Date()
    const timezone = process.env.SITE_TIMEZONE?.trim() || 'UTC'
    const { year, month, day } = getPathPartsInTimeZone(now, timezone)
    const date = toZonedISOString(now, timezone)
    const name =
      parsed.data.name
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || randomUUID().slice(0, 8)
    const filename = `${day}_${name}.md`
    const directory =
      process.env.THOUGHTS_CONTENT_DIR?.trim() || 'src/content/thoughts'
    const filePath = `${directory}/${year}/${month}/${filename}`
    const tags = parsed.data.tags?.length ? parsed.data.tags : ['日常']
    const content = parsed.data.content
    const markdown = `---\ndate: ${JSON.stringify(date)}\ntags: ${JSON.stringify(tags)}\ndraft: false\n---\n\n${content}\n`
    const { owner, repo } = getRepoFromEnv('CONTENT_REPO', 'GITHUB_REPO')
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: buildGitHubHeaders(
          process.env.GITHUB_TOKEN,
          'puppyben-publishing',
          true,
        ),
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          message: `feat(thoughts): add ${content.slice(0, 30)}`,
          content: Buffer.from(markdown).toString('base64'),
          branch: process.env.CONTENT_BRANCH?.trim() || 'main',
        }),
      },
    )
    if (response.status === 409 || response.status === 422)
      return fail(409, '文件标识已存在或提交冲突，请检查 GitHub 提交记录。')
    if (!response.ok) return fail(502, githubPublishingError(response))
    const result = (await response.json()) as {
      content: { html_url: string }
      commit: { sha: string; html_url: string }
    }
    return {
      status: 201,
      body: {
        success: true,
        message: '碎碎念已提交，请等待自动部署。',
        data: {
          filePath,
          filename,
          date,
          tags,
          content,
          github: {
            commitSha: result.commit.sha,
            commitUrl: result.commit.html_url,
            fileUrl: result.content.html_url,
          },
        },
      },
    }
  } catch {
    return fail(
      502,
      '暂时无法确认提交结果，草稿已保留，请先检查 GitHub 再重试。',
    )
  }
}
