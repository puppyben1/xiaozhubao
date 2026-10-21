import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import {
  collectContentImageProblems,
  type ContentImageEntry,
} from '../src/lib/content-images.ts'

const root = process.cwd()
const contentDir = path.join(root, 'src', 'content')
const publicDir = path.join(root, 'public')

function listMarkdown(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...listMarkdown(full))
    else if (/\.mdx?$/i.test(entry.name)) files.push(full)
  }
  return files.sort()
}

function exists(file: string) {
  try {
    return statSync(file).isFile()
  } catch {
    return false
  }
}

const entries: ContentImageEntry[] = listMarkdown(contentDir).map((file) => ({
  file: path.relative(root, file).split(path.sep).join('/'),
  absolutePath: file,
  text: readFileSync(file, 'utf8'),
}))

const { problems, local, external } = collectContentImageProblems(entries, {
  contentDir,
  publicDir,
  exists,
})

if (problems.length > 0) {
  console.error(
    `Content images failed: ${problems.length} broken reference(s).`,
  )
  for (const problem of problems) {
    console.error(
      `  ${problem.file}:${problem.line}  ${problem.reference}  -> ${problem.reason}`,
    )
  }
  console.error(
    'Upload images through the editor (stored under public/uploads/) or commit them inside src/content/, then update the reference.',
  )
  process.exitCode = 1
} else {
  console.log(
    `Content images OK: ${local} local and ${external} external reference(s) in ${entries.length} Markdown files.`,
  )
}
