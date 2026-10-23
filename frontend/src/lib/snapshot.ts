import type { Comparison, Fuel, Price, Selection, Snapshot } from './contracts'
import { percent } from './numbers'

export function snapshotPrice(
  snapshot: Snapshot,
  region: string,
  fuel: Fuel,
  from: string,
  to: string,
  today = new Date().toISOString().slice(0, 10),
): Price {
  const all = snapshot.observations
    .filter((row) => row.region_id === region && row.fuel_type === fuel)
    .sort((a, b) => a.date.localeCompare(b.date))
  const points = all
    .filter((row) => row.date >= from && row.date <= to)
    .map(({ date, price_kopecks, source_id }) => ({ date, price_kopecks, source_id }))
  const expected = snapshot.meta.expected_dates.filter((date) => date >= from && date <= to)
  const missing = expected.filter((date) => !points.some((point) => point.date === date))
  const warnings: string[] = []
  if (missing.length) warnings.push('INCOMPLETE_PERIOD')
  if (points.length < 2) warnings.push('INSUFFICIENT_POINTS')
  if (all.length && (Date.parse(today) - Date.parse(all.at(-1)!.date)) / 86_400_000 > 14)
    warnings.push('STALE_DATA')
  if (!all.length) warnings.push('NO_DATA_FOR_REGION_FUEL')
  const first = points[0]?.price_kopecks
  const last = points.at(-1)?.price_kopecks
  return {
    schema_version: '1',
    dataset_version: snapshot.meta.dataset_version,
    generated_at: new Date().toISOString(),
    warnings,
    region_id: region,
    fuel_type: fuel,
    requested_period: { from, to },
    actual_period: points.length ? { from: points[0].date, to: points.at(-1)!.date } : null,
    expected_dates: expected,
    missing_dates: missing,
    observations: points,
    summary: {
      latest_price_kopecks: last ?? null,
      min_price_kopecks: points.length
        ? Math.min(...points.map((point) => point.price_kopecks))
        : null,
      max_price_kopecks: points.length
        ? Math.max(...points.map((point) => point.price_kopecks))
        : null,
      change_kopecks: points.length > 1 ? last! - first : null,
      change_percent: points.length > 1 ? percent(last!, first) : null,
    },
  }
}
export function snapshotComparison(snapshot: Snapshot, selection: Selection): Comparison {
  const regions = [selection.region, ...selection.compare]
  const series = regions.map((region) =>
    snapshotPrice(snapshot, region, selection.fuel, selection.from, selection.to),
  )
  const common = series[0].observations
    .map((point) => point.date)
    .filter((date) =>
      series.every((item) => item.observations.some((point) => point.date === date)),
    )
  const start = common[0] ?? null
  const end = common.at(-1) ?? null
  const base = series[0].observations.find((point) => point.date === end)?.price_kopecks
  const rows = common.length
    ? series.map((item) => {
        const old = item.observations.find((point) => point.date === start)!.price_kopecks
        const price = item.observations.find((point) => point.date === end)!.price_kopecks
        return {
          region_id: item.region_id,
          price_kopecks: price,
          difference_kopecks: price - base!,
          difference_percent: percent(price, base!),
          change_kopecks: common.length > 1 ? price - old : null,
          change_percent: common.length > 1 ? percent(price, old) : null,
        }
      })
    : []
  return {
    schema_version: '1',
    dataset_version: snapshot.meta.dataset_version,
    generated_at: new Date().toISOString(),
    warnings: [...new Set(series.flatMap((item) => item.warnings))].sort(),
    fuel_type: selection.fuel,
    base_region: selection.region,
    requested_period: { from: selection.from, to: selection.to },
    actual_period: common.length ? { from: start!, to: end! } : null,
    common_dates: common,
    comparison_start: start,
    comparison_end: end,
    comparable: !!common.length,
    reason: common.length > 1 ? null : common.length ? 'ONE_COMMON_DATE' : 'NO_COMMON_DATES',
    series,
    rows,
  }
}
