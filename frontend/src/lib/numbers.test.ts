import { describe, expect, it } from 'vitest'
import {
  calculate,
  budgetChange,
  costKopecks,
  Decimal,
  formatPrice,
  percent,
  positiveInput,
  type CalculatorState,
} from './numbers'

const state: CalculatorState = {
  mode: 'machines',
  volume: '999',
  machines: [{ id: 'a', name: 'Трактор', liters: '200', count: '3' }],
  priceMode: 'regional',
  customPrice: '82',
}
describe('Расчёт бюджета', () => {
  it('считает долив до полного бака, включая нулевой остаток и полный бак', () => {
    const machine = {
      ...state.machines[0],
      fillMode: 'tank' as const,
      capacity: '200',
      remaining: '40',
    }
    expect(calculate({ ...state, machines: [machine] }, 8000).volume?.toString()).toBe('480')
    expect(
      calculate({ ...state, machines: [{ ...machine, remaining: '0' }] }, 8000).volume?.toString(),
    ).toBe('600')
    expect(
      calculate({ ...state, machines: [{ ...machine, remaining: '200' }] }, 8000).total?.toString(),
    ).toBe('0')
    expect(
      calculate({ ...state, machines: [{ ...machine, remaining: '201' }] }, 8000).total,
    ).toBeNull()
    expect(
      calculate({ ...state, machines: [{ ...machine, remaining: '' }] }, 8000).total,
    ).toBeNull()
    expect(
      calculate(
        { ...state, machines: [{ ...machine, fillMode: 'liters' }] },
        8000,
      ).volume?.toString(),
    ).toBe('600')
  })
  it('считает изменение суммы на фактические даты и не выдумывает динамику одной точки', () => {
    const points = [
      { date: '2026-10-05', price_kopecks: 8000 },
      { date: '2026-10-19', price_kopecks: 8200 },
    ]
    expect(budgetChange(new Decimal(1200), points)?.difference.toString()).toBe('240000')
    expect(budgetChange(new Decimal(1200), points.slice(0, 1))).toBeNull()
    expect(budgetChange(null, points)).toBeNull()
    const fractional = budgetChange(new Decimal('0.01'), [
      { ...points[0], price_kopecks: 8050 },
      { ...points[1], price_kopecks: 8049 },
    ])!
    expect(fractional.before.toString()).toBe('81')
    expect(fractional.after.toString()).toBe('80')
    expect(fractional.difference.toString()).toBe('-1')
  })
  it('считает парк и разницу бюджета из ТЗ', () => {
    const result = calculate(state, 8000)
    expect(result.volume?.toString()).toBe('600')
    expect(result.total?.toString()).toBe('4800000')
    expect(costKopecks('600', 8200).minus(result.total!).toString()).toBe('120000')
    expect(percent(8200, 8000)).toBe('2.50')
  })
  it('не суммирует скрытые режимы объёма', () => {
    expect(calculate({ ...state, mode: 'bulk', volume: '100' }, 8000).volume?.toString()).toBe(
      '100',
    )
  })
  it('округляет HALF_UP до копейки после умножения', () => {
    expect(costKopecks('0.01', 8050).toString()).toBe('81')
    expect(costKopecks('0.01', 8049).toString()).toBe('80')
  })
  it('сохраняет точность при максимальном парке и цене', () => {
    const large = calculate(
      {
        ...state,
        machines: Array.from({ length: 20 }, (_, index) => ({
          id: String(index),
          name: '',
          liters: '1000000',
          count: '1000',
        })),
        priceMode: 'custom',
        customPrice: '10000',
      },
      8000,
    )
    expect(large.total?.toString()).toBe('20000000000000000')
    expect(formatPrice(large.total)).toBe('200\u00a0000\u00a0000\u00a0000\u00a0000,00')
  })
  it('не округляет произведения отдельных машин', () => {
    const result = calculate(
      {
        ...state,
        machines: [
          { id: 'a', name: '', liters: '0.01', count: '1' },
          { id: 'b', name: '', liters: '0.01', count: '1' },
        ],
      },
      8050,
    )
    expect(result.total?.toString()).toBe('161')
  })
  it('принимает запятую и собственную цену', () => {
    const result = calculate(
      { ...state, mode: 'bulk', volume: '12,25', priceMode: 'custom', customPrice: '80,55' },
      null,
    )
    expect(result.total?.eq(new Decimal('12.25').mul(8055).toDecimalPlaces(0))).toBe(true)
  })
  it('не считает при невалидной строке или отсутствующей цене', () => {
    expect(
      calculate({ ...state, machines: [{ id: 'a', name: '', liters: '', count: '1' }] }, 8000)
        .total,
    ).toBeNull()
    expect(calculate(state, null).total).toBeNull()
  })
  it.each(['', '0', '-1', 'NaN', 'Infinity', '1e3', '1.001', '1,2,3', '1000000.01'])(
    'отклоняет неверный объём %s',
    (value) => {
      expect(positiveInput(value, 1_000_000).error).toBeTruthy()
    },
  )
  it.each(['0', '1.5', '1001'])('отклоняет неверное количество машин %s', (value) => {
    expect(positiveInput(value, 1000, true).error).toBeTruthy()
  })
})
