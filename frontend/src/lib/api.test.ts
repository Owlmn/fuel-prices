import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { getMeta, getPrices } from './api'
import { snapshotSchema, type Selection } from './contracts'
import { snapshotPrice } from './snapshot'

const snapshot = snapshotSchema.parse(
  JSON.parse(readFileSync(new URL('../../public/snapshot.json', import.meta.url), 'utf8')),
)
const selection: Selection = {
  region: 'primorsky_krai',
  fuel: 'diesel',
  from: '2026-09-28',
  to: '2026-10-19',
  compare: [],
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('обращается к серверному API на том же домене и закрепляет версию', async () => {
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(snapshot.meta)))
  vi.stubGlobal('fetch', request)
  await getMeta(new AbortController().signal, snapshot.meta.dataset_version)
  expect(request).toHaveBeenCalledWith(
    `/api/v1/meta?dataset_version=${snapshot.meta.dataset_version}`,
    expect.anything(),
  )
})

it('не принимает ответ другой версии или региона', async () => {
  const body = snapshotPrice(
    snapshot,
    selection.region,
    selection.fuel,
    selection.from,
    selection.to,
  )
  const request = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ ...body, dataset_version: 'wrong' })))
  vi.stubGlobal('fetch', request)
  await expect(
    getPrices({ mode: 'api', meta: snapshot.meta }, selection, new AbortController().signal),
  ).rejects.toThrow('Версия ответа')
  request.mockResolvedValue(new Response(JSON.stringify({ ...body, region_id: 'wrong' })))
  await expect(
    getPrices({ mode: 'api', meta: snapshot.meta }, selection, new AbortController().signal),
  ).rejects.toThrow('другим фильтрам')
})

it('не подменяет 429 резервным набором', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'RATE_LIMITED' } }), { status: 429 }),
      ),
  )
  await expect(getMeta(new AbortController().signal)).rejects.toMatchObject({ unavailable: false })
})
