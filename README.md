# Мониторинг цен на топливо

Сервис сравнения региональных цен и расчёта бюджета заправки сельхозтехники.
Backend и адаптивный frontend: графики, сравнение регионов и калькулятор заправки.

- Данные Росстата: 85 регионов, ДТ, АИ-92 и АИ-95.
- Годовая история, сравнение на общие даты, расчёт долива и экспорт бюджета в CSV.
- Стек: Next.js App Router, React, TypeScript; Python, FastAPI, SQLite/WAL, Alembic.

## Запуск

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.lock
Copy-Item .env.example .env
.venv\Scripts\python.exe -m app.cli init-db
.venv\Scripts\python.exe -m app.cli bootstrap --weeks 53
```

Проверить первый набор и подставить его ID:

```powershell
.venv\Scripts\python.exe -m app.cli review VERSION_ID
.venv\Scripts\python.exe -m app.cli publish VERSION_ID --reason "Данные проверены" --operator YOUR_NAME
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8011
```

Swagger: http://127.0.0.1:8011/docs.

Frontend — в отдельном терминале:

```powershell
cd frontend
npm ci
npm run dev
```

Сервис: http://127.0.0.1:5173. API проксируется на порт 8011; при недоступности используется подписанный датой резервный снимок.

## Проверки и размещение

Из `backend`: `python -m pytest -q` и `python -m ruff check app tests migrations` с активированным окружением.

Frontend: `npm test`, `npm run build`, `npm run test:e2e` (локально нужен Chrome).
Шаблоны запуска на VPS — в `infra/`. Настройки Vercel — в [frontend/README.md](frontend/README.md).
В `.env.example` задано исключение проверки TLS только для Росстата.
Локальная БД, настройки и окружение в Git не включены.
