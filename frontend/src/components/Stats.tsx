import type { Meta, Price } from '../lib/contracts'
import { formatDate, formatPercent, formatPrice, formatSigned } from '../lib/numbers'

export default function Stats({ price, meta }: { price: Price; meta: Meta }) {
  const summary = price.summary
  const latest = price.observations.at(-1)
  const source = meta.sources.find((source) => source.id === latest?.source_id)
  const movement = (summary.change_kopecks ?? 0) > 0 ? 'text-warm' : 'text-green'
  return (
    <section className="stats-grid" aria-label="Показатели региона">
      <div className="stat-card current-price">
        <p className="stat-label">Цена на {formatDate(latest?.date)}</p>
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
        <p>Средняя по региону</p>
      </div>
      <div className="stat-card">
        <p className="stat-label">Изменение за период</p>
        <div className="stat-value change-value">
          {formatSigned(summary.change_kopecks)}
          <span>₽/л</span>
          {summary.change_percent !== null && (
            <span className={`change-percent ${movement}`}>
              {formatPercent(summary.change_percent)}
            </span>
          )}
        </div>
        <p>
          {price.observations.length > 1
            ? `${formatDate(price.actual_period?.from)} — ${formatDate(price.actual_period?.to, true)}`
            : 'Нужно минимум два наблюдения'}
        </p>
      </div>
      <div className="stat-card range-card">
        <p className="stat-label">Диапазон за период, ₽/л</p>
        <dl className="range-values">
          <div>
            <dt>Минимум</dt>
            <dd>{formatPrice(summary.min_price_kopecks)}</dd>
          </div>
          <div>
            <dt>Максимум</dt>
            <dd>{formatPrice(summary.max_price_kopecks)}</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}
