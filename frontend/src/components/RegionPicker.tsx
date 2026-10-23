import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, MapPin, Search } from 'lucide-react'
import type { Region } from '../lib/contracts'

export default function RegionPicker({
  regions,
  value,
  onChange,
  label = 'Регион',
  exclude = [],
}: {
  regions: Region[]
  value: string
  onChange: (id: string) => void
  label?: string
  exclude?: string[]
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const id = useId()
  const selected = regions.find((region) => region.id === value)
  const filtered = regions.filter(
    (region) =>
      region.available &&
      !exclude.includes(region.id) &&
      region.name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')),
  )
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
    button.current?.focus()
  }
  return (
    <div
      className="region-picker"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape') close()
      }}
    >
      <span className="field-label" id={`${id}-label`}>
        {label}
      </span>
      <button
        className="select-button"
        ref={button}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(!open)
          setSearch('')
        }}
      >
        <MapPin size={17} className="muted-icon" />
        <span id={`${id}-value`}>{selected?.name ?? 'Выберите регион'}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div
          className="region-popover"
          role="dialog"
          aria-label={label}
          id={`${id}-options`}
          onKeyDown={(event) => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
            if (
              event.target instanceof HTMLInputElement &&
              !['ArrowDown', 'ArrowUp'].includes(event.key)
            )
              return
            const options = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>('.region-options button'),
            )
            if (!options.length) return
            event.preventDefault()
            const current = options.indexOf(document.activeElement as HTMLButtonElement)
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? options.length - 1
                  : event.key === 'ArrowDown'
                    ? (current + 1) % options.length
                    : current <= 0
                      ? options.length - 1
                      : current - 1
            options[next].focus()
          }}
        >
          <div className="region-search">
            <Search size={17} />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Поиск региона"
              placeholder="Найти регион…"
            />
          </div>
          <div className="region-options">
            {filtered.map((region) => (
              <button
                key={region.id}
                className={region.id === value ? 'selected' : ''}
                onClick={() => {
                  onChange(region.id)
                  close()
                }}
              >
                {region.name}
                {region.id === value && <Check size={16} />}
              </button>
            ))}
            {!filtered.length && <p className="muted empty-search">Регион не найден</p>}
          </div>
          <div className="picker-footer">
            {filtered.length} из {regions.filter((region) => region.available).length} доступных
            регионов
          </div>
        </div>
      )}
    </div>
  )
}
