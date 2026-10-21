import path from 'node:path'

export interface ContentImageEntry {
  /** Repo-relative path, used in problem messages. */
  file: string
  /** Absolute path, used to resolve relative references. */
  absolutePath: string
  text: string
}

export interface ContentImageProblem {
  file: string
  line: number
  reference: string
  reason: string
}

export type FileExists = (absolutePath: string) => boolean

export interface ContentImageScanOptions {
  contentDir: string
  publicDir: string
  exists: FileExists
}

export interface ContentImageScanResult {
  problems: ContentImageProblem[]
  local: number
  external: number
}

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/
const INLINE_CODE = /`[^`\n]*`/g
const MARKDOWN_IMAGE =
  /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g
const HTML_IMAGE = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i

function lineAt(text: string, index: number) {
  let line = 1
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) line += 1
  }
  return line
}

interface FenceMarker {
  char: string
  length: number
  info: string
}

function fenceMarker(line: string): FenceMarker | null {
  const match = line.match(FENCE)
  if (!match) return null
  return { char: match[1][0], length: match[1].length, info: match[2] }
}

/**
 * Blank out fenced blocks and inline code while preserving offsets, so
 * documentation examples never fail the check or shift line numbers.
 */
function maskCode(text: string) {
  let open: { char: string; length: number } | null = null
  // Split on CRLF too: a trailing \r would stop the fence regex from matching
  // and expose code examples as real image references.
  return text
    .split(/\r?\n/)
    .map((line) => {
      const marker = fenceMarker(line)
      if (open === null) {
        if (marker) {
          open = { char: marker.char, length: marker.length }
          return ''
        }
        return line.replace(INLINE_CODE, (span) => ' '.repeat(span.length))
      }
      // A closing fence uses the same character, is at least as long as the
      // opener and carries no info string; shorter inner fences stay content.
      if (
        marker &&
        marker.char === open.char &&
        marker.length >= open.length &&
        marker.info.trim() === ''
      ) {
        open = null
      }
      return ''
    })
    .join('\n')
}

function imageReferences(text: string) {
  const masked = maskCode(text)
  const references: { reference: string; line: number }[] = []
  for (const match of masked.matchAll(MARKDOWN_IMAGE)) {
    references.push({
      reference: match[1],
      line: lineAt(masked, match.index ?? 0),
    })
  }
  for (const match of masked.matchAll(HTML_IMAGE)) {
    const reference = match[1] ?? match[2] ?? match[3]
    if (reference) {
      references.push({
        reference,
        line: lineAt(masked, match.index ?? 0),
      })
    }
  }
  return references
}

function decodePath(reference: string) {
  const clean = reference.split('#')[0].split('?')[0]
  try {
    return decodeURI(clean)
  } catch {
    return clean
  }
}

function isInside(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return (
    relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
  )
}

function classifyReference(
  reference: string,
  entry: ContentImageEntry,
  options: ContentImageScanOptions,
): 'local' | 'external' | string {
  const target = reference.trim()
  if (target === '') return '图片地址为空'
  if (EXTERNAL.test(target)) return 'external'
  const clean = decodePath(target)
  if (clean.startsWith('/')) {
    const resolved = path.resolve(options.publicDir, `.${clean}`)
    if (!isInside(options.publicDir, resolved)) {
      return '站点绝对路径越出了 public/'
    }
    return options.exists(resolved) ? 'local' : 'public/ 下不存在该文件'
  }
  const resolved = path.resolve(path.dirname(entry.absolutePath), clean)
  if (!isInside(options.contentDir, resolved)) {
    return '相对图片必须位于 src/content/ 内（Astro 内容资源限制）'
  }
  return options.exists(resolved) ? 'local' : '相对路径指向的文件不存在'
}

export function collectContentImageProblems(
  entries: ContentImageEntry[],
  options: ContentImageScanOptions,
): ContentImageScanResult {
  const problems: ContentImageProblem[] = []
  let local = 0
  let external = 0
  for (const entry of entries) {
    for (const { reference, line } of imageReferences(entry.text)) {
      const result = classifyReference(reference, entry, options)
      if (result === 'local') local += 1
      else if (result === 'external') external += 1
      else {
        problems.push({ file: entry.file, line, reference, reason: result })
      }
    }
  }
  return { problems, local, external }
}
