import { Info, Plus } from 'lucide-react'
import type { Comparison, Meta, Selection } from '../lib/contracts'
import { formatDate, formatPercent, formatPrice, formatSigned } from '../lib/numbers'
import { lineColors } from '../lib/presentation'
import CompareControls from './CompareControls'

export default function ComparisonPanel({
  meta,
  comparison,
  selection,
  onChange,
  onExpand,
  overview,
  loading = false,
}: {
  meta: Meta
  comparison?: Comparison
  selection: Selection
  onChange: (patch: Partial<Selection>) => void
  onExpand: () => void
  overview: boolean
  loading?: boolean
}) {
  return (
    <section className="panel comparison-panel">
      <div className="section-heading">
        <div>
          <h2>Цены в других регионах</h2>
          <p>
            {comparison?.comparable
              ? `Сравнение на общую дату ${formatDate(comparison.comparison_end, true)}`
              : 'Выберите до четырёх регионов к базовому'}
          </p>
        </div>
        {overview && (
          <button className="text-button" onClick={onExpand}>
            Сравнить динамику
          </button>
        )}
      </div>
      <CompareControls meta={meta} selection={selection} onChange={onChange} />
      {loading ? (
        <p className="comparison-loading" role="status">
          Обновляем сравнение…
        </p>
      ) : comparison?.comparable ? (
        <div
          className="table-scroll comparison-table-wrap"
          role="region"
          aria-label="Сравнение цен по регионам"
          tabIndex={0}
        >
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
      {comparison?.comparable && (
        <div className="comparison-list">
          {comparison.rows.map((row, index) => (
            <article key={row.region_id}>
              <h3>
                <span className="table-region-dot" style={{ background: lineColors[index] }} />
                {meta.regions.find((region) => region.id === row.region_id)?.name}
                {row.region_id === selection.region && <small> · базовый</small>}
              </h3>
              <p className="comparison-mobile-price">
                {formatPrice(row.price_kopecks)} <span>₽/л</span>
              </p>
              <dl>
                <div>
                  <dt>Разница с базовым</dt>
                  <dd>
                    {row.region_id === selection.region
                      ? '—'
                      : `${formatSigned(row.difference_kopecks)} ₽/л (${formatPercent(row.difference_percent)})`}
                  </dd>
                </div>
                <div>
                  <dt>Изменение за период</dt>
                  <dd>
                    {row.change_kopecks === null
                      ? 'Нет данных'
                      : `${formatSigned(row.change_kopecks)} ₽/л (${formatPercent(row.change_percent)})`}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
      <div className="comparison-footnote">
        <Info size={14} />
        <span>
          Разница по средним региональным ценам. Доставка и условия закупки не учтены.
          {comparison?.comparison_start && (
            <>
              {' '}
              Изменение:{' '}
              {formatDate(
                comparison.comparison_start,
                comparison.comparison_start?.slice(0, 4) !== comparison.comparison_end?.slice(0, 4),
              )}{' '}
              — {formatDate(comparison.comparison_end, true)}.
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
