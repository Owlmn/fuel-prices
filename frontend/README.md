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
- Include source files outside Root Directory: включить, чтобы TypeScript видел общие примеры из `shared/`.
- Node.js: 22.12+.
- `SITE_URL` — публичный адрес сайта для превью ссылок; без него используется адрес Vercel.
- API в production уже настроен: `https://fuel-prices.duckdns.org`. Обязательных переменных окружения нет.
- При необходимости `FUEL_API_BASE_URL` переопределяет серверный адрес API без `/api/v1`; пустое значение включает только резерв. Переменная не попадает в клиентскую сборку. После изменения нужен новый деплой.
- Браузер обращается к своему домену Next.js; для этого пути CORS не нужен. Отключить защиту доступа к демонстрационному сайту.
- Без доступного API показывается резерв с датой и версией. Это сохранённая история, не онлайн-обновление.
- API, SQLite и автономный сборщик размещаются отдельно на VPS. Данные не хранятся в файловой системе Vercel.

Обновление резерва: в `backend` выполнить `python -m app.cli export-snapshot exports/snapshot.json`, затем в `frontend` — `node scripts/prepare-snapshot.mjs` и пересобрать сайт. Экспортировать только опубликованный набор после проверки.
