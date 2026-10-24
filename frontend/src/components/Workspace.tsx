import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CircleHelp, Info, Link2, RefreshCw, X } from 'lucide-react'
import { ApiError, getComparison, getPrices } from '../lib/api'
import type { Dataset, Meta, Selection } from '../lib/contracts'
import { formatDate, formatPrice, type CalculatorState } from '../lib/numbers'
import { periodStart, readSelection, selectionUrl, type View } from '../lib/selection'
import { fuelNames } from '../lib/presentation'
import PriceChart from './PriceChart'
import Calculator from './Calculator'
import Filters from './Filters'
import Stats from './Stats'
import FuelPrices from './FuelPrices'
import CompareControls from './CompareControls'
import ComparisonPanel from './ComparisonPanel'
import Sources from './Sources'
import AppShell from './AppShell'

export default function Workspace({
  dataset,
  calculator,
  setCalculator,
  onReserve,
  onReconnect,
  newMeta,
  onUpdate,
}: {
  dataset: Dataset
  calculator: CalculatorState
  setCalculator: (value: CalculatorState) => void
  onReserve: () => Promise<void>
  onReconnect: () => void
  newMeta?: Meta
  onUpdate: () => void
}) {
  const { meta } = dataset
  const [initial] = useState(() => readSelection(meta))
  const [selection, setSelection] = useState(initial.selection)
  const [view, setView] = useState<View>(initial.view)
  const [notice, setNotice] = useState(
    initial.corrected ? 'Некорректные параметры ссылки заменены доступными значениями.' : '',
  )
  const content = useRef<HTMLElement>(null)
  const priceQuery = useQuery({
    queryKey: [
      'prices',
      dataset.mode,
      meta.dataset_version,
      selection.region,
      selection.fuel,
      selection.from,
      selection.to,
    ],
    queryFn: ({ signal }) => getPrices(dataset, selection, signal),
  })
  const comparisonQuery = useQuery({
    queryKey: ['comparison', dataset.mode, meta.dataset_version, selection],
    queryFn: ({ signal }) => getComparison(dataset, selection, signal),
    enabled: selection.compare.length > 0,
  })
  const queryError = priceQuery.error ?? (selection.compare.length ? comparisonQuery.error : null)
  useEffect(() => {
    if (queryError instanceof ApiError && queryError.unavailable) void onReserve()
  }, [queryError, onReserve])
  useEffect(() => {
    window.history.replaceState(null, '', selectionUrl(selection, view, meta.dataset_version))
  }, [selection, view, meta.dataset_version])
  useEffect(() => {
    const restore = () => {
      const next = readSelection(meta)
      setSelection(next.selection)
      setView(next.view)
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [meta])
  const changeView = (next: View) => {
    setView(next)
    content.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'start',
    })
  }
  const updateSelection = (patch: Partial<Selection>) =>
    setSelection((previous) => {
      const next = { ...previous, ...patch }
      next.compare = next.compare.filter((region) => region !== next.region)
      return next
    })
  const price = priceQuery.data
  const comparison = selection.compare.length ? comparisonQuery.data : undefined
  const loading =
    priceQuery.isPending || (selection.compare.length > 0 && comparisonQuery.isPending)
  const region = meta.regions.find((region) => region.id === selection.region)!
  const coverage = meta.coverage.find(
    (item) => item.region_id === selection.region && item.fuel_type === selection.fuel,
  )
  const lastDate = meta.expected_dates.at(-1)!
  const dataAge = Math.max(0, Math.floor((Date.now() - Date.parse(lastDate)) / 86_400_000))
  const titles: Record<View, [string, string]> = {
    overview: [
      'Цены на топливо по регионам',
      'Средние розничные цены Росстата для расчёта заправки сельхозтехники.',
    ],
    comparison: [
      'Сравнение цен по регионам',
      'Цены и изменения рассчитаны на общие даты наблюдений.',
    ],
    calculator: [
      'Расчёт заправки техники',
      'Рассчитайте стоимость топлива для одной машины или всего парка.',
    ],
    sources: ['Источники и методика', 'Источники, охват и правила расчётов сервиса.'],
  }
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setNotice('Ссылка с фильтрами и версией данных скопирована.')
    } catch {
      setNotice('Скопируйте ссылку из адресной строки — фильтры и версия уже сохранены.')
    }
  }
  return (
    <AppShell view={view} onNavigate={changeView} meta={meta}>
      <main ref={content} id="main">
        <div className="page-heading">
          <div>
            <h1>{titles[view][0]}</h1>
            <p>{titles[view][1]}</p>
          </div>
          <div className="heading-actions">
            {(view === 'overview' || view === 'comparison') && (
              <button className="primary-button" onClick={() => changeView('calculator')}>
                Рассчитать заправку
              </button>
            )}
            <button className="secondary-button share-button" onClick={() => void share()}>
              <Link2 size={16} aria-hidden="true" />
              Скопировать ссылку
            </button>
          </div>
        </div>
        {notice && (
          <div className="notice" role="status">
            <Info size={17} />
            <span>{notice}</span>
            <button
              className="icon-button"
              aria-label="Закрыть уведомление"
              onClick={() => setNotice('')}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {dataset.mode === 'snapshot' && (
          <div className="notice reserve-banner" role="status">
            <span>
              <strong>Резервные данные на {formatDate(lastDate, true)}</strong>
              <span className="reserve-detail">
                Нет соединения с API. Последнее наблюдение — {dataAge} дн. назад.
              </span>
            </span>
            <button
              className="text-button"
              aria-label="Повторить подключение"
              onClick={onReconnect}
            >
              <RefreshCw size={14} />
              Повторить
            </button>
          </div>
        )}
        {newMeta && (
          <div className="notice">
            <RefreshCw size={17} />
            <span>Доступна новая версия данных. Текущие расчёты сохранены.</span>
            <button className="text-button" onClick={onUpdate}>
              Обновить данные
            </button>
          </div>
        )}
        {view !== 'sources' && (
          <>
            <Filters meta={meta} selection={selection} onChange={updateSelection} />
            {region.price_area && (
              <p className="area-note">
                <Info size={14} />
                Территория наблюдения: {region.price_area}
              </p>
            )}
            {(coverage?.stale || dataAge > 14) && (
              <div className="notice">
                <Info size={17} />
                <span>
                  Последнее наблюдение старше 14 дней. Цена сохранена для справки; уточните текущие
                  условия у поставщика.
                </span>
              </div>
            )}
            {meta.warnings.includes('SOURCE_CHECK_OVERDUE') && (
              <p className="area-note">
                <Info size={14} />
                Проверка новых публикаций задерживается. Ниже — последний опубликованный набор.
              </p>
            )}
            {queryError && !(queryError instanceof ApiError && queryError.unavailable) ? (
              <div className="panel error-panel" role="alert" aria-label="Ошибка загрузки данных">
                <CircleHelp size={28} />
                <h2>Не удалось показать данные</h2>
                <p>{queryError.message}</p>
                <button
                  className="secondary-button"
                  onClick={() => {
                    void priceQuery.refetch()
                    if (selection.compare.length) void comparisonQuery.refetch()
                  }}
                >
                  Повторить запрос
                </button>
              </div>
            ) : loading ? (
              <div className="loading-grid" role="status" aria-label="Загрузка выбранных данных">
                <div className="skeleton skeleton-stat" />
                <div className="skeleton skeleton-stat" />
                <div className="skeleton skeleton-stat" />
                <div className="skeleton skeleton-chart" />
                <span className="sr-only">Загрузка выбранных данных</span>
              </div>
            ) : (
              <>
                {view === 'calculator' ? (
                  <div className="calculator-layout">
                    <section className="panel">
                      <Calculator
                        state={calculator}
                        setState={setCalculator}
                        price={price}
                        meta={meta}
                        comparison={comparison}
                        expanded
                      />
                    </section>
                    <aside className="panel calculator-context">
                      <span className="eyebrow">ПАРАМЕТРЫ РАСЧЁТА</span>
                      <h3>{region.name}</h3>
                      <p>{fuelNames[selection.fuel]}</p>
                      <div className="context-price">
                        {formatPrice(price?.summary.latest_price_kopecks)} <small>₽/л</small>
                      </div>
                      <p className="muted">
                        Средняя цена на {formatDate(price?.observations.at(-1)?.date, true)}
                      </p>
                      {price?.observations.at(-1)?.date !== lastDate && (
                        <button
                          className="text-button"
                          onClick={() =>
                            updateSelection({
                              to: lastDate,
                              from: periodStart(lastDate, 4, meta.expected_dates[0]),
                            })
                          }
                        >
                          Перейти к последним данным
                          <ArrowRight size={15} />
                        </button>
                      )}
                      <div className="soft-divider" />
                      <p className="muted small">
                        Региональная розничная цена — ориентир для бюджета. Она не является
                        предложением поставщика или ценой оптовой закупки.
                      </p>
                      <CompareControls
                        meta={meta}
                        selection={selection}
                        onChange={updateSelection}
                      />
                    </aside>
                  </div>
                ) : (
                  <>
                    {price && <Stats price={price} meta={meta} />}
                    {view === 'overview' && (
                      <FuelPrices dataset={dataset} selection={selection} onReserve={onReserve} />
                    )}
                    <div
                      className={
                        view === 'comparison' ? 'overview-grid comparison-grid' : 'overview-grid'
                      }
                    >
                      <section className="panel chart-panel">
                        <div className="section-heading">
                          <div>
                            <h2>
                              {view === 'comparison' ? 'Динамика по регионам' : 'Как менялась цена'}
                            </h2>
                            <p>
                              {fuelNames[selection.fuel]} · {formatDate(selection.from)} —{' '}
                              {formatDate(selection.to, true)}
                            </p>
                          </div>
                          <button
                            className="text-button subtle"
                            onClick={() => changeView('sources')}
                          >
                            <Info size={14} />О данных
                          </button>
                        </div>
                        <PriceChart
                          meta={meta}
                          series={
                            view === 'comparison' && comparison
                              ? comparison.series
                              : price
                                ? [price]
                                : []
                          }
                          comparison={view === 'comparison'}
                        />
                        {price && price.missing_dates.length > 0 && (
                          <p className="inline-notice">
                            Есть пропуски:{' '}
                            {price.missing_dates.map((date) => formatDate(date)).join(', ')}. Линия
                            на графике прерывается.
                          </p>
                        )}
                        {price?.observations.length === 1 && (
                          <p className="inline-notice">
                            В периоде одна точка: цена доступна, изменение не рассчитывается.
                          </p>
                        )}
                      </section>
                      {view === 'overview' && (
                        <Calculator
                          state={calculator}
                          setState={setCalculator}
                          price={price}
                          meta={meta}
                          comparison={comparison}
                          onExpand={() => changeView('calculator')}
                        />
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
        {(view === 'overview' || view === 'comparison') && (
          <ComparisonPanel
            meta={meta}
            comparison={queryError ? undefined : comparison}
            selection={selection}
            onChange={updateSelection}
            onExpand={() => changeView('comparison')}
            overview={view === 'overview'}
            loading={loading}
          />
        )}
        {view === 'sources' && <Sources meta={meta} mode={dataset.mode} />}
        <footer className="page-footer">
          <span>Источник: Росстат · средние розничные цены</span>
          <button className="text-button subtle" onClick={() => changeView('sources')}>
            О данных
          </button>
        </footer>
      </main>
    </AppShell>
  )
}
