interface UploadApiResponse<T> {
  success: boolean
  message?: string
  data?: T
}

interface UploadSignResult {
  key: string
  url?: string
  uploadUrl: string
  headers?: Record<string, string>
}

interface UploadCompleteResult {
  url?: string
}

type UploadFolder = 'albums' | 'thoughts' | 'posts'

interface UploadImageOptions {
  folder?: UploadFolder
  objectId?: string
  signal?: AbortSignal
  variant?: 'thumb'
}

interface ImageDimensions {
  height: number
  width: number
}

const IMAGE_OUTPUT_TYPE = 'image/webp'
const IMAGE_OUTPUT_QUALITY = 0.82
const ALBUM_THUMB_MAX_LONG_EDGE = 720
const ALBUM_THUMB_QUALITY = 0.76
const MAX_EXIF_READ_BYTES = 1024 * 1024

const JPEG_APP1_MARKER = 0xe1
const JPEG_EOI_MARKER = 0xd9
const JPEG_SOS_MARKER = 0xda
const TIFF_TYPE_ASCII = 2
const TIFF_TYPE_LONG = 4
const EXIF_IFD_POINTER_TAG = 0x8769
const EXIF_DATE_TAGS = [0x9003, 0x9004, 0x0132] as const
const EXIF_HEADER_BYTES = [0x45, 0x78, 0x69, 0x66, 0, 0] as const

export function escapeMarkdownAlt(text: string): string {
  return text.replace(/[[\]\r\n]/g, ' ').trim() || 'image'
}

function replaceFileExtension(filename: string, extension: string): string {
  const trimmed = filename.trim() || 'image'
  return /\.[^.]+$/.test(trimmed)
    ? trimmed.replace(/\.[^.]+$/, extension)
    : `${trimmed}${extension}`
}

function replaceFileExtensionWithSuffix(
  filename: string,
  suffix: string,
  extension: string,
): string {
  const trimmed = filename.trim() || 'image'
  return /\.[^.]+$/.test(trimmed)
    ? trimmed.replace(/(\.[^.]+)$/, `${suffix}${extension}`)
    : `${trimmed}${suffix}${extension}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatCompression(
  originalSize: number,
  compressedSize: number,
): string {
  if (compressedSize >= originalSize)
    return `${formatBytes(originalSize)} · 保留原图`
  return `${formatBytes(originalSize)} → ${formatBytes(compressedSize)}`
}

function isJpegFile(file: File): boolean {
  return file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name)
}

function hasExifHeader(view: DataView, offset: number): boolean {
  if (offset + EXIF_HEADER_BYTES.length > view.byteLength) return false

  return EXIF_HEADER_BYTES.every(
    (byte, index) => view.getUint8(offset + index) === byte,
  )
}

function readAscii(view: DataView, offset: number, length: number): string {
  let value = ''

  for (let index = 0; index < length; index += 1) {
    const code = view.getUint8(offset + index)
    if (code === 0) break
    value += String.fromCharCode(code)
  }

  return value.trim()
}

function toDateInputValue(value: string): string | null {
  const match = value
    .trim()
    .match(/^(\d{4}):(\d{2}):(\d{2})(?:\s+\d{2}:\d{2}:\d{2})?/)

  if (!match) return null

  const [, yearText, monthText, dayText] = match
  const year = Number.parseInt(yearText, 10)
  const month = Number.parseInt(monthText, 10)
  const day = Number.parseInt(dayText, 10)
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return `${yearText}-${monthText}-${dayText}`
}

function readIfdEntryCount(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  littleEndian: boolean,
): number | null {
  const entryCountOffset = tiffStart + ifdOffset
  if (entryCountOffset < tiffStart || entryCountOffset + 2 > view.byteLength)
    return null

  return view.getUint16(entryCountOffset, littleEndian)
}

function readIfdLongTag(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  littleEndian: boolean,
  targetTag: number,
): number | null {
  const entryCount = readIfdEntryCount(view, tiffStart, ifdOffset, littleEndian)
  if (entryCount === null) return null

  const firstEntryOffset = tiffStart + ifdOffset + 2

  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = firstEntryOffset + index * 12
    if (entryOffset + 12 > view.byteLength) return null
    if (view.getUint16(entryOffset, littleEndian) !== targetTag) continue

    const type = view.getUint16(entryOffset + 2, littleEndian)
    const count = view.getUint32(entryOffset + 4, littleEndian)
    if (type !== TIFF_TYPE_LONG || count < 1) return null

    return view.getUint32(entryOffset + 8, littleEndian)
  }

  return null
}

function readIfdAsciiTag(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  littleEndian: boolean,
  targetTag: number,
): string | null {
  const entryCount = readIfdEntryCount(view, tiffStart, ifdOffset, littleEndian)
  if (entryCount === null) return null

  const firstEntryOffset = tiffStart + ifdOffset + 2

  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = firstEntryOffset + index * 12
    if (entryOffset + 12 > view.byteLength) return null
    if (view.getUint16(entryOffset, littleEndian) !== targetTag) continue

    const type = view.getUint16(entryOffset + 2, littleEndian)
    const count = view.getUint32(entryOffset + 4, littleEndian)
    if (type !== TIFF_TYPE_ASCII || count < 1) return null

    const valueOffset =
      count <= 4
        ? entryOffset + 8
        : tiffStart + view.getUint32(entryOffset + 8, littleEndian)

    if (valueOffset < tiffStart || valueOffset + count > view.byteLength)
      return null

    return readAscii(view, valueOffset, count)
  }

  return null
}

function readFirstExifDate(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  littleEndian: boolean,
  tags: readonly number[],
): string | null {
  for (const tag of tags) {
    const value = readIfdAsciiTag(view, tiffStart, ifdOffset, littleEndian, tag)
    const dateInputValue = value ? toDateInputValue(value) : null
    if (dateInputValue) return dateInputValue
  }

  return null
}

function parseTiffExifDate(view: DataView, tiffStart: number): string | null {
  if (tiffStart + 8 > view.byteLength) return null

  const byteOrder = readAscii(view, tiffStart, 2)
  const littleEndian = byteOrder === 'II'
  if (!littleEndian && byteOrder !== 'MM') return null

  if (view.getUint16(tiffStart + 2, littleEndian) !== 42) return null

  const firstIfdOffset = view.getUint32(tiffStart + 4, littleEndian)
  const exifIfdOffset = readIfdLongTag(
    view,
    tiffStart,
    firstIfdOffset,
    littleEndian,
    EXIF_IFD_POINTER_TAG,
  )

  if (exifIfdOffset !== null) {
    const exifDate = readFirstExifDate(
      view,
      tiffStart,
      exifIfdOffset,
      littleEndian,
      EXIF_DATE_TAGS,
    )
    if (exifDate) return exifDate
  }

  return readFirstExifDate(
    view,
    tiffStart,
    firstIfdOffset,
    littleEndian,
    EXIF_DATE_TAGS,
  )
}

function parseJpegExifDate(view: DataView): string | null {
  if (
    view.byteLength < 4 ||
    view.getUint8(0) !== 0xff ||
    view.getUint8(1) !== 0xd8
  ) {
    return null
  }

  let offset = 2

  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break

    while (offset < view.byteLength && view.getUint8(offset) === 0xff) {
      offset += 1
    }

    if (offset >= view.byteLength) break

    const marker = view.getUint8(offset)
    offset += 1

    if (marker === JPEG_EOI_MARKER || marker === JPEG_SOS_MARKER) break
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue
    if (offset + 2 > view.byteLength) break

    const segmentLength = view.getUint16(offset, false)
    if (segmentLength < 2) break

    const segmentStart = offset + 2
    const segmentEnd = offset + segmentLength
    if (segmentEnd > view.byteLength) break

    if (marker === JPEG_APP1_MARKER && hasExifHeader(view, segmentStart)) {
      return parseTiffExifDate(view, segmentStart + EXIF_HEADER_BYTES.length)
    }

    offset = segmentEnd
  }

  return null
}

export async function extractImageTakenDate(
  file: File,
): Promise<string | null> {
  if (!isJpegFile(file)) return null

  try {
    const buffer = await file.slice(0, MAX_EXIF_READ_BYTES).arrayBuffer()
    return parseJpegExifDate(new DataView(buffer))
  } catch {
    return null
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error(`${file.name} 读取失败`))
    }

    image.src = objectUrl
  })
}

function getImageDimensions(image: HTMLImageElement): ImageDimensions {
  return {
    height: image.naturalHeight || image.height,
    width: image.naturalWidth || image.width,
  }
}

function getScaledImageSize(
  image: HTMLImageElement,
  maxLongEdge: number,
): { height: number; resized: boolean; width: number } {
  const { height: sourceHeight, width: sourceWidth } = getImageDimensions(image)
  const longEdge = Math.max(sourceWidth, sourceHeight)
  const scale = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1

  return {
    height: Math.max(1, Math.round(sourceHeight * scale)),
    resized: scale < 1,
    width: Math.max(1, Math.round(sourceWidth * scale)),
  }
}

async function renderLoadedImageForUpload(
  file: File,
  image: HTMLImageElement,
  {
    maxLongEdge,
    quality,
    suffix = '',
  }: { maxLongEdge: number; quality: number; suffix?: string },
): Promise<{ file: File; height: number; resized: boolean; width: number }> {
  const { height, resized, width } = getScaledImageSize(image, maxLongEdge)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器不支持图片压缩')

  context.drawImage(image, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, IMAGE_OUTPUT_TYPE, quality)
  })

  if (!blob) throw new Error('当前浏览器无法导出 WebP 图片')

  return {
    file: new File(
      [blob],
      suffix
        ? replaceFileExtensionWithSuffix(file.name, suffix, '.webp')
        : replaceFileExtension(file.name, '.webp'),
      {
        type: IMAGE_OUTPUT_TYPE,
        lastModified: file.lastModified,
      },
    ),
    height,
    resized,
    width,
  }
}

export async function compressImageForUpload(file: File): Promise<File> {
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file
  }

  const image = await loadImage(file)
  const rendered = await renderLoadedImageForUpload(file, image, {
    maxLongEdge: Number.POSITIVE_INFINITY,
    quality: IMAGE_OUTPUT_QUALITY,
  })
  return rendered.file.size >= file.size ? file : rendered.file
}

export async function createAlbumImageFiles(file: File): Promise<{
  height: number
  image: File
  thumb: File
  width: number
}> {
  const image = await loadImage(file)
  const dimensions = getImageDimensions(image)
  const thumb = await renderLoadedImageForUpload(file, image, {
    maxLongEdge: ALBUM_THUMB_MAX_LONG_EDGE,
    quality: ALBUM_THUMB_QUALITY,
    suffix: '-thumb',
  })
  const renderedImage =
    file.type === 'image/svg+xml' || file.type === 'image/gif'
      ? { file }
      : await renderLoadedImageForUpload(file, image, {
          maxLongEdge: Number.POSITIVE_INFINITY,
          quality: IMAGE_OUTPUT_QUALITY,
        })

  return {
    height: dimensions.height,
    image:
      renderedImage.file.size >= file.size && renderedImage.file !== file
        ? file
        : renderedImage.file,
    thumb: thumb.file,
    width: dimensions.width,
  }
}

export function createUploadObjectId(): string {
  const bytes = new Uint8Array(3)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  )
}

async function readJsonResponse<T>(
  response: Response,
): Promise<UploadApiResponse<T>> {
  try {
    return (await response.json()) as UploadApiResponse<T>
  } catch {
    return {
      success: false,
      message: `请求失败：${response.status}`,
    }
  }
}

export async function uploadImageFile(
  uploadFile: File,
  options: UploadImageOptions = {},
): Promise<string> {
  const signResponse = await fetch('/api/upload-sign', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename: uploadFile.name,
      contentType: uploadFile.type || 'application/octet-stream',
      folder: options.folder,
      objectId: options.objectId,
      size: uploadFile.size,
      variant: options.variant,
    }),
    signal: options.signal,
  })
  const signPayload = await readJsonResponse<UploadSignResult>(signResponse)

  if (!signResponse.ok || !signPayload.success || !signPayload.data) {
    throw new Error(signPayload.message || '图片上传签名失败')
  }

  const uploadHeaders = new Headers()
  Object.entries(signPayload.data.headers || {}).forEach(([key, value]) => {
    if (value) uploadHeaders.set(key, value)
  })

  const uploadResponse = await fetch(signPayload.data.uploadUrl, {
    method: 'PUT',
    headers: uploadHeaders,
    body: uploadFile,
    signal: options.signal,
  })

  if (!uploadResponse.ok) {
    throw new Error(`图片直传失败：${uploadResponse.status}`)
  }

  const completeResponse = await fetch('/api/upload-complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ key: signPayload.data.key }),
    signal: options.signal,
  })
  const completePayload =
    await readJsonResponse<UploadCompleteResult>(completeResponse)
  const imageUrl = completePayload.data?.url || signPayload.data.url

  if (!completeResponse.ok || !completePayload.success || !imageUrl) {
    throw new Error(completePayload.message || '图片上传确认失败')
  }

  return imageUrl
}
