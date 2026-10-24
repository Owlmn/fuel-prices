import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Snapshot } from './contracts'
import { calculationCsv, csvCell } from './export'
import type { CalculatorState } from './numbers'
import { snapshotComparison, snapshotPrice } from './snapshot'

const snapshot = JSON.parse(readFileSync('public/snapshot.json', 'utf8')) as Snapshot
const selection = {
  region: 'primorsky_krai',
  fuel: 'diesel' as const,
  from: '2026-10-05',
  to: '2026-10-19',
  compare: ['amur_oblast'],
}
const price = snapshotPrice(
  snapshot,
  selection.region,
  selection.fuel,
  selection.from,
  selection.to,
)
const state: CalculatorState = {
  mode: 'machines',
  volume: '1000',
  machines: [
    {
      id: '1',
      name: '=1+1',
      liters: '',
      fillMode: 'tank',
      capacity: '200',
      remaining: '40',
      count: '3',
    },
  ],
  priceMode: 'regional',
  customPrice: '80,55',
}
const dataset = { mode: 'snapshot' as const, meta: snapshot.meta }
describe('CSV расчёта', () => {
  it('сохраняет объём, бюджет, даты, источник и базовый регион', () => {
    const csv = calculationCsv(
      state,
      price,
      dataset,
      snapshotComparison(snapshot, selection),
      '2026-10-24T00:00:00Z',
    )!
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"Объём, л";"480,00"')
    expect(csv).toContain('"Стоимость, ₽";"44817,60"')
    expect(csv).toContain('"Резервный снимок"')
    expect(csv).toContain('"Базовый регион";"Приморский край"')
    expect(csv).toContain('2026-10-19')
    expect(csv).toContain('https://rosstat.gov.ru/')
    expect(csv).toContain('"\'=1+1"')
    expect(csv).toContain('"До полного бака";"200,00";"40,00";"160,00";"3";"480,00"')
  })
  it('свою цену не приписывает Росстату и не выгружает невалидный результат', () => {
    const csv = calculationCsv({ ...state, priceMode: 'custom' }, price, dataset)!
    expect(csv).toContain('"Стоимость, ₽";"38664,00"')
    expect(csv).toContain('"Дата цены";"Не задана пользователем"')
    expect(csv).toContain('"Источник цены";"Ввод пользователя"')
    expect(calculationCsv({ ...state, mode: 'bulk', volume: '' }, price, dataset)).toBeNull()
    expect(calculationCsv(state, { ...price, dataset_version: 'other' }, dataset)).toBeNull()
  })
  it('экранирует кавычки, переносы и формулы; сохраняет отрицательное число', () => {
    expect(csvCell('a;"b"\nc')).toBe('"a;""b""\nc"')
    expect(csvCell('  =HYPERLINK("x")')).toBe('"\'  =HYPERLINK(""x"")"')
    expect(csvCell('-123,45')).toBe('"-123,45"')
  })
})
