import { hasPublishingToken } from './publishing'
const R2_BASE_URL = process.env.R2_IMAGE_BASE_URL?.trim()

const IMAGE_CACHE_MAX_AGE = 31536000
const UPLOAD_FOLDERS = new Set(['albums', 'thoughts', 'posts'])
const UPLOAD_VARIANTS = new Set(['thumb'])

export interface UploadSignRequest {
  filename?: string
  contentType?: string
  folder?: string
  objectId?: string
  size?: number
  variant?: string
}

export interface UploadCompleteRequest {
  key?: string
}

interface ApiResult {
  status: number
  body: {
    success: boolean
    message?: string
    data?: unknown
  }
}

function getUploadAuthHeader(
  authHeader: string | null | undefined,
): string | null {
  return hasPublishingToken(authHeader) ? authHeader! : null
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

async function readRemoteJson(
  response: Response,
): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function createUploadSign(
  body: UploadSignRequest,
  authHeader: string | null | undefined,
): Promise<ApiResult> {
  if (!R2_BASE_URL) {
    return {
      status: 500,
      body: {
        success: false,
        message: 'R2_IMAGE_BASE_URL is not configured',
      },
    }
  }

  const uploadAuthHeader = getUploadAuthHeader(authHeader)
  if (!uploadAuthHeader) {
    return {
      status: 401,
      body: { success: false, message: '登录已失效，请重新登录' },
    }
  }

  const filename = body.filename?.trim()
  const contentType = body.contentType?.trim() || 'application/octet-stream'
  const folder = body.folder?.trim()
  const objectId = body.objectId?.trim()
  const variant = body.variant?.trim()
  const size = Number(body.size)

  if (!filename) {
    return { status: 400, body: { success: false, message: '文件名不能为空' } }
  }

  if (!contentType.startsWith('image/')) {
    return {
      status: 400,
      body: { success: false, message: '只能上传图片文件' },
    }
  }

  if (!Number.isFinite(size) || size <= 0) {
    return { status: 400, body: { success: false, message: '文件大小无效' } }
  }

  if (folder && !UPLOAD_FOLDERS.has(folder)) {
    return {
      status: 400,
      body: { success: false, message: '上传目录无效' },
    }
  }

  if (objectId && !/^[a-f0-9]{6}$/i.test(objectId)) {
    return {
      status: 400,
      body: { success: false, message: '图片 ID 无效' },
    }
  }

  if (variant && !UPLOAD_VARIANTS.has(variant)) {
    return {
      status: 400,
      body: { success: false, message: '图片变体无效' },
    }
  }

  try {
    const response = await fetch(`${R2_BASE_URL}/api/upload/sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: uploadAuthHeader,
      },
      body: JSON.stringify({
        filename,
        contentType,
        size,
        folder: folder || undefined,
        objectId: objectId || undefined,
        variant: variant || undefined,
        cacheMaxAge: IMAGE_CACHE_MAX_AGE,
      }),
    })

    const data = await readRemoteJson(response)

    if (!response.ok) {
      return {
        status: response.status,
        body: {
          success: false,
          message:
            String(data.message || data.error || '') || '图片上传签名失败',
        },
      }
    }

    return { status: 200, body: { success: true, data } }
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

export async function completeUpload(
  body: UploadCompleteRequest,
  authHeader: string | null | undefined,
): Promise<ApiResult> {
  if (!R2_BASE_URL) {
    return {
      status: 500,
      body: {
        success: false,
        message: 'R2_IMAGE_BASE_URL is not configured',
      },
    }
  }

  const uploadAuthHeader = getUploadAuthHeader(authHeader)
  if (!uploadAuthHeader) {
    return {
      status: 401,
      body: { success: false, message: '登录已失效，请重新登录' },
    }
  }

  const key = body.key?.trim()

  if (!key) {
    return {
      status: 400,
      body: { success: false, message: '上传 key 不能为空' },
    }
  }

  try {
    const response = await fetch(`${R2_BASE_URL}/api/upload/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: uploadAuthHeader,
      },
      body: JSON.stringify({ key }),
    })

    const data = await readRemoteJson(response)

    if (!response.ok) {
      return {
        status: response.status,
        body: {
          success: false,
          message:
            String(data.message || data.error || '') || '图片上传确认失败',
        },
      }
    }

    return { status: 200, body: { success: true, data } }
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
