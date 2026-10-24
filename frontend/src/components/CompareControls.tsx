import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { MAX_COMPARE_REGIONS, type Meta, type Selection } from '../lib/contracts'
import { lineColors } from '../lib/presentation'

export default function CompareControls({
  meta,
  selection,
  onChange,
}: {
  meta: Meta
  selection: Selection
  onChange: (patch: Partial<Selection>) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<string[]>([])
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  const available = meta.regions.filter(
    (region) => region.available && region.id !== selection.region,
  )
  const filtered = available.filter((region) =>
    region.name.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')),
  )
  const base = meta.regions.find((region) => region.id === selection.region)?.name
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }
  return (
    <div className="comparison-controls" aria-label="Регионы для сравнения">
      <div className="region-chips">
        {[selection.region, ...selection.compare].map((regionId, index) => (
          <span key={regionId} className="region-chip">
            <i style={{ background: lineColors[index] }} />
            {meta.regions.find((region) => region.id === regionId)?.name}
            {index === 0 ? (
              <small>база</small>
            ) : (
              <button
                aria-label={`Убрать ${meta.regions.find((region) => region.id === regionId)?.name}`}
                onClick={() =>
                  onChange({ compare: selection.compare.filter((region) => region !== regionId) })
                }
              >
                <X size={13} />
              </button>
            )}
          </span>
        ))}
      </div>
      <div
        className="comparison-picker"
        ref={root}
        onKeyDown={(event) => {
          if (event.key === 'Escape') close()
        }}
      >
        <span className="field-label">
          Дополнительные регионы: {selection.compare.length}/{MAX_COMPARE_REGIONS}
        </span>
        <button
          className="select-button"
          ref={trigger}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={id}
          onClick={() => {
            if (open) close()
            else {
              setDraft([...selection.compare])
              setSearch('')
              setOpen(true)
            }
          }}
        >
          <span>Выбрать регионы</span>
          <ChevronDown size={15} aria-hidden="true" />
        </button>
        {open && (
          <div
            className="region-popover comparison-popover"
            id={id}
            role="dialog"
            aria-label="Выбор регионов для сравнения"
            aria-describedby={`${id}-help`}
          >
            <p className="comparison-base">Базовый: {base}</p>
            <div className="region-search">
              <Search size={17} aria-hidden="true" />
              <input
                autoFocus
                aria-label="Поиск регионов для сравнения"
                placeholder="Найти регион…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <p className="comparison-selection-count" id={`${id}-help`} role="status">
              Выбрано {draft.length} из {MAX_COMPARE_REGIONS} дополнительных регионов
            </p>
            <div
              className="region-options comparison-options"
              role="group"
              aria-label="Дополнительные регионы"
            >
              {filtered.map((region) => (
                <label key={region.id} className="comparison-choice">
                  <input
                    type="checkbox"
                    checked={draft.includes(region.id)}
                    disabled={!draft.includes(region.id) && draft.length >= MAX_COMPARE_REGIONS}
                    onChange={(event) =>
                      setDraft((previous) =>
                        event.target.checked
                          ? [...previous, region.id]
                          : previous.filter((value) => value !== region.id),
                      )
                    }
                  />
                  <span>{region.name}</span>
                </label>
              ))}
              {!filtered.length && <p className="empty-search">Регион не найден</p>}
            </div>
            <div className="comparison-actions">
              <button className="secondary-button" onClick={close}>
                Отмена
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  close()
                  onChange({ compare: draft })
                }}
              >
                Применить
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
