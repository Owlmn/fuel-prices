import Decimal from 'decimal.js'

Decimal.set({ precision: 32, rounding: Decimal.ROUND_HALF_UP })
export { Decimal }
export const formatPrice = (kopecks: Decimal.Value | null | undefined) => {
  if (kopecks == null) return '—'
  const [whole, fraction] = new Decimal(kopecks).div(100).toFixed(2).split('.')
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')},${fraction}`
}
export const formatSigned = (kopecks: Decimal.Value | null) => {
  if (kopecks == null) return '—'
  const value = new Decimal(kopecks)
  return `${value.gt(0) ? '+' : value.lt(0) ? '−' : ''}${formatPrice(value.abs())}`
}
export const formatPercent = (value: string | null) =>
  value == null ? '—' : `${new Decimal(value).gt(0) ? '+' : ''}${value.replace('.', ',')}%`
export const formatVolume = (value: string | Decimal) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(value))
export const formatDate = (value: string | null | undefined, year = false) =>
  value
    ? new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'short',
        ...(year ? { year: 'numeric' } : {}),
        timeZone: 'UTC',
      })
        .format(new Date(`${value.slice(0, 10)}T00:00:00Z`))
        .replace(' г.', '')
    : '—'
export const percent = (value: number, base: number) =>
  new Decimal(value).minus(base).div(base).mul(100).toFixed(2)
export function costKopecks(liters: Decimal.Value, price: Decimal.Value): Decimal {
  return new Decimal(liters).mul(price).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
}
export function positiveInput(
  raw: string,
  max: number,
  integer = false,
  allowZero = false,
): { value: Decimal | null; error: string | null } {
  if (!raw.trim()) return { value: null, error: 'Заполните поле' }
  if (!(integer ? /^\d+$/ : /^\d+(?:[.,]\d{1,2})?$/).test(raw.trim())) {
    return {
      value: null,
      error: integer ? 'Введите целое число' : 'Число с точностью до двух знаков',
    }
  }
  const value = new Decimal(raw.trim().replace(',', '.'))
  if (value.lt(0) || (!allowZero && value.eq(0)))
    return { value: null, error: 'Значение должно быть больше нуля' }
  if (value.gt(max)) return { value: null, error: `Максимум ${formatVolume(String(max))}` }
  return { value, error: null }
}
export type Machine = {
  id: string
  name: string
  liters: string
  count: string
  fillMode?: 'liters' | 'tank'
  capacity?: string
  remaining?: string
}
export type CalculatorState = {
  mode: 'bulk' | 'machines'
  volume: string
  machines: Machine[]
  priceMode: 'regional' | 'custom'
  customPrice: string
}
export function calculate(state: CalculatorState, regionalPrice: number | null) {
  const bulk = positiveInput(state.volume, 1_000_000)
  const rows = state.machines.map((row) => {
    const capacity = positiveInput(row.capacity ?? '', 1_000_000)
    const remaining = positiveInput(row.remaining ?? '', 1_000_000, false, true)
    if (capacity.value && remaining.value?.gt(capacity.value)) {
      remaining.error = 'Остаток не может превышать объём бака'
      remaining.value = null
    }
    const liters =
      row.fillMode === 'tank'
        ? {
            value: capacity.value && remaining.value ? capacity.value.minus(remaining.value) : null,
            error: capacity.error ?? remaining.error,
          }
        : positiveInput(row.liters, 1_000_000)
    return { liters, capacity, remaining, count: positiveInput(row.count, 1_000, true) }
  })
  const validRows = rows.length > 0 && rows.every((row) => row.liters.value && row.count.value)
  const volume =
    state.mode === 'bulk'
      ? bulk.value
      : validRows
        ? rows.reduce(
            (sum, row) => sum.plus(row.liters.value!.mul(row.count.value!)),
            new Decimal(0),
          )
        : null
  const custom = positiveInput(state.customPrice, 10_000)
  const price =
    state.priceMode === 'custom'
      ? (custom.value?.mul(100) ?? null)
      : regionalPrice == null
        ? null
        : new Decimal(regionalPrice)
  return {
    volume,
    price,
    total: volume && price ? costKopecks(volume, price) : null,
    bulk,
    rows,
    custom,
  }
}

export function budgetChange(
  volume: Decimal | null,
  observations: { date: string; price_kopecks: number }[],
) {
  if (!volume || observations.length < 2) return null
  const first = observations[0],
    last = observations.at(-1)!
  if (first.date === last.date) return null
  const before = costKopecks(volume, first.price_kopecks)
  const after = costKopecks(volume, last.price_kopecks)
  return { from: first.date, to: last.date, before, after, difference: after.minus(before) }
}
