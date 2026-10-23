'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Calculator as CalculatorIcon,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Database,
  Droplets,
  ExternalLink,
  GitCompareArrows,
  Info,
  Leaf,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  X,
} from 'lucide-react'
import { ApiError, getComparison, getMeta, getPrices, getSnapshot } from './lib/api'
import type { Comparison, Dataset, Meta, Price, Selection, Snapshot } from './lib/contracts'
import {
  formatDate,
  formatPercent,
  formatPrice,
  formatSigned,
  type CalculatorState,
} from './lib/numbers'
import { periodStart, readSelection, selectionUrl, type View } from './lib/selection'
import RegionPicker from './components/RegionPicker'
import PriceChart, { lineColors } from './components/PriceChart'
import Calculator from './components/Calculator'

const fuelNames = { diesel: 'Дизельное топливо', ai92: 'Бензин АИ-92', ai95: 'Бензин АИ-95' }
const menu = [
  { id: 'overview', label: 'Обзор цен', icon: BarChart3 },
  { id: 'comparison', label: 'Сравнение регионов', icon: GitCompareArrows },
  { id: 'calculator', label: 'Калькулятор', icon: CalculatorIcon },
  { id: 'sources', label: 'О данных', icon: Database },
] as const

export default function App() {
  const [dataset, setDataset] = useState<Dataset>()
  const [error, setError] = useState<string>()
  const [pendingSnapshot, setPendingSnapshot] = useState<Snapshot>()
  const [newMeta, setNewMeta] = useState<Meta>()
  const [connecting, setConnecting] = useState(true)
  const [calculator, setCalculator] = useState<CalculatorState>({
    mode: 'bulk',
    volume: '1000',
    machines: [{ id: 'first', name: 'Трактор', liters: '200', count: '3' }],
    priceMode: 'regional',
    customPrice: '',
  })
  const controller = useRef<AbortController | undefined>(undefined)
  const switching = useRef(false)
  const client = useQueryClient()
  const activate = useCallback(
    (next: Dataset) => {
      client.cancelQueries()
      client.clear()
      setPendingSnapshot(undefined)
      setNewMeta(undefined)
      setError(undefined)
      setDataset(next)
      setConnecting(false)
    },
    [client],
  )
  const useReserve = useCallback(async () => {
    if (switching.current) return
    switching.current = true
    setDataset(undefined)
    setConnecting(true)
    try {
      const snapshot = await getSnapshot()
      const pinned = new URLSearchParams(window.location.search).get('dataset_version')
      if (pinned && pinned !== snapshot.meta.dataset_version) {
        setPendingSnapshot(snapshot)
        setError(
          'Сервис недоступен. В резерве другая версия данных: переключение изменит цифры и версию в ссылке.',
        )
        setConnecting(false)
      } else activate({ mode: 'snapshot', meta: snapshot.meta, snapshot })
    } catch {
      setError('Сервис и резервный снимок недоступны. Проверьте подключение и повторите попытку.')
      setConnecting(false)
    } finally {
      switching.current = false
    }
  }, [activate])
  const connect = useCallback(
    async (latest = false) => {
      controller.current?.abort()
      const current = new AbortController()
      controller.current = current
      setConnecting(true)
      setDataset(undefined)
      setPendingSnapshot(undefined)
      setError(undefined)
      try {
        const pinned = latest
          ? undefined
          : (new URLSearchParams(window.location.search).get('dataset_version') ?? undefined)
        const meta = await getMeta(current.signal, pinned)
        if (!current.signal.aborted) activate({ mode: 'api', meta })
      } catch (cause) {
        if (current.signal.aborted) return
        if (cause instanceof ApiError && cause.unavailable) await useReserve()
        else {
          setError(cause instanceof Error ? cause.message : 'Не удалось загрузить данные')
          setConnecting(false)
        }
      }
    },
    [activate, useReserve],
  )
  useEffect(() => {
    void connect()
    return () => controller.current?.abort()
  }, [connect])
  useEffect(() => {
    if (!dataset || dataset.mode !== 'api') return
    let lastCheck = Date.now()
    const current = new AbortController()
    const check = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 300_000) return
      lastCheck = Date.now()
      getMeta(current.signal)
        .then((meta) => {
          if (meta.active_version !== dataset.meta.dataset_version) setNewMeta(meta)
        })
        .catch(() => {})
    }
    document.addEventListener('visibilitychange', check)
    return () => {
      current.abort()
      document.removeEventListener('visibilitychange', check)
    }
  }, [dataset])
  if (!dataset)
    return (
      <div className="startup">
        <div className="brand-mark">
          <Droplets size={30} />
        </div>
        <h1>АгроТопливо</h1>
        {connecting ? (
          <>
            <LoaderCircle size={25} className="spin" />
            <p>Загружаем данные о ценах…</p>
          </>
        ) : (
          <>
            <p role="alert" aria-label="Ошибка загрузки данных">
              {error}
            </p>
            <div className="startup-actions">
              <button className="primary-button" onClick={() => void connect()}>
                <RefreshCw size={16} />
                Повторить подключение
              </button>
              {pendingSnapshot ? (
                <button
                  className="secondary-button"
                  onClick={() => {
                    const params = new URLSearchParams(window.location.search)
                    params.set('dataset_version', pendingSnapshot.meta.dataset_version)
                    window.history.replaceState(null, '', `?${params}`)
                    activate({
                      mode: 'snapshot',
                      meta: pendingSnapshot.meta,
                      snapshot: pendingSnapshot,
                    })
                  }}
                >
                  Открыть резерв на {formatDate(pendingSnapshot.meta.expected_dates.at(-1), true)}
                </button>
              ) : (
                <button className="text-button" onClick={() => void connect(true)}>
                  Открыть последнюю версию
                </button>
              )}
            </div>
          </>
        )}
      </div>
    )
  return (
    <Workspace
      key={`${dataset.mode}-${dataset.meta.dataset_version}`}
      dataset={dataset}
      calculator={calculator}
      setCalculator={setCalculator}
      onReserve={useReserve}
      onReconnect={() => void connect()}
      newMeta={newMeta}
      onUpdate={() => {
        if (newMeta) activate({ mode: 'api', meta: newMeta })
      }}
    />
  )
}

function Workspace({
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
    content.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
    overview: ['Топливо под контролем', 'Следите за ценами. Планируйте закупки. Работайте в поле.'],
    comparison: ['Найдите разницу в ценах', 'Сравните регионы на общие даты наблюдений.'],
    calculator: [
      'Планируйте бюджет заправки',
      'Рассчитайте стоимость топлива для одной машины или всего парка.',
    ],
    sources: [
      'Данным можно доверять, когда они проверяемы',
      'Источники, охват и правила расчётов сервиса.',
    ],
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
    <div className="app-shell">
      <a className="skip-link" href="#main">
        К содержимому
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault()
            changeView('overview')
          }}
        >
          <span className="brand-mark">
            <Droplets size={23} />
          </span>
          <span>
            АгроТопливо<small>ТОЧКА ОПОРЫ ДЛЯ АГРО</small>
          </span>
        </a>
        <span className="sidebar-label">РАБОЧЕЕ ПРОСТРАНСТВО</span>
        <nav aria-label="Основная навигация">
          {menu.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? 'nav-item active' : 'nav-item'}
              aria-current={view === item.id ? 'page' : undefined}
              aria-label={item.label}
              onClick={() => changeView(item.id)}
            >
              <item.icon size={19} />
              <span className="desktop-nav-label">{item.label}</span>
              <span className="mobile-nav-label">
                {item.id === 'comparison' ? 'Сравнение' : item.label}
              </span>
              {view === item.id && <ChevronRight size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-tip">
          <span className="tip-icon">
            <Leaf size={21} />
          </span>
          <h3>
            Больше ясности.
            <br />
            Меньше лишних затрат.
          </h3>
          <p>Планируйте бюджет по данным, а не по ощущениям.</p>
          <button onClick={() => changeView('calculator')}>
            Рассчитать бюджет
            <ArrowUpRight size={16} />
          </button>
          <div className="field-art" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="sidebar-bottom">
          <span className="status-dot" />
          Открытые данные Росстата<small>Независимый учебный проект</small>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Мониторинг топлива
            <ChevronRight size={13} />
            <span>{menu.find((item) => item.id === view)?.label}</span>
          </div>
          <div className="topbar-right">
            <span className="public-badge">
              <ShieldCheck size={14} />
              Без регистрации
            </span>
            <span className="project-badge">КОНКУРСНЫЙ ПРОЕКТ</span>
          </div>
        </header>
        <main ref={content} id="main">
          <div className="page-heading">
            <div>
              <div className="page-eyebrow">
                <span />
                ЦЕНЫ НА ТОПЛИВО ДЛЯ АГРОБИЗНЕСА
              </div>
              <h1>{titles[view][0]}</h1>
              <p>{titles[view][1]}</p>
            </div>
            <button className="secondary-button share-button" onClick={() => void share()}>
              <Link2 size={16} />
              Поделиться
            </button>
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
              <Database size={18} />
              <span>
                <strong>Резервные данные на {formatDate(lastDate, true)}</strong> · возраст{' '}
                {dataAge} дн. · версия {meta.dataset_version.slice(0, 8)}. Сервис данных временно
                недоступен.
              </span>
              <button className="text-button" onClick={onReconnect}>
                <RefreshCw size={14} />
                Повторить подключение
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
                    Последнее наблюдение старше 14 дней. Цена сохранена для справки; уточните
                    текущие условия у поставщика.
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
                      <div
                        className={
                          view === 'comparison' ? 'overview-grid comparison-grid' : 'overview-grid'
                        }
                      >
                        <section className="panel chart-panel">
                          <div className="section-heading">
                            <div>
                              <h2>
                                {view === 'comparison'
                                  ? 'Динамика по регионам'
                                  : 'Как менялась цена'}
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
                          {view === 'comparison' && (
                            <CompareControls
                              meta={meta}
                              selection={selection}
                              onChange={updateSelection}
                            />
                          )}
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
                              {price.missing_dates.map((date) => formatDate(date)).join(', ')}.
                              Линия на графике прерывается.
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
                      <ComparisonPanel
                        meta={meta}
                        comparison={comparison}
                        selection={selection}
                        onChange={updateSelection}
                        onExpand={() => changeView('comparison')}
                        overview={view === 'overview'}
                      />
                    </>
                  )}
                </>
              )}
            </>
          )}
          {view === 'sources' && <Sources meta={meta} mode={dataset.mode} />}
          <footer className="page-footer">
            <span>
              <ShieldCheck size={14} />
              Источник: Росстат · средние розничные цены
            </span>
            <button className="text-button subtle" onClick={() => changeView('sources')}>
              Охват и методика
              <ArrowUpRight size={14} />
            </button>
          </footer>
        </main>
      </div>
    </div>
  )
}

function Filters({
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
    !!dates.from && !!dates.to && dates.from <= dates.to && dates.from >= first && dates.to <= last
  const edit = (patch: Partial<typeof dates>) => {
    const next = { ...dates, ...patch }
    setDates(next)
    if (next.from && next.to && next.from <= next.to && next.from >= first && next.to <= last)
      onChange(next)
  }
  return (
    <section className="filter-panel" aria-label="Фильтры цен">
      <RegionPicker
        regions={meta.regions}
        value={selection.region}
        onChange={(region) => onChange({ region })}
      />
      <div className="fuel-picker">
        <span className="field-label">Вид топлива</span>
        <div className="segmented">
          {(['diesel', 'ai92', 'ai95'] as const).map((fuel) => (
            <button
              key={fuel}
              aria-pressed={selection.fuel === fuel}
              className={fuel === selection.fuel ? 'active' : ''}
              onClick={() => onChange({ fuel })}
            >
              {fuel === 'diesel' && <Droplets size={14} />}
              {fuel === 'diesel' ? 'ДТ' : fuel === 'ai92' ? 'АИ-92' : 'АИ-95'}
            </button>
          ))}
        </div>
      </div>
      <div className="period-picker">
        <span className="field-label">Период наблюдений</span>
        <div className="date-range">
          <CalendarDays size={16} />
          <input
            type="date"
            aria-label="Начало периода"
            min={first}
            max={dates.to || last}
            value={dates.from}
            onChange={(event) => edit({ from: event.target.value })}
          />
          <span>—</span>
          <input
            type="date"
            aria-label="Конец периода"
            min={dates.from || first}
            max={last}
            value={dates.to}
            onChange={(event) => edit({ to: event.target.value })}
          />
        </div>
        {!valid && (
          <span className="field-error">
            Выберите даты от {formatDate(first)} до {formatDate(last)}; начало не позже конца.
            Показан предыдущий корректный период.
          </span>
        )}
      </div>
      <div className="quick-periods">
        <span className="field-label">Последние недели</span>
        <div>
          {[4, 8, 12].map((weeks) => (
            <button
              key={weeks}
              className={
                selection.from === periodStart(last, weeks, first) && selection.to === last
                  ? 'active'
                  : ''
              }
              onClick={() => onChange({ from: periodStart(last, weeks, first), to: last })}
            >
              {weeks}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

function Stats({ price, meta }: { price: Price; meta: Meta }) {
  const summary = price.summary
  const latest = price.observations.at(-1)
  const source = meta.sources.find((source) => source.id === latest?.source_id)
  const rising = (summary.change_kopecks ?? 0) > 0
  return (
    <div className="stats-grid">
      <section className="stat-card">
        <div className="stat-label">
          Цена на {formatDate(latest?.date)}
          <span className="stat-icon">
            <Droplets size={17} />
          </span>
        </div>
        <div className="stat-value">
          {source ? (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              title="Открыть публикацию Росстата"
            >
              {formatPrice(summary.latest_price_kopecks)}
            </a>
          ) : (
            formatPrice(summary.latest_price_kopecks)
          )}
          <span>₽/л</span>
        </div>
        <p>Средняя розничная по региону</p>
      </section>
      <section className="stat-card">
        <div className="stat-label">
          Изменение за период
          <span className="stat-icon">
            <TrendingUp size={17} />
          </span>
        </div>
        <div className="stat-value change-value">
          {formatSigned(summary.change_kopecks)}
          <span>₽/л</span>
          {summary.change_percent !== null && (
            <span className={rising ? 'change-badge up' : 'change-badge down'}>
              {rising ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}
              {formatPercent(summary.change_percent)}
            </span>
          )}
        </div>
        <p>
          {price.observations.length > 1
            ? `${formatDate(price.actual_period?.from)} — ${formatDate(price.actual_period?.to, true)}`
            : 'Нужно минимум два наблюдения'}
        </p>
      </section>
      <section className="stat-card range-card">
        <div className="stat-label">
          Диапазон цен
          <span className="stat-icon">
            <BarChart3 size={17} />
          </span>
        </div>
        <div className="range-values">
          <div>
            <strong>{formatPrice(summary.min_price_kopecks)}</strong>
            <span>Минимум, ₽/л</span>
          </div>
          <div className="range-track">
            <span />
            <span />
          </div>
          <div>
            <strong>{formatPrice(summary.max_price_kopecks)}</strong>
            <span>Максимум, ₽/л</span>
          </div>
        </div>
        <p>По наблюдениям выбранного периода</p>
      </section>
    </div>
  )
}

function CompareControls({
  meta,
  selection,
  onChange,
}: {
  meta: Meta
  selection: Selection
  onChange: (patch: Partial<Selection>) => void
}) {
  return (
    <div className="comparison-controls" aria-label="Регионы для сравнения">
      <div className="region-chips">
        {[selection.region, ...selection.compare].map((id, index) => (
          <span key={id} className="region-chip">
            <i style={{ background: lineColors[index] }} />
            {meta.regions.find((region) => region.id === id)?.name}
            {index === 0 ? (
              <small>база</small>
            ) : (
              <button
                aria-label={`Убрать ${meta.regions.find((region) => region.id === id)?.name}`}
                onClick={() =>
                  onChange({ compare: selection.compare.filter((region) => region !== id) })
                }
              >
                <X size={13} />
              </button>
            )}
          </span>
        ))}
      </div>
      {selection.compare.length < 2 && (
        <RegionPicker
          label="Добавить регион"
          value=""
          regions={meta.regions}
          exclude={[selection.region, ...selection.compare]}
          onChange={(region) => onChange({ compare: [...selection.compare, region] })}
        />
      )}
    </div>
  )
}

function ComparisonPanel({
  meta,
  comparison,
  selection,
  onChange,
  onExpand,
  overview,
}: {
  meta: Meta
  comparison?: Comparison
  selection: Selection
  onChange: (patch: Partial<Selection>) => void
  onExpand: () => void
  overview: boolean
}) {
  return (
    <section className="panel comparison-panel">
      <div className="section-heading">
        <div>
          <h2>Цены в других регионах</h2>
          <p>
            {comparison?.comparable
              ? `Сравнение на общую дату ${formatDate(comparison.comparison_end, true)}`
              : 'Выберите до двух регионов к базовому'}
          </p>
        </div>
        {overview && (
          <button className="text-button" onClick={onExpand}>
            Сравнить динамику
            <ArrowUpRight size={16} />
          </button>
        )}
      </div>
      {overview && <CompareControls meta={meta} selection={selection} onChange={onChange} />}
      {comparison?.comparable ? (
        <div className="table-scroll">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Регион</th>
                <th>Цена, ₽/л</th>
                <th>Разница с базовым</th>
                <th>Изменение за период</th>
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row, index) => (
                <tr key={row.region_id}>
                  <td>
                    <span className="table-region-dot" style={{ background: lineColors[index] }} />
                    {meta.regions.find((region) => region.id === row.region_id)?.name}
                    {row.region_id === selection.region && (
                      <span className="base-tag">Базовый</span>
                    )}
                  </td>
                  <td className="table-price">{formatPrice(row.price_kopecks)}</td>
                  <td>
                    {row.region_id === selection.region ? (
                      <span className="muted">—</span>
                    ) : (
                      <span className={row.difference_kopecks > 0 ? 'text-warm' : 'text-green'}>
                        {formatSigned(row.difference_kopecks)} ₽/л{' '}
                        <small>({formatPercent(row.difference_percent)})</small>
                      </span>
                    )}
                  </td>
                  <td>
                    {formatSigned(row.change_kopecks)}
                    {row.change_kopecks !== null && (
                      <>
                        {' '}
                        ₽/л <small className="muted">({formatPercent(row.change_percent)})</small>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="comparison-empty">
          <Plus size={21} />
          <p>
            {selection.compare.length
              ? 'Нет общих дат для выбранных регионов. Измените период или состав сравнения.'
              : 'Добавьте регион, чтобы увидеть разницу в средних ценах.'}
          </p>
        </div>
      )}
      <div className="comparison-footnote">
        <Info size={14} />
        <span>
          Разница по средним региональным ценам. Доставка и условия закупки не учтены.
          {comparison?.comparison_start && (
            <>
              {' '}
              Изменение: {formatDate(comparison.comparison_start)} —{' '}
              {formatDate(comparison.comparison_end, true)}.
            </>
          )}
          {comparison?.reason === 'ONE_COMMON_DATE' && (
            <> Одна общая дата: изменение не рассчитывается.</>
          )}
        </span>
      </div>
    </section>
  )
}

function Sources({ meta, mode }: { meta: Meta; mode: Dataset['mode'] }) {
  return (
    <div className="sources-layout">
      <section className="panel sources-about">
        <span className="source-symbol">
          <Database size={27} />
        </span>
        <h2>
          Открытая статистика.
          <br />
          Понятные ограничения.
        </h2>
        <p>
          Используем еженедельные публикации Росстата о средних потребительских ценах на
          автомобильный бензин и дизельное топливо в субъектах РФ.
        </p>
        <div className="source-facts">
          <div>
            <strong>{meta.regions.filter((region) => region.available).length}</strong>
            <span>регионов в наборе</span>
          </div>
          <div>
            <strong>3</strong>
            <span>вида топлива</span>
          </div>
          <div>
            <strong>{meta.expected_dates.length}</strong>
            <span>дат наблюдений</span>
          </div>
        </div>
        <a
          className="primary-button"
          href="https://rosstat.gov.ru/compendium/document/50798"
          target="_blank"
          rel="noreferrer"
        >
          Каталог Росстата
          <ExternalLink size={16} />
        </a>
      </section>
      <section className="panel methodology">
        <h2>Как читать эти данные</h2>
        <ul>
          <li>
            <Check size={17} />
            <div>
              <strong>Цена в рублях за литр</strong>
              <p>
                Средняя розничная по региону. Это ориентир для бюджета, а не оптовая котировка или
                предложение АЗС.
              </p>
            </div>
          </li>
          <li>
            <Check size={17} />
            <div>
              <strong>Каждая точка — отдельное наблюдение</strong>
              <p>
                История: {formatDate(meta.expected_dates[0], true)} —{' '}
                {formatDate(meta.expected_dates.at(-1), true)}. Не создаём ежедневные цены между
                недельными публикациями.
              </p>
            </div>
          </li>
          <li>
            <Check size={17} />
            <div>
              <strong>Регионы сравниваются на общие даты</strong>
              <p>
                Разницу считаем на последнюю общую дату; изменение — между первой и последней общими
                датами.
              </p>
            </div>
          </li>
          <li>
            <Check size={17} />
            <div>
              <strong>Пропуски остаются пропусками</strong>
              <p>
                Доступны только территории с наблюдениями в источнике. Данные других территорий не
                достраиваются. Архангельская и Тюменская области — без входящих автономных округов,
                которые представлены отдельно.
              </p>
            </div>
          </li>
        </ul>
      </section>
      <section className="panel publication-panel">
        <div className="section-heading">
          <div>
            <h2>Публикации и состояние набора</h2>
            <p>
              {mode === 'api'
                ? 'Данные получены через API'
                : 'Используется проверенный резервный снимок'}
            </p>
          </div>
          <span className="version-badge">Версия {meta.dataset_version.slice(0, 8)}</span>
        </div>
        <div className="dataset-info">
          <span>
            Опубликован: <strong>{formatDate(meta.published_at, true)}</strong>
          </span>
          <span>
            Проверка источника:{' '}
            <strong>
              {meta.last_successful_check_at
                ? formatDate(meta.last_successful_check_at, true)
                : 'ещё не зафиксирована'}
            </strong>
          </span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Дата наблюдения</th>
                <th>Дата публикации</th>
                <th>Источник</th>
              </tr>
            </thead>
            <tbody>
              {[...meta.sources].reverse().map((source) => (
                <tr key={source.id}>
                  <td>{formatDate(source.observation_date, true)}</td>
                  <td>{formatDate(source.published_date, true)}</td>
                  <td>
                    <a className="source-link" href={source.url} target="_blank" rel="noreferrer">
                      Публикация Росстата
                      <ExternalLink size={13} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
