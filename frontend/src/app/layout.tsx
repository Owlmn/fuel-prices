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
  metadataBase: new URL(
    process.env.SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://127.0.0.1:5173'),
  ),
  title: 'АгроТопливо — цены и бюджет заправки',
  description:
    'Сравнивайте региональные цены на топливо по данным Росстата и рассчитывайте бюджет заправки сельхозтехники.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'АгроТопливо',
    title: 'АгроТопливо — цены и бюджет заправки',
    description: 'Региональные цены Росстата, сравнение динамики и расчёт заправки сельхозтехники.',
  },
  twitter: { card: 'summary_large_image' },
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
