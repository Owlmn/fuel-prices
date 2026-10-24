import { useEffect } from 'react'
import { useQueries } from '@tanstack/react-query'
import { ApiError, getPrices } from '../lib/api'
import type { Dataset, Selection } from '../lib/contracts'
import { formatDate, formatPrice } from '../lib/numbers'
import { fuelNames } from '../lib/presentation'

export default function FuelPrices({
  dataset,
  selection,
  onReserve,
}: {
  dataset: Dataset
  selection: Selection
  onReserve: () => Promise<void>
}) {
  const { meta } = dataset
  const queries = useQueries({
    queries: meta.fuel_types.map(({ id: fuel }) => ({
      queryKey: [
        'prices',
        dataset.mode,
        meta.dataset_version,
        selection.region,
        fuel,
        selection.from,
        selection.to,
      ],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getPrices(dataset, { ...selection, fuel }, signal),
    })),
  })
  const error = queries.find((query) => query.error)?.error
  const loading = queries.some((query) => query.isPending)
  useEffect(() => {
    if (error instanceof ApiError && error.unavailable) void onReserve()
  }, [error, onReserve])
  const date = meta.expected_dates
    .filter((date) => date >= selection.from && date <= selection.to)
    .at(-1)
  const region = meta.regions.find((region) => region.id === selection.region)!
  return (
    <section
      className="panel fuel-prices-panel"
      aria-labelledby="fuel-prices-title"
      aria-busy={loading}
    >
      <div className="section-heading">
        <div>
          <h2 id="fuel-prices-title">Все виды топлива в регионе</h2>
          <p>
            {region.name} ·{' '}
            {date ? `цены на ${formatDate(date, true)}` : 'в выбранном периоде нет дат наблюдений'}
          </p>
        </div>
        <span className="muted small">Средние розничные цены, ₽/л</span>
      </div>
      {error ? (
        <div role="alert" className="fuel-prices-error">
          <p>Не удалось загрузить цены всех видов топлива.</p>
          <button
            className="text-button"
            onClick={() => queries.forEach((query) => void query.refetch())}
          >
            Повторить
          </button>
        </div>
      ) : (
        <div className="fuel-prices-grid">
          {meta.fuel_types.map(({ id: fuel }, index) => {
            const point = queries[index].data?.observations.find((point) => point.date === date)
            const source = meta.sources.find((source) => source.id === point?.source_id)
            return (
              <article className="fuel-price-item" key={fuel} aria-label={fuelNames[fuel]}>
                <h3>{fuelNames[fuel]}</h3>
                <p className="fuel-price-value" data-testid={`fuel-price-${fuel}`}>
                  {loading ? '—' : formatPrice(point?.price_kopecks)} <small>₽/л</small>
                </p>
                <p className="small muted">
                  {loading ? (
                    'Загружаем цену…'
                  ) : point && source ? (
                    <a href={source.url} target="_blank" rel="noreferrer">
                      Публикация Росстата ↗
                    </a>
                  ) : (
                    'Нет наблюдения на эту дату'
                  )}
                </p>
              </article>
            )
          })}
        </div>
      )}
      {loading && (
        <span role="status" className="sr-only">
          Загрузка цен всех видов топлива
        </span>
      )}
    </section>
  )
}
