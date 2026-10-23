import { describe, expect, it } from 'vitest'
import {
  calculate,
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
