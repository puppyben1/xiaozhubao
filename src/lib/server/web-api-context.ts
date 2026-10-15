// Preserve the existing comments/likes handlers' response and query semantics
// while running them through Astro's bundled Web Request entry point.
export async function webApiContext(request: Request) {
  const headers = new Headers()
  let status = 200
  const url = new URL(request.url)
  const query: Record<string, string | string[]> = {}
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key)
    query[key] = values.length === 1 ? values[0] : values
  }
  let body: unknown = null
  if (request.method === 'POST') {
    try {
      body = await request.json()
    } catch {
      /* Existing handlers validate empty bodies. */
    }
  }
  const res = {
    setHeader(name: string, value: string) {
      headers.set(name, value)
    },
    status(value: number) {
      status = value
      return res
    },
    json(value: unknown) {
      return Response.json(value, { status, headers })
    },
    end() {
      return new Response(null, { status, headers })
    },
  }
  return {
    req: {
      method: request.method,
      headers: Object.fromEntries(request.headers),
      query,
      body,
      socket: undefined as { remoteAddress?: string } | undefined,
    },
    res,
  }
}
