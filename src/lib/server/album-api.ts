import { githubPublishingError } from './github-publishing.ts'
import { hasPublishingToken } from './publishing'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { buildGitHubHeaders, getRepoFromEnv, hasAnyEnv } from './api-utils'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const CONTENT_BRANCH = process.env.CONTENT_BRANCH?.trim() || 'main'
const ALBUMS_CONTENT_DIR =
  process.env.ALBUMS_CONTENT_DIR?.trim() || 'src/content/albums'

function isLocalAlbumWriteMode(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1'
}

export interface AlbumRequest {
  alt?: string
  date?: string
  description?: string
  height?: number
  location?: string
  src?: string
  thumb?: string
  title?: string
  width?: number
}

interface GitHubCreateFileResponse {
  content: {
    name: string
    path: string
    sha: string
    html_url: string
  }
  commit: {
    sha: string
    html_url: string
  }
  local?: boolean
}

interface ApiResult {
  status: number
  body: {
    success: boolean
    message?: string
    data?: unknown
  }
}

function randomId(len = 4): string {
  let s = ''
  for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10)
  return s
}

function getContentRepo() {
  return getRepoFromEnv('CONTENT_REPO', 'GITHUB_REPO')
}

function githubHeaders() {
  return {
    ...buildGitHubHeaders(GITHUB_TOKEN, 'astro-doge-add-album', true),
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function getDateParts(date: string): {
  year: string
  month: string
  day: string
} {
  const [year, month, day] = date.split('T')[0].split('-')
  return {
    year: year || '2026',
    month: (month || '01').padStart(2, '0'),
    day: (day || '01').padStart(2, '0'),
  }
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function frontmatterField(key: string, value: string): string {
  return `${key}: ${JSON.stringify(value)}`
}

function generateAlbumContent(
  body: Required<Pick<AlbumRequest, 'date' | 'src' | 'thumb' | 'title'>> &
    AlbumRequest,
): string {
  const lines = [
    '---',
    frontmatterField('title', body.title),
    `date: ${body.date}`,
    frontmatterField('src', body.src),
    frontmatterField('thumb', body.thumb),
    frontmatterField('alt', body.alt || body.title),
  ]

  if (body.description?.trim()) {
    lines.push(frontmatterField('description', body.description.trim()))
  }

  if (body.location?.trim()) {
    lines.push(frontmatterField('location', body.location.trim()))
  }

  if (Number.isFinite(body.width) && Number.isFinite(body.height)) {
    lines.push(`width: ${Math.round(Number(body.width))}`)
    lines.push(`height: ${Math.round(Number(body.height))}`)
  }

  lines.push('draft: false', '---', '')
  return lines.join('\n')
}

async function createFileOnGitHub(
  filePath: string,
  content: string,
  commitMessage: string,
): Promise<GitHubCreateFileResponse> {
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN is not configured')
  }

  const { owner, repo } = getContentRepo()
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`

  const response = await fetch(url, {
    method: 'PUT',
    headers: githubHeaders(),
    body: JSON.stringify({
      message: commitMessage,
      content: Buffer.from(content).toString('base64'),
      branch: CONTENT_BRANCH,
    }),
  })

  if (!response.ok) {
    throw new Error(githubPublishingError(response))
  }

  return response.json()
}

async function createFileLocally(
  filePath: string,
  content: string,
): Promise<GitHubCreateFileResponse> {
  const absolutePath = join(process.cwd(), filePath)

  await mkdir(dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, content, { encoding: 'utf-8', flag: 'wx' })

  return {
    content: {
      name: filePath.split('/').at(-1) || filePath,
      path: filePath,
      sha: 'local',
      html_url: filePath,
    },
    commit: {
      sha: 'local',
      html_url: '',
    },
    local: true,
  }
}

async function createAlbumFile(
  filePath: string,
  content: string,
  commitMessage: string,
): Promise<GitHubCreateFileResponse> {
  if (isLocalAlbumWriteMode()) {
    return createFileLocally(filePath, content)
  }

  return createFileOnGitHub(filePath, content, commitMessage)
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

export async function createAlbum(
  body: AlbumRequest,
  authHeader: string | null | undefined,
): Promise<ApiResult> {
  if (
    !isLocalAlbumWriteMode() &&
    (!GITHUB_TOKEN || !hasAnyEnv('CONTENT_REPO', 'GITHUB_REPO'))
  ) {
    return {
      status: 500,
      body: {
        success: false,
        message: 'Missing required environment variables for album publishing',
      },
    }
  }

  if (!hasPublishingToken(authHeader)) {
    return {
      status: 401,
      body: { success: false, message: '无效的 API Token' },
    }
  }

  try {
    const title = body.title?.trim()
    const src = body.src?.trim()
    const thumb = body.thumb?.trim()
    const date = body.date?.trim()

    if (!title) {
      return { status: 400, body: { success: false, message: '标题不能为空' } }
    }

    if (!src) {
      return {
        status: 400,
        body: { success: false, message: '图片 URL 不能为空' },
      }
    }

    if (!thumb) {
      return {
        status: 400,
        body: { success: false, message: '缩略图 URL 不能为空' },
      }
    }

    if (!date || Number.isNaN(new Date(date).getTime())) {
      return { status: 400, body: { success: false, message: '日期无效' } }
    }

    const { year, month, day } = getDateParts(date)
    const slug = slugify(title) || randomId()
    const filename = `${day}_${slug}.md`
    const filePath = `${ALBUMS_CONTENT_DIR}/${year}/${month}/${filename}`
    const fileContent = generateAlbumContent({
      ...body,
      alt: body.alt?.trim() || title,
      date,
      src,
      thumb,
      title,
    })
    const shortTitle = title.length > 30 ? `${title.slice(0, 30)}...` : title
    const commitMessage = `📷 新照片: ${shortTitle}`
    const result = await createAlbumFile(filePath, fileContent, commitMessage)

    return {
      status: 201,
      body: {
        success: true,
        message: '照片创建成功！',
        data: {
          filePath,
          filename,
          date,
          src,
          thumb,
          title,
          local: result.local || undefined,
          github: {
            commitSha: result.commit.sha,
            commitUrl: result.commit.html_url,
            fileUrl: result.content.html_url,
          },
        },
      },
    }
  } catch (error) {
    return {
      status: 500,
      body: {
        success: false,
        message: getErrorMessage(error),
      },
    }
  }
}
