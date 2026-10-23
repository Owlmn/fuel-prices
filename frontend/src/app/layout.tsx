import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import '@fontsource/manrope/cyrillic-400.css'
import '@fontsource/manrope/cyrillic-500.css'
import '@fontsource/manrope/cyrillic-600.css'
import '@fontsource/manrope/cyrillic-700.css'
import '@fontsource/manrope/latin-400.css'
import '@fontsource/manrope/latin-500.css'
import '@fontsource/manrope/latin-600.css'
import '@fontsource/manrope/latin-700.css'
import '@fontsource/golos-text/cyrillic-400.css'
import '@fontsource/golos-text/cyrillic-500.css'
import '@fontsource/golos-text/latin-400.css'
import '@fontsource/golos-text/latin-500.css'
import '../styles.css'
import Providers from './providers'

export const metadata: Metadata = {
  title: 'АгроТопливо — цены и бюджет заправки',
  description:
    'Сравнивайте региональные цены на топливо по данным Росстата и рассчитывайте бюджет заправки сельхозтехники.',
  icons: { icon: '/favicon.svg' },
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#174d3c' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
