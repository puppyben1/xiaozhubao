import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { buildGitHubHeaders, getRepoFromEnv } from './api-utils.ts'
import { getPublishingStatus, hasPublishingToken } from './publishing.ts'

// Below Vercel's 4.5 MB request limit, including transport overhead.
export const MAX_IMAGE_BYTES = 4_000_000

export async function uploadRepositoryImage(
  request: Request,
  authorization: string | null | undefined,
) {
  const fail = (status: number, message: string) => ({
    status,
    body: { success: false, message },
  })
  if (!hasPublishingToken(authorization))
    return fail(401, '登录已失效，请重新登录')
  if (!getPublishingStatus().content)
    return fail(503, '请先配置 GitHub 发布权限')
  const folder = new URL(request.url).searchParams.get('folder') || 'posts'
  if (!['posts', 'thoughts', 'albums'].includes(folder))
    return fail(400, '上传目录无效')
  if (!request.headers.get('content-type')?.startsWith('image/'))
    return fail(400, '请选择图片文件')
  if (Number(request.headers.get('content-length')) > MAX_IMAGE_BYTES)
    return fail(413, '图片不能超过 4 MB，请压缩后重试')
  if (!request.body) return fail(400, '图片不能为空')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel()
        return fail(413, '图片不能超过 4 MB，请压缩后重试')
      }
      chunks.push(value)
    }
  } catch {
    return fail(400, '图片读取失败，请重新选择')
  } finally {
    reader.releaseLock()
  }
  let image: Buffer
  try {
    // Decode before accepting; strip metadata and store a bounded raster image.
    image = await sharp(Buffer.concat(chunks), { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({
        width: 2560,
        height: 2560,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer()
  } catch {
    return fail(400, '图片格式无效或尺寸过大，请使用 JPG、PNG、WebP 或 GIF')
  }
  if (image.length > MAX_IMAGE_BYTES)
    return fail(413, '压缩后的图片仍超过 4 MB')
  try {
    const { owner, repo } = getRepoFromEnv('CONTENT_REPO', 'GITHUB_REPO')
    const filePath = `public/uploads/${folder}/${randomUUID()}.webp`
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: buildGitHubHeaders(
          process.env.GITHUB_TOKEN,
          'puppyben-images',
          true,
        ),
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          message: `feat(blog): upload ${folder} image`,
          content: image.toString('base64'),
          branch: process.env.CONTENT_BRANCH?.trim() || 'main',
        }),
      },
    )
    if (!response.ok)
      return fail(502, '图片写入 GitHub 失败，请检查仓库写入权限后重试')
    const result = (await response.json()) as { commit?: { sha?: string } }
    if (!result.commit?.sha || !/^[a-f0-9]{40}$/.test(result.commit.sha))
      return fail(502, '无法确认图片提交结果，请检查 GitHub')
    return {
      status: 201,
      body: {
        success: true,
        data: {
          url: `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${result.commit.sha}/${filePath}`,
        },
      },
    }
  } catch {
    return fail(502, '图片上传结果尚未确认，请检查 GitHub 后重试')
  }
}
