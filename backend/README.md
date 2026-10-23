# Backend

Запуск и установка — в [основном README](../README.md).

API:

- `GET /api/v1/meta` — регионы, источники и версия набора.
- `GET /api/v1/prices` — история цен.
- `GET /api/v1/comparison` — сравнение регионов.
- `GET /health/ready` — готовность сервиса.

Сначала получите `dataset_version` из `/meta` и передавайте её в запросах.
Цены — в копейках за литр; пропуски не заменяются нулями.

Команды: `python -m app.cli collect`, `review`, `publish`, `rollback`, `export-snapshot`, `backup`.
Сборщик использует только разрешённые адреса Росстата; аномалии требуют проверки.
Конфигурации systemd и HTTPS — в [infra](../infra/).
