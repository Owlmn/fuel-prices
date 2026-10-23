# Frontend

Next.js App Router + React + TypeScript. Графики, сравнение до трёх регионов, расчёт техники или партии топлива, собственная цена и ссылки с фильтрами.

```sh
npm ci
npm run dev
```

Открыть http://127.0.0.1:5173. Серверные маршруты Next.js `/api/v1/*` обращаются к backend на `127.0.0.1:8011`. Другой адрес задаётся серверной переменной `FUEL_API_BASE_URL` в `.env.local`.

## Проверки

```sh
npm test
npm run build
npm run start
npm run test:e2e
```

Локальные браузерные тесты используют установленный Chrome. В CI — production-сборка Next.js и Playwright Chromium. Один тест требует локального backend; остальные проверяют интерфейс и ошибки без внешней сети. Общие примеры сравнения для Python и TypeScript — `../shared/comparison-cases.json`.

## Vercel

- Root Directory: `frontend`; Framework: Next.js; Build: `npm run build`; Output Directory оставить по умолчанию.
- Node.js: 22.12+.
- `FUEL_API_BASE_URL=https://api.example.ru` — серверный HTTPS-адрес API без `/api/v1`. Он не попадает в клиентскую сборку.
- Браузер обращается к своему домену Next.js; для этого пути CORS не нужен. Отключить защиту доступа к демонстрационному сайту.
- Без доступного API показывается резерв с датой и версией. Это сохранённая история, не онлайн-обновление.
- API, SQLite и автономный сборщик размещаются отдельно на VPS. Данные не хранятся в файловой системе Vercel.

Обновление резерва: в `backend` выполнить `python -m app.cli export-snapshot exports/snapshot.json`, затем в `frontend` — `node scripts/prepare-snapshot.mjs` и пересобрать сайт. Экспортировать только опубликованный набор после проверки.
