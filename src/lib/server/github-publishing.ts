import { buildGitHubHeaders, getRepoFromEnv } from './api-utils.ts'
import { getPublishingStatus } from './publishing.ts'

// Return actionable, bounded diagnostics, never GitHub response bodies or credentials.
export function githubPublishingError(response: Response): string {
  const code = `GitHub HTTP ${response.status}`
  if (response.status === 401)
    return `${code}：GITHUB_TOKEN 无效、已过期或已撤销。请更新 Vercel 的 Production 环境变量并重新部署。`
  if (
    response.status === 403 &&
    response.headers.get('x-ratelimit-remaining') === '0'
  )
    return `${code}：GitHub API 额度已耗尽，请稍后重试。`
  if (response.status === 403)
    return `${code}：请求被拒绝。请确认 Token 已授权此仓库、Contents 为 Read and write，且没有组织审批或仓库规则限制。`
  if (response.status === 404)
    return `${code}：找不到或无权访问目标。请确认 CONTENT_REPO、CONTENT_BRANCH，以及 Token 的仓库授权。`
  if (response.status === 409 || response.status === 422)
    return `${code}：文件已存在、提交冲突或参数不被接受。请检查分支和已有提交；不要覆盖已发布内容。`
  return `${code}：请求失败，请稍后重试。`
}

export async function checkPublishingAccess() {
  if (!getPublishingStatus().content)
    return {
      success: false,
      message:
        '发布配置未齐全，请填写 GITHUB_TOKEN、CONTENT_REPO 和 THOUGHT_API_TOKEN。',
    }
  try {
    const { owner, repo, fullName } = getRepoFromEnv(
      'CONTENT_REPO',
      'GITHUB_REPO',
    )
    const branch = process.env.CONTENT_BRANCH?.trim() || 'main'
    const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
    const headers = buildGitHubHeaders(
      process.env.GITHUB_TOKEN,
      'puppyben-publishing-check',
    )
    const response = await fetch(endpoint, {
      headers,
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok)
      return { success: false, message: githubPublishingError(response) }
    const branchResponse = await fetch(
      `${endpoint}/branches/${encodeURIComponent(branch)}`,
      { headers, signal: AbortSignal.timeout(8000) },
    )
    if (!branchResponse.ok)
      return { success: false, message: githubPublishingError(branchResponse) }
    return {
      success: true,
      message: `可读取仓库 ${fullName} 和分支 ${branch}。此检查不写入内容；Contents 写入权限仍需在实际发布时验证。`,
    }
  } catch {
    return {
      success: false,
      message:
        '无法完成 GitHub 连接检查，请确认仓库格式为 owner/repo，或稍后重试。',
    }
  }
}
