'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import {
  applyTheme,
  getThemePreference,
  setThemePreference,
  subscribeTheme,
  type ThemePreference,
} from '../lib/theme'

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
  const Icon = preference === 'dark' ? Moon : preference === 'light' ? Sun : Monitor
  return (
    <label className="theme-control">
      <Icon size={17} aria-hidden="true" />
      <span className="sr-only">Тема оформления</span>
      <select
        value={preference}
        onChange={(event) => setThemePreference(event.target.value as ThemePreference)}
      >
        <option value="system">Системная</option>
        <option value="light">Светлая</option>
        <option value="dark">Тёмная</option>
      </select>
    </label>
  )
}
