'use client'

import { useEffect, useId, useState, useSyncExternalStore } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import {
  applyTheme,
  getThemePreference,
  setThemePreference,
  subscribeTheme,
  type ThemePreference,
} from '../lib/theme'

export default function ThemeControl() {
  const id = useId()
  const [dismissed, setDismissed] = useState(false)
  const preference = useSyncExternalStore(
    subscribeTheme,
    getThemePreference,
    () => 'system' as const,
  )
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const syncSystem = () => applyTheme(getThemePreference())
    const syncStorage = (event: StorageEvent) => {
      if (event.key !== 'fuel-theme' && event.key !== null) return
      const saved = event.newValue
      setThemePreference(saved === 'light' || saved === 'dark' ? saved : 'system')
    }
    syncSystem()
    media.addEventListener('change', syncSystem)
    window.addEventListener('storage', syncStorage)
    return () => {
      media.removeEventListener('change', syncSystem)
      window.removeEventListener('storage', syncStorage)
    }
  }, [])
  return (
    <div className="theme-control" role="group" aria-label="Тема оформления">
      {(
        [
          ['light', Sun, 'Светлая тема', 'Светлый фон для работы днём'],
          ['dark', Moon, 'Тёмная тема', 'Тёмный фон для работы при слабом освещении'],
          ['system', Monitor, 'Системная тема', 'Автоматически повторяет тему устройства'],
        ] as const
      ).map(([value, Icon, label, hint]) => (
        <span className="theme-option" key={value}>
          <button
            type="button"
            aria-label={label}
            aria-pressed={preference === value}
            aria-describedby={`${id}-${value}`}
            onClick={() => setThemePreference(value as ThemePreference)}
            onPointerEnter={() => setDismissed(false)}
            onFocus={() => setDismissed(false)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setDismissed(true)
            }}
          >
            <Icon size={18} aria-hidden="true" />
          </button>
          <span id={`${id}-${value}`} className="theme-tooltip" role="tooltip" hidden={dismissed}>
            <strong>{label}</strong>
            {hint}
          </span>
        </span>
      ))}
    </div>
  )
}
