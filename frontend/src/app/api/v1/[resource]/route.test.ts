import { afterEach, expect, it, vi } from 'vitest'
import { GET } from './route'

const context = (resource = 'meta') => ({ params: Promise.resolve({ resource }) })
const request = (query = '') => new Request(`http://localhost:5173/api/v1/meta${query}`)
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('не предоставляет неизвестные и административные методы backend', async () => {
  const upstream = vi.fn()
  vi.stubGlobal('fetch', upstream)
  expect((await GET(request(), context('publish'))).status).toBe(404)
  expect(upstream).not.toHaveBeenCalled()
})

it('при отсутствии адреса в production возвращает 503 для резервного режима', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('FUEL_API_BASE_URL', '')
  const response = await GET(request(), context())
  expect(response.status).toBe(503)
  expect((await response.json()).error.code).toBe('API_NOT_CONFIGURED')
})

it.each([
  'file:///etc/passwd',
  'http://example.com',
  'https://user:password@example.com',
  'https://example.com?target=another',
])('отклоняет недопустимый адрес %s', async (configured) => {
  vi.stubEnv('FUEL_API_BASE_URL', configured)
  expect((await GET(request(), context())).status).toBe(503)
})

it('проксирует точный URL с версией и не пересылает cookies', async () => {
  vi.stubEnv('FUEL_API_BASE_URL', 'https://api.example.com')
  const upstream = vi
    .fn()
    .mockResolvedValue(
      new Response('{"dataset_version":"pinned"}', {
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': 'secret=value',
          'Cache-Control': 'public, max-age=60',
        },
      }),
    )
  vi.stubGlobal('fetch', upstream)
  const response = await GET(
    new Request('http://localhost:5173/api/v1/meta?dataset_version=pinned', {
      headers: { Cookie: 'session=user-session', Authorization: 'Bearer user-token' },
    }),
    context(),
  )
  expect(String(upstream.mock.calls[0][0])).toBe(
    'https://api.example.com/api/v1/meta?dataset_version=pinned',
  )
  expect(upstream.mock.calls[0][1].headers).toEqual({ Accept: 'application/json' })
  expect(response.headers.get('Set-Cookie')).toBeNull()
  expect(await response.json()).toEqual({ dataset_version: 'pinned' })
})

it('сохраняет 429 и Retry-After от backend', async () => {
  vi.stubEnv('FUEL_API_BASE_URL', 'https://api.example.com')
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response('{"error":{"code":"RATE_LIMITED"}}', {
          status: 429,
          headers: { 'Retry-After': '60' },
        }),
      ),
  )
  const response = await GET(request(), context())
  expect(response.status).toBe(429)
  expect(response.headers.get('Retry-After')).toBe('60')
  expect(response.headers.get('Cache-Control')).toBe('no-store')
})

it('при сетевой ошибке не раскрывает адрес или внутреннюю трассировку', async () => {
  vi.stubEnv('FUEL_API_BASE_URL', 'https://api.example.com')
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('internal failure with credentials')))
  const response = await GET(request(), context())
  expect(response.status).toBe(503)
  expect((await response.json()).error.code).toBe('UPSTREAM_UNAVAILABLE')
})
