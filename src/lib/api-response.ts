// Hosting failures can be plain text or HTML instead of the API's JSON envelope.
export async function readApiResponse<T>(response: Response): Promise<T> {
  let value: unknown
  try {
    value = await response.json()
  } catch {
    throw new Error(
      `服务器请求失败（HTTP ${response.status}），内容已保留，请稍后重试。`,
    )
  }
  if (!value || typeof value !== 'object' || !('success' in value)) {
    throw new Error(`服务器返回了无效结果（HTTP ${response.status}）。`)
  }
  return value as T
}
