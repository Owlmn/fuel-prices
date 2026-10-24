import { Download, Fuel, Plus, Tractor, Trash2 } from 'lucide-react'
import type { Comparison, Dataset, Meta, Price } from '../lib/contracts'
import { calculationCsv, downloadCsv } from '../lib/export'
import {
  calculate,
  budgetChange,
  costKopecks,
  formatDate,
  formatPrice,
  formatSigned,
  formatVolume,
  type CalculatorState,
} from '../lib/numbers'

type Props = {
  state: CalculatorState
  setState: (value: CalculatorState) => void
  price: Price | undefined
  meta: Meta
  comparison: Comparison | undefined
  dataMode: Dataset['mode']
  expanded?: boolean
  onExpand?: () => void
}
export default function Calculator({
  state,
  setState,
  price,
  meta,
  comparison,
  dataMode,
  expanded = false,
  onExpand,
}: Props) {
  const result = calculate(state, price?.summary.latest_price_kopecks ?? null)
  const change = budgetChange(result.volume, price?.observations ?? [])
  const update = (patch: Partial<CalculatorState>) => setState({ ...state, ...patch })
  const observation = price?.observations.at(-1)
  const source = meta.sources.find((source) => source.id === observation?.source_id)
  const historical = !!observation && observation.date < meta.expected_dates.at(-1)!
  const currentRegion = meta.regions.find((region) => region.id === price?.region_id)?.name
  const exportCalculation = () => {
    if (!price) return
    const csv = calculationCsv(state, price, { meta, mode: dataMode }, comparison)
    if (csv)
      downloadCsv(
        csv,
        `agro-fuel-${price.region_id}-${price.fuel_type}-${price.requested_period.to}.csv`,
      )
  }
  return (
    <div className={expanded ? 'calculator-expanded' : 'budget-card'}>
      <div className="section-heading">
        <div>
          <h2>{expanded ? 'Рассчитайте заправку' : 'Бюджет заправки'}</h2>
        </div>
      </div>
      {!expanded && (
        <p className="budget-intro">
          {state.priceMode === 'custom'
            ? 'Стоимость по введённой вами цене.'
            : 'Объём × средняя цена региона.'}
        </p>
      )}
      {expanded && (
        <div className="segmented calc-tabs" aria-label="Способ ввода объёма">
          <button
            aria-pressed={state.mode === 'bulk'}
            className={state.mode === 'bulk' ? 'active' : ''}
            onClick={() => update({ mode: 'bulk' })}
          >
            <Fuel size={16} />
            Готовый объём
          </button>
          <button
            aria-pressed={state.mode === 'machines'}
            className={state.mode === 'machines' ? 'active' : ''}
            onClick={() => update({ mode: 'machines' })}
          >
            <Tractor size={17} />
            Заправка техники
          </button>
        </div>
      )}
      {state.mode === 'bulk' ? (
        <label className="volume-field">
          Объём топлива
          <div className="input-unit">
            <input
              aria-label="Объём топлива, литры"
              inputMode="decimal"
              value={state.volume}
              onChange={(event) => update({ volume: event.target.value })}
              aria-invalid={!!result.bulk.error}
            />
            <span>литров</span>
          </div>
          {result.bulk.error && <span className="field-error">{result.bulk.error}</span>}
        </label>
      ) : !expanded ? (
        <div className="volume-field">
          Объём парка
          <div className="input-unit">
            <strong>{result.volume ? formatVolume(result.volume) : '—'}</strong>
            <span>литров</span>
          </div>
        </div>
      ) : (
        <div className="machine-list">
          {state.machines.map((machine, index) => (
            <div className="machine-entry" key={machine.id}>
              <div
                className="segmented machine-method"
                role="group"
                aria-label={`Способ заправки строки ${index + 1}`}
              >
                {(['liters', 'tank'] as const).map((mode) => (
                  <button
                    key={mode}
                    aria-pressed={(machine.fillMode ?? 'liters') === mode}
                    className={(machine.fillMode ?? 'liters') === mode ? 'active' : ''}
                    onClick={() =>
                      update({
                        machines: state.machines.map((row) =>
                          row.id === machine.id ? { ...row, fillMode: mode } : row,
                        ),
                      })
                    }
                  >
                    {mode === 'liters' ? 'Задать литры' : 'До полного бака'}
                  </button>
                ))}
              </div>
              <div className="machine-row">
                <label>
                  Название
                  <input
                    value={machine.name}
                    placeholder="Например, трактор"
                    maxLength={80}
                    onChange={(event) =>
                      update({
                        machines: state.machines.map((row) =>
                          row.id === machine.id ? { ...row, name: event.target.value } : row,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  {machine.fillMode === 'tank' ? 'Объём бака, л' : 'Литров на машину'}
                  <input
                    inputMode="decimal"
                    aria-label={machine.fillMode === 'tank' ? 'Объём бака, л' : 'Литров на машину'}
                    value={machine.fillMode === 'tank' ? (machine.capacity ?? '') : machine.liters}
                    aria-invalid={
                      !!(machine.fillMode === 'tank'
                        ? result.rows[index].capacity.error
                        : result.rows[index].liters.error)
                    }
                    onChange={(event) =>
                      update({
                        machines: state.machines.map((row) =>
                          row.id === machine.id
                            ? {
                                ...row,
                                [machine.fillMode === 'tank' ? 'capacity' : 'liters']:
                                  event.target.value,
                              }
                            : row,
                        ),
                      })
                    }
                  />
                  {(machine.fillMode === 'tank'
                    ? result.rows[index].capacity.error
                    : result.rows[index].liters.error) && (
                    <span className="field-error">
                      {machine.fillMode === 'tank'
                        ? result.rows[index].capacity.error
                        : result.rows[index].liters.error}
                    </span>
                  )}
                </label>
                <label>
                  Машин
                  <input
                    inputMode="numeric"
                    value={machine.count}
                    aria-invalid={!!result.rows[index].count.error}
                    onChange={(event) =>
                      update({
                        machines: state.machines.map((row) =>
                          row.id === machine.id ? { ...row, count: event.target.value } : row,
                        ),
                      })
                    }
                  />
                  {result.rows[index].count.error && (
                    <span className="field-error">{result.rows[index].count.error}</span>
                  )}
                </label>
                <button
                  className="icon-button delete-machine"
                  aria-label={`Удалить строку ${index + 1}`}
                  disabled={state.machines.length === 1}
                  onClick={() =>
                    update({ machines: state.machines.filter((row) => row.id !== machine.id) })
                  }
                >
                  <Trash2 size={17} />
                </button>
              </div>
              {machine.fillMode === 'tank' && (
                <div className="tank-details">
                  <label>
                    Остаток в каждом баке, л
                    <input
                      inputMode="decimal"
                      aria-label="Остаток в каждом баке, л"
                      value={machine.remaining ?? ''}
                      aria-invalid={!!result.rows[index].remaining.error}
                      onChange={(event) =>
                        update({
                          machines: state.machines.map((row) =>
                            row.id === machine.id ? { ...row, remaining: event.target.value } : row,
                          ),
                        })
                      }
                    />
                    {result.rows[index].remaining.error && (
                      <span className="field-error">{result.rows[index].remaining.error}</span>
                    )}
                  </label>
                  <p className="muted small">
                    На одну машину:{' '}
                    {result.rows[index].liters.value !== null
                      ? `${formatVolume(result.rows[index].liters.value!)} л`
                      : '—'}
                    . Для машин с разными баками или остатками добавьте отдельные строки.
                  </p>
                </div>
              )}
            </div>
          ))}
          <button
            className="text-button add-machine"
            disabled={state.machines.length >= 20}
            onClick={() =>
              update({
                machines: [
                  ...state.machines,
                  { id: crypto.randomUUID(), name: '', liters: '', count: '1' },
                ],
              })
            }
          >
            <Plus size={16} />
            Добавить технику <span className="muted">{state.machines.length}/20</span>
          </button>
        </div>
      )}
      {expanded && (
        <div className="price-settings">
          <span className="field-label">Цена для расчёта</span>
          <div className="segmented">
            <button
              className={state.priceMode === 'regional' ? 'active' : ''}
              aria-pressed={state.priceMode === 'regional'}
              onClick={() => update({ priceMode: 'regional' })}
            >
              Средняя по региону
            </button>
            <button
              className={state.priceMode === 'custom' ? 'active' : ''}
              aria-pressed={state.priceMode === 'custom'}
              onClick={() => update({ priceMode: 'custom' })}
            >
              Моя цена
            </button>
          </div>
          {state.priceMode === 'custom' && (
            <label className="custom-price">
              Ваша цена, ₽/л
              <input
                aria-label="Ваша цена, ₽/л"
                inputMode="decimal"
                value={state.customPrice}
                onChange={(event) => update({ customPrice: event.target.value })}
                aria-invalid={!!result.custom.error}
              />
              {result.custom.error && <span className="field-error">{result.custom.error}</span>}
              <span className="muted">
                Введена вами. Сохраняется при изменении региона, топлива и периода; статистика не
                меняется.
              </span>
            </label>
          )}
        </div>
      )}
      <div className="calculation-lines">
        <div>
          <span>{state.priceMode === 'custom' ? 'Ваша цена' : 'Средняя цена'}</span>
          <strong>
            {result.price ? formatPrice(result.price.toNumber()) : '—'} <small>₽/л</small>
          </strong>
        </div>
        {expanded && (
          <div>
            <span>Общий объём</span>
            <strong>
              {result.volume ? formatVolume(result.volume) : '—'} <small>л</small>
            </strong>
          </div>
        )}
      </div>
      <div className="budget-total">
        <span>Ориентировочная стоимость</span>
        <strong data-testid="budget-total">
          {formatPrice(result.total)} <small>₽</small>
        </strong>
      </div>
      <p className="calculation-source">
        {state.priceMode === 'custom' ? (
          'Расчёт по вашей цене'
        ) : observation ? (
          <>
            {historical ? 'Историческая цена' : 'Цена'} на {formatDate(observation.date, true)}
            {expanded && <> · {currentRegion}</>}
            {source && (
              <>
                {' '}
                ·{' '}
                <a href={source.url} target="_blank" rel="noreferrer">
                  Росстат ↗
                </a>
              </>
            )}
          </>
        ) : (
          'Нет цены для выбранного периода'
        )}
      </p>
      {!expanded && (
        <button className="budget-button" onClick={onExpand}>
          Открыть калькулятор
        </button>
      )}
      <p className="budget-note">Доставка и условия поставщика не учтены</p>
      {expanded && (
        <section className="budget-change" aria-label="Влияние цены на бюджет">
          <h3>Как цена повлияла на бюджет</h3>
          {change ? (
            <>
              <p>
                Для {formatVolume(result.volume!)} л:{' '}
                <strong data-testid="budget-change">{formatSigned(change.difference)} ₽</strong>
              </p>
              <p className="muted small">
                {formatDate(change.from, true)} — {formatDate(change.to, true)} ·{' '}
                {formatPrice(change.before)} → {formatPrice(change.after)} ₽
              </p>
              <p className="muted small">
                По средним региональным ценам на эти даты.{' '}
                {state.priceMode === 'custom' ? 'Ваша цена здесь не используется. ' : ''}Это
                изменение расчётной стоимости, не прогноз.
              </p>
            </>
          ) : (
            <p className="muted small">
              {!result.volume
                ? 'Введите корректный объём.'
                : 'Для оценки изменения нужны цены минимум на две даты выбранного периода.'}
            </p>
          )}
        </section>
      )}
      {expanded && (
        <button
          className="secondary-button export-calculation"
          onClick={exportCalculation}
          disabled={result.total === null || !price}
        >
          <Download size={16} aria-hidden="true" /> Скачать расчёт CSV
        </button>
      )}
      {expanded && (
        <>
          <div className="soft-divider" />
          <h3>Тот же объём в других регионах</h3>
          <p className="muted small">
            По средним ценам на общую дату {formatDate(comparison?.comparison_end, true)}. Ваша цена
            здесь не используется.
          </p>
          {comparison?.comparable && result.volume ? (
            <div
              className="table-scroll"
              role="region"
              aria-label="Бюджет по регионам"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Регион</th>
                    <th>Цена, ₽/л</th>
                    <th>Бюджет, ₽</th>
                    <th>Разница, ₽</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.rows.map((row) => {
                    const cost = costKopecks(result.volume!, row.price_kopecks)
                    const base = comparison.rows.find(
                      (item) => item.region_id === comparison.base_region,
                    )!
                    return (
                      <tr key={row.region_id}>
                        <td>{meta.regions.find((region) => region.id === row.region_id)?.name}</td>
                        <td>{formatPrice(row.price_kopecks)}</td>
                        <td>{formatPrice(cost)}</td>
                        <td>
                          {row.region_id === comparison.base_region
                            ? 'Базовый'
                            : formatSigned(
                                cost.minus(costKopecks(result.volume!, base.price_kopecks)),
                              )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="inline-notice">
              {!result.volume
                ? 'Введите корректный объём для сравнения бюджета.'
                : 'Добавьте регион для сравнения. Расчёт доступен при наличии общей даты наблюдений.'}
            </p>
          )}
        </>
      )}
    </div>
  )
}
