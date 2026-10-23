import { ExternalLink } from 'lucide-react'
import type { Dataset, Meta } from '../lib/contracts'
import { formatDate } from '../lib/numbers'

export default function Sources({ meta, mode }: { meta: Meta; mode: Dataset['mode'] }) {
  return (
    <div className="sources-layout">
      <section className="panel sources-about">
        <h2>Еженедельные публикации Росстата</h2>
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
            <strong>{meta.fuel_types.length}</strong>
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
            <div>
              <strong>Цена в рублях за литр</strong>
              <p>
                Средняя розничная по региону. Это ориентир для бюджета, а не оптовая котировка или
                предложение АЗС.
              </p>
            </div>
          </li>
          <li>
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
            <div>
              <strong>Регионы сравниваются на общие даты</strong>
              <p>
                Разницу считаем на последнюю общую дату; изменение — между первой и последней общими
                датами.
              </p>
            </div>
          </li>
          <li>
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
        <div className="table-scroll" role="region" aria-label="Публикации Росстата" tabIndex={0}>
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
