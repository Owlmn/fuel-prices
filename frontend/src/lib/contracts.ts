import { z } from 'zod'

const day = z.iso.date()
const money = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const signed = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
const percentage = z.string().regex(/^-?\d+\.\d{2}$/)
const envelope = {
  schema_version: z.literal('1'),
  dataset_version: z.string().min(1),
  generated_at: z.string(),
  warnings: z.array(z.string()),
}
export const fuelSchema = z.enum(['diesel', 'ai92', 'ai95'])
export type Fuel = z.infer<typeof fuelSchema>
export const pointSchema = z.object({ date: day, price_kopecks: money, source_id: z.string() })
export const priceSchema = z.object({
  ...envelope,
  region_id: z.string(),
  fuel_type: fuelSchema,
  requested_period: z.object({ from: day, to: day }),
  actual_period: z.object({ from: day, to: day }).nullable(),
  expected_dates: z.array(day),
  missing_dates: z.array(day),
  observations: z.array(pointSchema),
  summary: z.object({
    latest_price_kopecks: money.nullable(),
    min_price_kopecks: money.nullable(),
    max_price_kopecks: money.nullable(),
    change_kopecks: signed.nullable(),
    change_percent: percentage.nullable(),
  }),
})
export const comparisonSchema = z.object({
  ...envelope,
  fuel_type: fuelSchema,
  base_region: z.string(),
  requested_period: z.object({ from: day, to: day }),
  actual_period: z.object({ from: day, to: day }).nullable(),
  common_dates: z.array(day),
  comparison_start: day.nullable(),
  comparison_end: day.nullable(),
  comparable: z.boolean(),
  reason: z.string().nullable(),
  series: z.array(priceSchema),
  rows: z.array(
    z.object({
      region_id: z.string(),
      price_kopecks: money,
      difference_kopecks: signed,
      difference_percent: percentage,
      change_kopecks: signed.nullable(),
      change_percent: percentage.nullable(),
    }),
  ),
})
export const metaSchema = z.object({
  ...envelope,
  active_version: z.string(),
  published_at: z.string(),
  regions: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        price_area: z.string().nullable(),
        available: z.boolean(),
      }),
    )
    .refine((regions) => regions.some((region) => region.available)),
  fuel_types: z.array(z.object({ id: fuelSchema, name: z.string() })),
  expected_dates: z.array(day).min(1),
  coverage: z.array(
    z.object({
      region_id: z.string(),
      fuel_type: fuelSchema,
      first_observation_date: day.nullable(),
      latest_observation_date: day.nullable(),
      count: z.number().int().nonnegative(),
      missing_dates: z.array(day),
      stale: z.boolean(),
      available: z.boolean(),
    }),
  ),
  sources: z.array(
    z.object({
      id: z.string(),
      url: z.url().refine((value) => {
        const url = new URL(value)
        return (
          url.protocol === 'https:' &&
          (url.hostname === 'rosstat.gov.ru' || url.hostname.endsWith('.rosstat.gov.ru'))
        )
      }),
      sha256: z.string(),
      published_date: day,
      observation_date: day,
    }),
  ),
  last_successful_check_at: z.string().nullable(),
  last_published_at: z.string().nullable(),
  update_status: z.string(),
  source_tls_verified: z.boolean().nullable(),
})
export const snapshotSchema = z.object({
  meta: metaSchema,
  observations: z.array(pointSchema.extend({ region_id: z.string(), fuel_type: fuelSchema })),
})
export type Meta = z.infer<typeof metaSchema>
export type Region = Meta['regions'][number]
export type Price = z.infer<typeof priceSchema>
export type Comparison = z.infer<typeof comparisonSchema>
export type Snapshot = z.infer<typeof snapshotSchema>
export type Selection = { region: string; fuel: Fuel; from: string; to: string; compare: string[] }
export type Dataset = { mode: 'api' | 'snapshot'; meta: Meta; snapshot?: Snapshot }

export function checkVersion<T extends { dataset_version: string }>(data: T, version: string): T {
  if (data.dataset_version !== version)
    throw new Error('Версия ответа не совпадает с выбранным набором. Обновите подключение.')
  return data
}
