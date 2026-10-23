# Frontend

React + TypeScript + Vite. Графики, сравнение до трёх регионов, расчёт техники или партии топлива, собственная цена и ссылки с фильтрами.

```sh
npm ci
npm run dev
```

Открыть http://127.0.0.1:5173. Локальный `/api` проксируется на `127.0.0.1:8011`.

## Проверки

```sh
npm test
npm run build
npm run test:e2e
```

Локальные браузерные тесты используют установленный Chrome. В CI — Playwright Chromium. Один тест требует локального backend; остальные проверяют интерфейс и ошибки без внешней сети. Общие примеры сравнения для Python и TypeScript — `../shared/comparison-cases.json`.

## Vercel

- Root Directory: `frontend`; Framework: Vite; Build: `npm run build`; Output: `dist`.
- Node.js: 22.12+.
- `VITE_API_BASE_URL=https://api.example.ru` — HTTPS-адрес API без `/api/v1`.
- Добавить адрес frontend в `FUEL_CORS_ORIGINS` backend. Отключить защиту доступа к демонстрационному сайту.
- Без доступного API показывается резерв с датой и версией. Это сохранённая история, не онлайн-обновление.

Обновление резерва: в `backend` выполнить `python -m app.cli export-snapshot exports/snapshot.json`, затем в `frontend` — `node scripts/prepare-snapshot.mjs` и пересобрать сайт. Экспортировать только опубликованный набор после проверки.
