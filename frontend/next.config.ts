import type { NextConfig } from 'next'

const config: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        source: '/snapshot.json',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=300' }],
      },
    ]
  },
}
export default config
