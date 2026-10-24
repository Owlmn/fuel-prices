'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { applyTheme, getThemePreference, setThemePreference, subscribeTheme } from '../lib/theme'

export default function ThemeControl() {
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
          ['light', Sun, 'Светлая тема'],
          ['dark', Moon, 'Тёмная тема'],
          ['system', Monitor, 'Системная тема'],
        ] as const
      ).map(([value, Icon, label]) => (
        <span className="theme-option" key={value}>
          <button
            type="button"
            aria-label={label}
            aria-pressed={preference === value}
            onClick={() => setThemePreference(value)}
          >
            <Icon size={18} aria-hidden="true" />
          </button>
        </span>
      ))}
    </div>
  )
}
