import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Meta, Selection } from '../lib/contracts'
import { formatDate } from '../lib/numbers'
import { monthsBefore, periodStart, validPeriodLength } from '../lib/selection'
import RegionPicker from './RegionPicker'

export default function Filters({
  meta,
  selection,
  onChange,
}: {
  meta: Meta
  selection: Selection
  onChange: (patch: Partial<Selection>) => void
}) {
  const [dates, setDates] = useState({ from: selection.from, to: selection.to })
  useEffect(
    () => setDates({ from: selection.from, to: selection.to }),
    [selection.from, selection.to],
  )
  const first = meta.expected_dates[0],
    last = meta.expected_dates.at(-1)!
  const valid =
    !!dates.from &&
    !!dates.to &&
    dates.from <= dates.to &&
    dates.from >= first &&
    dates.to <= last &&
    validPeriodLength(dates.from, dates.to)
  const edit = (patch: Partial<typeof dates>) => {
    const next = { ...dates, ...patch }
    setDates(next)
    if (
      next.from &&
      next.to &&
      next.from <= next.to &&
      next.from >= first &&
      next.to <= last &&
      validPeriodLength(next.from, next.to)
    )
      onChange(next)
  }
  const longPeriods = (className: string) => (
    <div className={className} role="group" aria-label="Длинный период">
      {[6, 12].map((months) => {
        const from = monthsBefore(last, months)
        const available = from >= first
        const active = selection.from === from && selection.to === last
        return (
          <button
            key={months}
            aria-label={months === 12 ? 'Год' : '6 месяцев'}
            disabled={!available}
            title={!available ? `История доступна с ${formatDate(first, true)}` : undefined}
            aria-pressed={active}
            className={active ? 'active' : ''}
            onClick={(event) => {
              const next = { from, to: last }
              setDates(next)
              onChange(next)
              event.currentTarget.closest('details')?.removeAttribute('open')
            }}
          >
            {months === 12 ? 'Год' : '6 месяцев'}
          </button>
        )
      })}
    </div>
  )
  return (
    <section className="filter-panel" aria-label="Фильтры цен">
      <RegionPicker
        regions={meta.regions}
        value={selection.region}
        onChange={(region) => onChange({ region })}
      />
      <div className="fuel-picker">
        <span className="field-label" id="fuel-label">
          Вид топлива
        </span>
        <div className="segmented" role="group" aria-labelledby="fuel-label">
          {(['diesel', 'ai92', 'ai95'] as const).map((fuel) => (
            <button
              key={fuel}
              aria-pressed={selection.fuel === fuel}
              className={fuel === selection.fuel ? 'active' : ''}
              onClick={() => onChange({ fuel })}
            >
              {fuel === 'diesel' ? 'ДТ' : fuel === 'ai92' ? 'АИ-92' : 'АИ-95'}
            </button>
          ))}
        </div>
      </div>
      <div className="period-picker">
        <span className="field-label">Даты наблюдений</span>
        <details className="period-dates">
          <summary
            aria-label={`Выбрать даты наблюдений: ${formatDate(selection.from, selection.from.slice(0, 4) !== selection.to.slice(0, 4))} — ${formatDate(selection.to, true)}`}
          >
            {formatDate(selection.from, selection.from.slice(0, 4) !== selection.to.slice(0, 4))} —{' '}
            {formatDate(selection.to, true)}
            <ChevronDown size={15} aria-hidden="true" />
          </summary>
          <div className="date-popover">
            {longPeriods('mobile-long-periods segmented')}
            <label>
              Начало периода
              <input
                type="date"
                aria-label="Начало периода"
                min={first}
                max={dates.to || last}
                value={dates.from}
                onChange={(event) => edit({ from: event.target.value })}
              />
            </label>
            <label>
              Конец периода
              <input
                type="date"
                aria-label="Конец периода"
                min={dates.from || first}
                max={last}
                value={dates.to}
                onChange={(event) => edit({ to: event.target.value })}
              />
            </label>
          </div>
        </details>
        {!valid && (
          <span className="field-error">
            Выберите даты от {formatDate(first, true)} до {formatDate(last, true)}; начало не позже
            конца. Длина периода — до 366 дней. Показан предыдущий корректный период.
          </span>
        )}
      </div>
      <div className="quick-periods">
        <span className="field-label" id="period-label">
          <span className="desktop-period-label">Быстрый выбор</span>
          <span className="mobile-period-label">Недели</span>
        </span>
        <div role="group" aria-labelledby="period-label">
          {[4, 8, 12].map((weeks) => (
            <button
              key={weeks}
              aria-label={`${weeks} ${weeks === 4 ? 'недели' : 'недель'}`}
              aria-pressed={
                selection.from === periodStart(last, weeks, first) && selection.to === last
              }
              className={
                selection.from === periodStart(last, weeks, first) && selection.to === last
                  ? 'active'
                  : ''
              }
              onClick={() => {
                const next = { from: periodStart(last, weeks, first), to: last }
                setDates(next)
                onChange(next)
              }}
            >
              {weeks}
              <span className="week-unit"> {weeks === 4 ? 'недели' : 'недель'}</span>
            </button>
          ))}
          {longPeriods('desktop-long-periods')}
        </div>
        {monthsBefore(last, 12) < first && (
          <span className="period-coverage">История с {formatDate(first, true)}</span>
        )}
      </div>
    </section>
  )
}
