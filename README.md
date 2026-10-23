# Мониторинг цен на топливо

Сервис сравнения региональных цен и расчёта бюджета заправки сельхозтехники.
Backend готов; frontend — следующий этап.

- Данные Росстата: 85 регионов, ДТ, АИ-92 и АИ-95.
- История цен, сравнение на общие даты, проверка обновлений.
- Стек: Python 3.12–3.14, FastAPI, SQLite/WAL, Alembic.

## Запуск

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.lock
Copy-Item .env.example .env
.venv\Scripts\python.exe -m app.cli init-db
.venv\Scripts\python.exe -m app.cli bootstrap --weeks 13
```

Проверить первый набор и подставить его ID:

```powershell
.venv\Scripts\python.exe -m app.cli review VERSION_ID
.venv\Scripts\python.exe -m app.cli publish VERSION_ID --reason "Данные проверены" --operator YOUR_NAME
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8011
```

Swagger: http://127.0.0.1:8011/docs.

## Проверки и размещение

Из `backend`: `python -m pytest -q` и `python -m ruff check app tests migrations` с активированным окружением.

Шаблоны запуска на VPS — в `infra/`. Frontend планируется разместить на Vercel.
В `.env.example` задано исключение проверки TLS только для Росстата.
Локальная БД, настройки и окружение в Git не включены.
