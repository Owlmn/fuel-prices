import type { Comparison, Dataset, Price } from './contracts'
import { budgetChange, calculate, costKopecks, Decimal, type CalculatorState } from './numbers'
import { fuelNames } from './presentation'

type Cell = string | number
const decimal = (value: Decimal) => value.toFixed(2).replace('.', ',')
const rubles = (kopecks: Decimal) => decimal(kopecks.div(100))

export function csvCell(value: Cell): string {
  const raw = String(value)
  const safe =
    /^[\s\uFEFF]*[=+@\-\t\r\n]/.test(raw) && !/^-?\d+(?:,\d+)?$/.test(raw) ? `'${raw}` : raw
  return `"${safe.replaceAll('"', '""')}"`
}

export function calculationCsv(
  state: CalculatorState,
  price: Price,
  dataset: Pick<Dataset, 'meta' | 'mode'>,
  comparison?: Comparison,
  generatedAt = new Date().toISOString(),
) {
  const result = calculate(state, price.summary.latest_price_kopecks)
  if (result.total === null || !result.volume || !result.price) return null
  if (price.dataset_version !== dataset.meta.dataset_version) return null
  const { meta } = dataset
  const regionName = (id: string) => meta.regions.find((item) => item.id === id)?.name ?? id
  const sourceUrl = (id?: string) => meta.sources.find((item) => item.id === id)?.url ?? ''
  const observation = price.observations.at(-1)
  const rows: Cell[][] = [
    ['АгроТопливо — расчёт заправки'],
    ['Сформирован, UTC', generatedAt],
    ['Версия данных', meta.dataset_version],
    ['Режим данных', dataset.mode === 'api' ? 'API' : 'Резервный снимок'],
    ['Регион', regionName(price.region_id)],
    ['Топливо', fuelNames[price.fuel_type]],
    ['Выбранный период', price.requested_period.from, price.requested_period.to],
    ['Способ расчёта', state.mode === 'bulk' ? 'Готовый объём' : 'Заправка техники'],
    ['Объём, л', decimal(result.volume)],
    ['Цена, ₽/л', rubles(result.price)],
    [
      'Основание цены',
      state.priceMode === 'custom' ? 'Введена пользователем' : 'Средняя розничная цена Росстата',
    ],
    [
      'Дата цены',
      state.priceMode === 'custom' ? 'Не задана пользователем' : (observation?.date ?? ''),
    ],
    [
      'Источник цены',
      state.priceMode === 'custom' ? 'Ввод пользователя' : sourceUrl(observation?.source_id),
    ],
    ['Стоимость, ₽', rubles(result.total)],
    ['Ограничения', 'Доставка и условия поставщика не учтены'],
  ]
  if (state.mode === 'machines') {
    rows.push(
      [],
      [
        'Техника',
        'Способ ввода',
        'Бак, л',
        'Остаток в баке, л',
        'Заправка одной машины, л',
        'Машин',
        'Всего, л',
      ],
    )
    state.machines.forEach((machine, index) => {
      const row = result.rows[index]
      const tank = machine.fillMode === 'tank'
      rows.push([
        machine.name,
        tank ? 'До полного бака' : 'Литров на машину',
        tank ? decimal(row.capacity.value!) : '',
        tank ? decimal(row.remaining.value!) : '',
        decimal(row.liters.value!),
        row.count.value!.toNumber(),
        decimal(row.liters.value!.mul(row.count.value!)),
      ])
    })
  }
  const change = budgetChange(result.volume, price.observations)
  if (change) {
    rows.push(
      [],
      ['Изменение бюджета по средним региональным ценам; своя цена не используется'],
      ['Дата начала', change.from],
      ['Дата конца', change.to],
      ['Бюджет в начале, ₽', rubles(change.before)],
      ['Бюджет в конце, ₽', rubles(change.after)],
      ['Изменение, ₽', rubles(change.difference)],
      ['Источник начала', sourceUrl(price.observations[0].source_id)],
      ['Источник конца', sourceUrl(observation?.source_id)],
    )
  }
  if (comparison?.comparable && comparison.dataset_version === meta.dataset_version) {
    const base = comparison.rows.find((row) => row.region_id === comparison.base_region)
    if (base) {
      rows.push(
        [],
        ['Сравнение по средним региональным ценам', comparison.comparison_end ?? ''],
        ['Базовый регион', regionName(base.region_id)],
        ['Регион', 'Цена, ₽/л', 'Бюджет, ₽', 'Разница с базовым, ₽', 'Источник'],
      )
      for (const row of comparison.rows) {
        const cost = costKopecks(result.volume, row.price_kopecks)
        const point = comparison.series
          .find((series) => series.region_id === row.region_id)
          ?.observations.find((point) => point.date === comparison.comparison_end)
        rows.push([
          regionName(row.region_id),
          rubles(new Decimal(row.price_kopecks)),
          rubles(cost),
          rubles(cost.minus(costKopecks(result.volume, base.price_kopecks))),
          sourceUrl(point?.source_id),
        ])
      }
    }
  }
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n') + '\r\n'
}

export function downloadCsv(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
