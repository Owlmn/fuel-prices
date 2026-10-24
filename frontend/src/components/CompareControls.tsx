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
  const dialog = useRef<HTMLDialogElement>(null)
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
    const element = dialog.current!
    element.showModal()
    return () => element.close()
  }, [open])
  const close = () => {
    dialog.current?.close()
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
      <div className="comparison-picker">
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
          <dialog
            ref={dialog}
            className="comparison-dialog"
            id={id}
            aria-modal="true"
            aria-label="Выбор регионов для сравнения"
            aria-describedby={`${id}-help`}
            onKeyDown={(event) => {
              if (event.key !== 'Tab') return
              const controls = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>(
                  'input:not(:disabled), button:not(:disabled)',
                ),
              )
              const first = controls[0]
              const last = controls.at(-1)!
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault()
                last.focus()
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault()
                first.focus()
              }
            }}
            onCancel={(event) => {
              event.preventDefault()
              close()
            }}
            onClick={(event) => {
              if (event.target !== event.currentTarget) return
              const box = event.currentTarget.getBoundingClientRect()
              if (
                event.clientX < box.left ||
                event.clientX > box.right ||
                event.clientY < box.top ||
                event.clientY > box.bottom
              )
                close()
            }}
          >
            <h2>Регионы для сравнения</h2>
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
          </dialog>
        )}
      </div>
    </div>
  )
}
