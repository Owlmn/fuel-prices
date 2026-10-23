import type { ZodType } from 'zod'
import {
  checkVersion,
  comparisonSchema,
  metaSchema,
  priceSchema,
  snapshotSchema,
  type Dataset,
  type Meta,
  type Selection,
  type Snapshot,
} from './contracts'
import { snapshotComparison, snapshotPrice } from './snapshot'

const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
export class ApiError extends Error {
  constructor(
    message: string,
    readonly unavailable = false,
  ) {
    super(message)
  }
}
const errorMessages: Record<string, string> = {
  DATASET_NOT_FOUND:
    'Выбранная версия данных недоступна. Можно открыть последнюю опубликованную версию.',
  REGION_NOT_FOUND: 'Регион не найден в наборе.',
  INVALID_PERIOD: 'Проверьте границы периода.',
  RATE_LIMITED: 'Слишком много запросов. Повторите через минуту.',
}
async function request<T>(path: string, schema: ZodType<T>, signal: AbortSignal): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted()
    let unavailable: ApiError
    try {
      const response = await fetch(`${base}/api/v1/${path}`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]),
        cache: 'no-cache',
      })
      if (!response.ok) {
        if (response.status >= 500) throw new ApiError('Сервис данных временно недоступен', true)
        const body = await response.json().catch(() => null)
        throw new ApiError(
          errorMessages[body?.error?.code] ?? `Не удалось получить данные (${response.status})`,
        )
      }
      const parsed = schema.safeParse(await response.json())
      if (!parsed.success)
        throw new ApiError('Ответ сервиса не соответствует контракту. Данные не показаны.')
      return parsed.data
    } catch (error) {
      signal.throwIfAborted()
      if (error instanceof ApiError && !error.unavailable) throw error
      if (error instanceof SyntaxError) throw new ApiError('Сервис вернул некорректный JSON.')
      unavailable =
        error instanceof ApiError
          ? error
          : new ApiError('Не удалось подключиться к сервису данных', true)
    }
    if (attempt === 2) throw unavailable
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer)
        reject(signal.reason)
      }
      const timer = setTimeout(
        () => {
          signal.removeEventListener('abort', abort)
          resolve()
        },
        attempt === 0 ? 300 : 600,
      )
      signal.addEventListener('abort', abort, { once: true })
    })
  }
  throw new ApiError('Сервис недоступен', true)
}
export async function getMeta(signal: AbortSignal, version?: string): Promise<Meta> {
  if (!base && import.meta.env.PROD) throw new ApiError('Сервис данных ещё не подключён', true)
  const meta = await request(
    `meta${version ? `?dataset_version=${encodeURIComponent(version)}` : ''}`,
    metaSchema,
    signal,
  )
  return version ? checkVersion(meta, version) : meta
}
let savedSnapshot: Promise<Snapshot> | undefined
export function getSnapshot(): Promise<Snapshot> {
  if (!savedSnapshot)
    savedSnapshot = fetch('/snapshot.json')
      .then(async (response) => {
        if (!response.ok) throw new Error('Резервный снимок недоступен')
        return snapshotSchema.parse(await response.json())
      })
      .catch((error) => {
        savedSnapshot = undefined
        throw error
      })
  return savedSnapshot
}
export async function getPrices(dataset: Dataset, selection: Selection, signal: AbortSignal) {
  if (dataset.mode === 'snapshot')
    return snapshotPrice(
      dataset.snapshot!,
      selection.region,
      selection.fuel,
      selection.from,
      selection.to,
    )
  const params = new URLSearchParams({
    region: selection.region,
    fuel: selection.fuel,
    from: selection.from,
    to: selection.to,
    dataset_version: dataset.meta.dataset_version,
  })
  const data = checkVersion(
    await request(`prices?${params}`, priceSchema, signal),
    dataset.meta.dataset_version,
  )
  if (
    data.region_id !== selection.region ||
    data.fuel_type !== selection.fuel ||
    data.requested_period.from !== selection.from ||
    data.requested_period.to !== selection.to
  ) {
    throw new ApiError('Ответ сервиса относится к другим фильтрам. Данные не показаны.')
  }
  return data
}
export async function getComparison(dataset: Dataset, selection: Selection, signal: AbortSignal) {
  if (dataset.mode === 'snapshot') return snapshotComparison(dataset.snapshot!, selection)
  const params = new URLSearchParams({
    base_region: selection.region,
    fuel: selection.fuel,
    from: selection.from,
    to: selection.to,
    dataset_version: dataset.meta.dataset_version,
  })
  ;[selection.region, ...selection.compare].forEach((region) => params.append('regions', region))
  const data = checkVersion(
    await request(`comparison?${params}`, comparisonSchema, signal),
    dataset.meta.dataset_version,
  )
  data.series.forEach((series) => checkVersion(series, dataset.meta.dataset_version))
  if (
    data.base_region !== selection.region ||
    data.fuel_type !== selection.fuel ||
    data.requested_period.from !== selection.from ||
    data.requested_period.to !== selection.to ||
    data.series.map((series) => series.region_id).join() !==
      [selection.region, ...selection.compare].join()
  ) {
    throw new ApiError('Ответ сравнения относится к другим фильтрам. Данные не показаны.')
  }
  return data
}
