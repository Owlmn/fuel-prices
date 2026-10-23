import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const alt = 'АгроТопливо — региональные цены на топливо и расчёт заправки'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const fonts = await Promise.all(
    ['cyrillic', 'latin'].map(async (subset) => ({
      name: `Manrope-${subset}`,
      data: await readFile(
        join(
          process.cwd(),
          `node_modules/@fontsource/manrope/files/manrope-${subset}-600-normal.woff`,
        ),
      ),
      weight: 600 as const,
      style: 'normal' as const,
    })),
  )
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        padding: 64,
        background: '#f4f6f3',
        color: '#243a30',
        fontFamily: 'Manrope-cyrillic, Manrope-latin',
        fontWeight: 600,
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 32, color: '#1d654b' }}
      >
        <svg width="42" height="52" viewBox="0 0 42 52">
          <path d="M21 2C16 12 3 24 3 32a18 18 0 0 0 36 0C39 24 26 12 21 2Z" fill="#1d654b" />
        </svg>
        АгроТопливо
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', fontSize: 72, lineHeight: 1.12, letterSpacing: -2 }}>
          Цены на топливо
          <br />
          по регионам
        </div>
        <div style={{ display: 'flex', fontSize: 30, color: '#59675f' }}>
          Сравнение динамики и расчёт заправки сельхозтехники
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid #d7dfd8',
          paddingTop: 24,
          fontSize: 25,
        }}
      >
        <span>ДТ · АИ-92 · АИ-95</span>
        <span style={{ color: '#59675f' }}>Данные Росстата</span>
      </div>
    </div>,
    { ...size, fonts },
  )
}
