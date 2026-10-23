import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="startup">
      <img src="/favicon.svg" width="48" height="48" alt="" />
      <p className="muted">АгроТопливо · 404</p>
      <h1>Страница не найдена</h1>
      <p>Вернитесь к ценам на топливо и расчёту заправки.</p>
      <Link className="primary-button" href="/">
        Открыть обзор цен
      </Link>
    </main>
  )
}
