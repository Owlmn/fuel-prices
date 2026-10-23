import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkVersion, priceSchema, snapshotSchema, type Selection } from './contracts'
import { snapshotComparison, snapshotPrice } from './snapshot'
import { readSelection, selectionUrl } from './selection'
import contract from '../../../shared/comparison-cases.json'

const snapshot = snapshotSchema.parse(
  JSON.parse(readFileSync(new URL('../../public/snapshot.json', import.meta.url), 'utf8')),
)
const selection: Selection = {
  region: 'primorsky_krai',
  compare: ['khabarovsk_krai', 'amur_oblast'],
  fuel: 'diesel',
  from: '2026-09-28',
  to: '2026-10-19',
}
afterEach(() => vi.useRealTimers())
describe('Резерв и согласованность', () => {
  it.each(contract.cases)('совпадает с Python API: $name', (expected) => {
    const fixture = structuredClone(snapshot)
    fixture.meta.expected_dates = contract.observations.map((point) => point.date)
    fixture.observations = contract.observations.flatMap((day) =>
      Object.entries(day.prices).flatMap(([region_id, price_kopecks]) =>
        price_kopecks === null
          ? []
          : [
              {
                region_id,
                fuel_type: 'diesel' as const,
                date: day.date,
                price_kopecks,
                source_id: 'synthetic',
              },
            ],
      ),
    )
    const result = snapshotComparison(fixture, {
      ...selection,
      from: expected.from,
      to: expected.to,
      compare: expected.compare,
    })
    expect(result.common_dates).toEqual(expected.common_dates)
    expect(result.reason).toBe(expected.reason)
    expect(result.rows).toEqual(expected.rows)
  })
  it('проверяет опубликованный снимок и происхождение каждой цены', () => {
    expect(snapshot.meta.regions.filter((region) => region.available)).toHaveLength(85)
    expect(snapshot.observations).toHaveLength(
      snapshot.meta.coverage.reduce((count, item) => count + item.count, 0),
    )
    const sourceIds = new Set(snapshot.meta.sources.map((source) => source.id))
    expect(snapshot.observations.every((point) => sourceIds.has(point.source_id))).toBe(true)
  })
  it('пустой период остаётся пустым', () => {
    const price = snapshotPrice(snapshot, selection.region, 'diesel', '2020-01-01', '2020-01-07')
    expect(price.summary.latest_price_kopecks).toBeNull()
    expect(price.actual_period).toBeNull()
    expect(price.observations).toHaveLength(0)
  })
  it('одна точка не создаёт динамику', () => {
    const price = snapshotPrice(snapshot, selection.region, 'diesel', '2026-10-19', '2026-10-19')
    expect(price.summary.latest_price_kopecks).toBe(9337)
    expect(price.summary.change_percent).toBeNull()
    expect(price.warnings).toContain('INSUFFICIENT_POINTS')
    expect(priceSchema.safeParse(price).success).toBe(true)
  })
  it('пропуск региона исключает дату из сравнения', () => {
    const missing = structuredClone(snapshot)
    missing.observations = missing.observations.filter(
      (point) => !(point.region_id === 'amur_oblast' && point.date === '2026-10-19'),
    )
    const comparison = snapshotComparison(missing, selection)
    expect(comparison.comparison_end).toBe('2026-10-12')
    expect(comparison.series[2].missing_dates).toContain('2026-10-19')
    expect(comparison.series[0].observations.at(-1)?.date).toBe('2026-10-19')
    expect(comparison.rows[0].price_kopecks).toBe(
      comparison.series[0].observations.find((point) => point.date === '2026-10-12')?.price_kopecks,
    )
  })
  it('без общей даты не подменяет её последними датами регионов', () => {
    const missing = structuredClone(snapshot)
    missing.observations = missing.observations.filter(
      (point) => point.region_id !== 'amur_oblast' || point.date < selection.from,
    )
    const comparison = snapshotComparison(missing, selection)
    expect(comparison.comparable).toBe(false)
    expect(comparison.rows).toHaveLength(0)
    expect(comparison.reason).toBe('NO_COMMON_DATES')
  })
  it('одна общая дата позволяет только сравнение уровня', () => {
    const comparison = snapshotComparison(snapshot, { ...selection, from: '2026-10-19' })
    expect(comparison.comparable).toBe(true)
    expect(comparison.reason).toBe('ONE_COMMON_DATE')
    expect(comparison.rows.every((row) => row.change_percent === null)).toBe(true)
  })
  it('определяет устаревание относительно текущей даты', () => {
    const price = snapshotPrice(
      snapshot,
      selection.region,
      'diesel',
      selection.from,
      selection.to,
      '2026-11-10',
    )
    expect(price.warnings).toContain('STALE_DATA')
  })
  it('не принимает другую версию или схему', () => {
    expect(() => checkVersion({ dataset_version: 'other' }, 'pinned')).toThrow()
    expect(
      snapshotSchema.safeParse({ ...snapshot, meta: { ...snapshot.meta, schema_version: '2' } })
        .success,
    ).toBe(false)
  })
  it('восстанавливает фильтры из URL без потери пустого сравнения', () => {
    const original = { ...selection, compare: [] }
    const read = readSelection(
      snapshot.meta,
      selectionUrl(original, 'calculator', snapshot.meta.dataset_version),
    )
    expect(read.selection).toEqual(original)
    expect(read.corrected).toBe(false)
    expect(read.view).toBe('calculator')
  })
  it('нормализует испорченный URL с явной отметкой', () => {
    const read = readSelection(
      snapshot.meta,
      '?region=unknown&fuel=jet&from=2026-02-31&to=2099-01-01&compare=unknown',
    )
    expect(read.corrected).toBe(true)
    expect(read.selection.region).toBe('primorsky_krai')
    expect(read.selection.fuel).toBe('diesel')
  })
})
