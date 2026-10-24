# АгроТопливо

[![Backend CI](https://github.com/Owlmn/fuel-prices/actions/workflows/backend.yml/badge.svg)](https://github.com/Owlmn/fuel-prices/actions/workflows/backend.yml)
[![Frontend CI](https://github.com/Owlmn/fuel-prices/actions/workflows/frontend.yml/badge.svg)](https://github.com/Owlmn/fuel-prices/actions/workflows/frontend.yml)

Региональный сервис мониторинга цен на топливо и расчёта бюджета заправки сельхозтехники. Помогает оценить динамику цен, сравнить регионы и рассчитать стоимость нужного объёма топлива.

**[Открыть сервис](https://agro-fuel.duckdns.org/)** · [Метаданные API](https://fuel-prices.duckdns.org/api/v1/meta)

## Возможности

- Цены ДТ, АИ-92 и АИ-95 по 85 регионам из доступного набора Росстата.
- Графики и фильтры по региону, топливу и периоду, включая полугодие и год.
- Сравнение базового региона с четырьмя дополнительными на общие даты.
- Бюджет партии топлива или парка техники; долив до полного бака с учётом остатка.
- Собственная цена, оценка изменения бюджета в калькуляторе и экспорт расчёта в CSV.
- Светлая, тёмная и системная темы, мобильный интерфейс, резервный режим при недоступности API.

## Данные

Источник — [еженедельные публикации Росстата](https://rosstat.gov.ru/compendium/document/50798). Сервис хранит версии наборов, даты и ссылки на исходные документы. Пропуски остаются пропусками; аномальные изменения проходят проверку перед публикацией.

Средняя розничная цена используется как ориентир для бюджета. Доставка и условия конкретного поставщика в расчёт не входят.

## Технологии и структура

| Компонент       | Технологии                                                       | Каталог                                            |
| --------------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| Интерфейс       | Next.js, React, TypeScript, TanStack Query, Recharts, decimal.js | [`frontend/`](frontend/)                           |
| API и данные    | Python, FastAPI, SQLAlchemy, SQLite/WAL, Alembic                 | [`backend/`](backend/)                             |
| Сбор публикаций | httpx, BeautifulSoup, lxml                                       | [`backend/app/collector/`](backend/app/collector/) |
| Размещение      | Vercel, VPS, systemd, nginx, Certbot                             | [`infra/`](infra/)                                 |

Общие примеры расчётов и контрактов для Python и TypeScript находятся в [`shared/`](shared/).

## Локальный запуск

Для интерфейса нужен Node.js 22.12+:

```sh
cd frontend
npm ci
npm run dev
```

Открыть [localhost:5173](http://127.0.0.1:5173). Без локального API приложение использует резервный снимок с указанной датой и версией. Настройка адреса API — в [frontend/README.md](frontend/README.md).

<details>
<summary>Запуск собственного API — Python 3.12–3.14, PowerShell</summary>

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.lock
Copy-Item .env.example .env
.venv\Scripts\python.exe -m app.cli init-db
.venv\Scripts\python.exe -m app.cli bootstrap --weeks 53
```

Проверить созданный набор и подставить его ID:

```powershell
.venv\Scripts\python.exe -m app.cli review VERSION_ID
.venv\Scripts\python.exe -m app.cli publish VERSION_ID --reason "Данные проверены" --operator YOUR_NAME
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8011
```

[Swagger UI](http://127.0.0.1:8011/docs) · [Описание API](backend/README.md)

В `.env.example` задано исключение проверки TLS только для разрешённых адресов Росстата. Локальная база и настройки окружения не включаются в Git.

</details>

## Проверки

В `frontend/`: `npm test`, `npm run typecheck`, `npm run build`, `npm run test:e2e`. Для локальных браузерных проверок нужен Chrome.

В `backend/`, с активированным окружением:

```sh
python -m pip check
python -m ruff check app tests migrations
python -m ruff format --check app tests migrations
python -m pytest -q
```

GitHub Actions проверяет бэкенд на Python 3.12 и 3.14, а фронтенд — модульными и браузерными тестами с production-сборкой.

## Размещение

Фронтенд размещается на Vercel с Root Directory `frontend`; [параметры деплоя](frontend/README.md#vercel). API, база и автономный сборщик работают на VPS. Шаблоны служб и резервного копирования — в [`infra/systemd/`](infra/systemd/).
