const resources = new Set(['meta', 'prices', 'comparison'])
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function failure(status: number, code: string) {
  return Response.json(
    { error: { code, message: code } },
    { status, headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function GET(request: Request, { params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params
  if (!resources.has(resource)) return failure(404, 'ENDPOINT_NOT_FOUND')
  const configured =
    process.env.FUEL_API_BASE_URL ||
    (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8011' : '')
  if (!configured) return failure(503, 'API_NOT_CONFIGURED')
  let target: URL
  try {
    const base = new URL(configured)
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)
    if (
      (base.protocol !== 'https:' && !(local && base.protocol === 'http:')) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      base.pathname !== '/'
    ) {
      return failure(503, 'INVALID_API_CONFIGURATION')
    }
    target = new URL(`/api/v1/${resource}`, base)
    target.search = new URL(request.url).search
  } catch {
    return failure(503, 'INVALID_API_CONFIGURATION')
  }
  try {
    const upstream = await fetch(target, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(1800)]),
    })
    const headers = new Headers()
    for (const key of ['Content-Type', 'Cache-Control', 'Retry-After', 'X-Request-ID']) {
      const value = upstream.headers.get(key)
      if (value) headers.set(key, value)
    }
    if (!headers.has('Cache-Control') || !upstream.ok) headers.set('Cache-Control', 'no-store')
    return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers })
  } catch {
    return failure(503, 'UPSTREAM_UNAVAILABLE')
  }
}
