import { getRepoFromEnv, hasAnyEnv } from './api-utils.ts'

const COMMENTS_REPO_ENVS = ['COMMENTS_REPO', 'GITHUB_REPO', 'CONTENT_REPO']

export const getCommentsRepo = () => getRepoFromEnv(...COMMENTS_REPO_ENVS)
export const hasCommentsRepo = () => hasAnyEnv(...COMMENTS_REPO_ENVS)

export class CommentsGitHubError extends Error {}

export function assertCommentsResponse(response: Response): void {
  if (response.ok) return
  const message =
    response.status === 401
      ? '评论服务的 GitHub Token 已失效，请更新 GITHUB_TOKEN'
      : [403, 404].includes(response.status)
        ? '评论服务无法访问 GitHub Issues，请为仓库 Token 开启 Issues: Read and write 权限'
        : `评论服务暂时无法连接 GitHub（HTTP ${response.status}），请稍后重试`
  throw new CommentsGitHubError(message)
}
