import { describe, expect, it } from 'vitest'
import { monthsBefore, validPeriodLength } from './selection'

describe('Длинные периоды', () => {
  it('сохраняет календарные границы месяца и високосного года', () => {
    expect(monthsBefore('2026-10-19', 12)).toBe('2025-10-19')
    expect(monthsBefore('2024-02-29', 12)).toBe('2023-02-28')
    expect(monthsBefore('2026-08-31', 6)).toBe('2026-02-28')
  })
  it('ограничивает диапазон теми же 366 днями, что API', () => {
    expect(validPeriodLength('2024-01-01', '2025-01-01')).toBe(true)
    expect(validPeriodLength('2024-01-01', '2025-01-02')).toBe(false)
  })
})
