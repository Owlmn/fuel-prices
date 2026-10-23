import type { ReactNode } from 'react'
import type { Meta } from '../lib/contracts'
import { formatDate } from '../lib/numbers'
import { menu } from '../lib/presentation'
import type { View } from '../lib/selection'

export default function AppShell({
  view,
  onNavigate,
  meta,
  children,
}: {
  view: View
  onNavigate: (view: View) => void
  meta: Meta
  children: ReactNode
}) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        К содержимому
      </a>
      <aside className="sidebar">
        <button className="brand" title="Открыть обзор цен" onClick={() => onNavigate('overview')}>
          <img src="/favicon.svg" width="36" height="36" alt="" />
          <span>
            АгроТопливо<small>Цены и расчёт заправки</small>
          </span>
        </button>
        <nav aria-label="Основная навигация">
          {menu.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? 'nav-item active' : 'nav-item'}
              aria-current={view === item.id ? 'page' : undefined}
              aria-label={item.label}
              onClick={() => onNavigate(item.id)}
            >
              <item.icon size={18} aria-hidden="true" />
              <span className="desktop-nav-label">{item.label}</span>
              <span className="mobile-nav-label">
                {item.id === 'comparison' ? 'Сравнение' : item.label}
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-data">
          <p>Данные Росстата</p>
          <dl>
            <div>
              <dt>Последняя дата</dt>
              <dd>{formatDate(meta.expected_dates.at(-1), true)}</dd>
            </div>
            <div>
              <dt>Регионов</dt>
              <dd>{meta.regions.filter((region) => region.available).length}</dd>
            </div>
            <div>
              <dt>Топливо</dt>
              <dd>ДТ · АИ-92 · АИ-95</dd>
            </div>
          </dl>
          <button className="text-button" onClick={() => onNavigate('sources')}>
            Источники и методика
          </button>
        </div>
        <p className="sidebar-bottom">
          Средние розничные цены, ₽/л.
          <br />
          Обновление по публикациям источника.
        </p>
      </aside>
      <div className="main-shell">{children}</div>
    </div>
  )
}
