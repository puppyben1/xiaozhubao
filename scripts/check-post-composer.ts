import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { renderMarkdownPreview } from '../src/lib/markdown-preview.ts'

// Run the actual page script against a small DOM and mock only network/storage.
const page = readFileSync(
  new URL('../src/pages/posts/new.astro', import.meta.url),
  'utf8',
)
const source = page
  .split('<script>')[1]
  .split('</script>')[0]
  .replace(/import[\s\S]*?from '[^']+'\s*/g, '')
const script = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.None,
  },
}).outputText

function setup(stored?: object) {
  const storage = new Map(
    stored ? [['puppyben_post_draft', JSON.stringify(stored)]] : [],
  )
  const elements = new Map<string, ReturnType<typeof element>>()
  function element(id: string, value = '') {
    return {
      id,
      value,
      checked: false,
      disabled: false,
      hidden: false,
      textContent: '',
      innerHTML: '',
      src: '',
      href: '',
      files: [] as object[],
      dataset: {} as Record<string, string>,
      selectionStart: 0,
      selectionEnd: 0,
      handlers: {} as Record<string, ((event: Event) => unknown)[]>,
      addEventListener(type: string, handler: (event: Event) => unknown) {
        ;(this.handlers[type] ||= []).push(handler)
      },
      async emit(type: string, event: Partial<Event> = {}) {
        for (const handler of this.handlers[type] || [])
          await handler(event as Event)
      },
      setAttribute(name: string, value: string) {
        if (name === 'disabled') this.disabled = true
        else Reflect.set(this, name, value)
      },
      removeAttribute(name: string) {
        if (name === 'disabled') this.disabled = false
        else Reflect.set(this, name, '')
      },
      setRangeText(text: string, start: number, end: number) {
        this.value = this.value.slice(0, start) + text + this.value.slice(end)
      },
      focus() {},
      click() {},
    }
  }
  const get = (id: string) => {
    if (!elements.has(id)) elements.set(id, element(id))
    return elements.get(id)!
  }
  const radios = ['posts', 'notes', 'questions'].map((value) =>
    element(value, value),
  )
  radios[0].checked = true
  const form = Object.assign(get('post-form'), {
    querySelectorAll: () => radios,
    querySelector: (selector: string) =>
      selector.includes(':checked') ? radios.find((r) => r.checked) : radios[0],
    reset() {
      for (const [id, field] of elements)
        if (id.startsWith('post-') && id !== 'post-cover') field.value = ''
      radios.forEach((r, i) => (r.checked = i === 0))
    },
  })
  get('post-composer').dataset.configured = 'true'
  let succeeds = true
  let uploadFails = false
  let published: Record<string, unknown> = {}
  runInNewContext(script, {
    document: { getElementById: get, addEventListener() {} },
    localStorage: {
      getItem: (key: string) => storage.get(key),
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    crypto,
    window: { confirm: () => true },
    renderMarkdownPreview,
    compressImageForUpload: async (file: object) => file,
    uploadImageFile: async () => {
      if (uploadFails) throw new Error('upload failed')
      return 'https://example.com/image.webp'
    },
    escapeMarkdownAlt: (name: string) => name,
    fetch: async (_url: string, init: RequestInit) => {
      published = JSON.parse(String(init.body))
      return { ok: succeeds }
    },
    readApiResponse: async () => ({
      success: succeeds,
      message: succeeds ? 'published' : 'failed',
      data: { commitUrl: 'https://github.com/example/commit/123' },
    }),
  })
  const input = (id: string) => get(`post-${id}`)
  return {
    input,
    form,
    radios,
    storage,
    published: () => published,
    failPublish: () => (succeeds = false),
    failUpload: () => (uploadFails = true),
  }
}

const old = {
  title: 'Unpublished',
  content: 'Draft body',
  section: 'notes',
  cover: 'https://example.com/old.webp',
  slug: 'old-draft',
  requestId: crypto.randomUUID(),
}
const editor = setup(old)
assert.equal(editor.input('title').value, old.title)
assert.equal(editor.radios[1].checked, true)
assert.equal(editor.input('cover-image').src, old.cover)
assert.equal(editor.input('preview-body').innerHTML, '<p>Draft body</p>')
editor.input('content').value = '![photo](/uploads/test.webp)'
await editor.form.emit('input')
assert.match(
  editor.input('preview-body').innerHTML,
  /<img src="\/uploads\/test.webp"/,
)
assert.match(editor.storage.get('puppyben_post_draft')!, /test.webp/)
// Upload events launch asynchronous work; allow its promises to settle.
editor.input('cover-file').files = [{ name: 'cover.png' }]
await editor.input('cover-file').emit('change')
await new Promise((resolve) => setImmediate(resolve))
assert.equal(editor.input('cover').value, 'https://example.com/image.webp')
assert.equal(editor.input('cover-image').src, editor.input('cover').value)
editor.input('preview').hidden = true
editor.input('image-file').files = [{ name: 'body.png' }]
await editor.input('image-file').emit('change')
await new Promise((resolve) => setImmediate(resolve))
assert.equal(editor.input('preview').hidden, false)
assert.match(editor.input('content').value, /!\[body.png\]/)
await editor.form.emit('submit', { preventDefault() {} })
assert.equal(editor.published().section, 'notes')
assert.equal(editor.published().cover, 'https://example.com/image.webp')
assert.equal(editor.input('link').href, '/posts/old-draft')
assert.equal(editor.storage.size, 0)
assert.equal(editor.input('title').value, '')
assert.equal(editor.input('content').value, '')
assert.equal(editor.input('cover').value, '')
assert.equal(editor.input('cover-image').hidden, true)
assert.notEqual(editor.input('slug').value, old.slug)

const failed = setup(old)
failed.failPublish()
await failed.form.emit('submit', { preventDefault() {} })
assert.equal(failed.input('title').value, old.title)
assert.equal(
  JSON.parse(failed.storage.get('puppyben_post_draft')!).requestId,
  old.requestId,
)
assert.equal(failed.radios[1].disabled, false)
failed.failUpload()
failed.input('cover-file').files = [{ name: 'bad.png' }]
await failed.input('cover-file').emit('change')
await new Promise((resolve) => setImmediate(resolve))
assert.equal(failed.input('cover').value, old.cover)
assert.equal(failed.input('submit').disabled, false)
await failed.input('new').emit('click')
assert.equal(failed.storage.size, 0)
assert.equal(failed.input('content').value, '')
assert.equal(failed.radios[0].checked, true)
console.log(
  'Post composer checks passed: draft restore/reset, live images, cover upload, category, publish success and failure retention.',
)
