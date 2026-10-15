function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  )
}

function safeUrl(value: string): boolean {
  return (
    !Array.from(value).some(
      (char) => char.charCodeAt(0) < 32 || /\s/.test(char),
    ) && /^(https?:\/\/|\/(?!\/)|#)/i.test(value)
  )
}

// A small escaped preview; raw HTML, MDX, tables and plugins remain literal here.
export function renderMarkdownPreview(text: string): string {
  const tokens: string[] = []
  const token = (html: string) => `\uE000${tokens.push(html) - 1}\uE001`
  function inline(source: string): string {
    let value = escapeHtml(source.replace(/[\uE000\uE001]/g, ''))
    value = value.replace(/`([^`]+)`/g, (_, code: string) =>
      token(`<code>${code}</code>`),
    )
    value = value.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (original, alt: string, url: string) =>
        safeUrl(url) && !url.startsWith('#')
          ? token(`<img src="${url}" alt="${alt}" loading="lazy" />`)
          : original,
    )
    value = value.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (original, label: string, url: string) =>
        safeUrl(url)
          ? token(
              `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`,
            )
          : original,
    )
    return value
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
  }
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const output: string[] = []
  let paragraph: string[] = []
  let list: 'ul' | 'ol' | null = null
  let code: string[] | null = null
  const flush = () => {
    if (paragraph.length)
      output.push(`<p>${paragraph.map(inline).join('<br>')}</p>`)
    paragraph = []
    if (list) output.push(`</${list}>`)
    list = null
  }
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (code) {
        output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
        code = null
      } else {
        flush()
        code = []
      }
      continue
    }
    if (code) {
      code.push(line)
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    const item = line.match(/^\s*(?:([-*+])|\d+\.)\s+(.+)$/)
    if (heading) {
      flush()
      const level = Math.max(2, heading[1].length)
      output.push(`<h${level}>${inline(heading[2])}</h${level}>`)
    } else if (item) {
      const kind = item[1] ? 'ul' : 'ol'
      if (list !== kind) {
        flush()
        list = kind
        output.push(`<${kind}>`)
      }
      output.push(`<li>${inline(item[2])}</li>`)
    } else if (/^>\s?/.test(line)) {
      flush()
      output.push(
        `<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`,
      )
    } else if (!line.trim()) flush()
    else {
      if (list) flush()
      paragraph.push(line)
    }
  }
  if (code)
    output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
  flush()
  return output
    .join('\n')
    .replace(
      /\uE000(\d+)\uE001/g,
      (_, index: string) => tokens[Number(index)] || '',
    )
}
