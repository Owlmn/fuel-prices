import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CalendarDays } from 'lucide-react'
import type { Meta, Price } from '../lib/contracts'
import { formatDate, formatPrice } from '../lib/numbers'

import { lineColors } from '../lib/presentation'
export default function PriceChart({
  series,
  meta,
  comparison,
}: {
  series: Price[]
  meta: Meta
  comparison: boolean
}) {
  const dates = [
    ...new Set(
      series.flatMap((item) => [
        ...item.expected_dates,
        ...item.observations.map((point) => point.date),
      ]),
    ),
  ].sort()
  const rows = dates.map((date) => {
    const row: Record<string, number | null> = { time: Date.parse(`${date}T00:00:00Z`) }
    series.forEach((item) => {
      row[item.region_id] =
        item.observations.find((point) => point.date === date)?.price_kopecks ?? null
    })
    return row
  })
  const points = series.flatMap((item) => item.observations.map((point) => point.price_kopecks))
  const name = (id: string) => meta.regions.find((region) => region.id === id)?.name ?? id
  if (!points.length)
    return (
      <div className="chart-empty">
        <CalendarDays size={32} />
        <h3>В этом периоде нет наблюдений</h3>
        <p>Расширьте период или выберите другой регион.</p>
      </div>
    )
  const min = Math.min(...points),
    max = Math.max(...points)
  const padding = Math.max(50, (max - min) * 0.25)
  return (
    <>
      <div className="chart-legend">
        {series.map((item, index) => (
          <span key={item.region_id}>
            <i style={{ background: lineColors[index] }} />
            {name(item.region_id)}
          </span>
        ))}
        <span className="chart-unit">₽ / литр</span>
      </div>
      <div
        className="price-chart"
        role="img"
        aria-label={`${comparison ? 'Сравнение динамики' : 'Динамика цен'}: ${series.map((item) => name(item.region_id)).join(', ')}. Точные значения доступны под графиком.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            margin={{ top: 16, right: 18, left: 0, bottom: 5 }}
            accessibilityLayer
          >
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="4 5" vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              scale="time"
              domain={
                dates.length === 1
                  ? [rows[0].time! - 86_400_000, rows[0].time! + 86_400_000]
                  : ['dataMin', 'dataMax']
              }
              tickFormatter={(value) => formatDate(new Date(value).toISOString().slice(0, 10))}
              ticks={dates
                .filter(
                  (_, i) =>
                    i % Math.max(1, Math.ceil(dates.length / 6)) === 0 || i === dates.length - 1,
                )
                .map((date) => Date.parse(date))}
              axisLine={false}
              tickLine={false}
              tickMargin={16}
              minTickGap={20}
              tick={{ fill: 'var(--muted)', fontSize: 12 }}
            />
            <YAxis
              domain={[
                Math.floor((min - padding) / 100) * 100,
                Math.ceil((max + padding) / 100) * 100,
              ]}
              tickFormatter={(value) => formatPrice(value)}
              tickCount={5}
              axisLine={false}
              tickLine={false}
              width={68}
              tick={{ fill: 'var(--muted)', fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--ink)',
                borderRadius: 6,
                boxShadow: 'var(--popover-shadow)',
                fontSize: 12,
              }}
              labelFormatter={(value) =>
                formatDate(new Date(Number(value)).toISOString().slice(0, 10), true)
              }
              formatter={(value, key) => [`${formatPrice(Number(value))} ₽/л`, name(String(key))]}
              filterNull
              cursor={{ stroke: 'var(--muted)', strokeDasharray: '4 4' }}
            />
            {series.map((item, index) => (
              <Line
                key={item.region_id}
                type="linear"
                dataKey={item.region_id}
                stroke={lineColors[index]}
                strokeWidth={2.5}
                connectNulls={false}
                dot={{ r: 3.5, fill: 'var(--surface)', strokeWidth: 2 }}
                activeDot={{ r: 6, strokeWidth: 3, stroke: 'var(--surface)' }}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-footer">
        <span>Еженедельные наблюдения · без интерполяции</span>
        <details>
          <summary>Точные значения</summary>
          <div
            className="table-scroll"
            role="region"
            aria-label="Точные цены по датам"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>Дата</th>
                  {series.map((item) => (
                    <th key={item.region_id}>{name(item.region_id)}, ₽/л</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dates.map((date) => (
                  <tr key={date}>
                    <td>{formatDate(date, true)}</td>
                    {series.map((item) => (
                      <td key={item.region_id}>
                        {formatPrice(
                          item.observations.find((point) => point.date === date)?.price_kopecks,
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </>
  )
}
