export type ThemePreference = 'system' | 'light' | 'dark'
const themeEvent = 'fuel-theme-change'

export const themeInitializationScript = `(() => {
  let preference = 'system';
  try {
    const saved = localStorage.getItem('fuel-theme');
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch {}
  const dark = preference === 'dark' || (preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();`

export function getThemePreference(): ThemePreference {
  const value = document.documentElement.dataset.themePreference
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function applyTheme(preference: ThemePreference) {
  const dark =
    preference === 'dark' ||
    (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.themePreference = preference
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

export function setThemePreference(preference: ThemePreference) {
  try {
    if (preference === 'system') localStorage.removeItem('fuel-theme')
    else localStorage.setItem('fuel-theme', preference)
  } catch {
    /* The current session still supports theme changes. */
  }
  applyTheme(preference)
  window.dispatchEvent(new Event(themeEvent))
}

export function subscribeTheme(onChange: () => void) {
  window.addEventListener(themeEvent, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(themeEvent, onChange)
    window.removeEventListener('storage', onChange)
  }
}
