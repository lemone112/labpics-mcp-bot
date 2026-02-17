# API reference (MVP)

Base URL: `NEXT_PUBLIC_API_BASE_URL` (по умолчанию `http://localhost:8080`).

Все ответы включают `request_id` (а также заголовок `x-request-id`) — используйте его для корреляции логов.

## Auth

- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

### Notes

- Механизм сессии/куки и CORS зависят от переменных окружения (см. `.env.example`).

## Projects

- `GET /projects`
- `POST /projects`
- `POST /projects/:id/select`

## Jobs

- `POST /jobs/chatwoot/sync`
- `POST /jobs/embeddings/run`
- `GET /jobs/status`

## Search

- `POST /search`

## Data review

- `GET /contacts`
- `GET /conversations`
- `GET /messages`

## Ошибки и диагностика

- Если клиент получает 401/403: проверьте `AUTH_*` переменные и домен/куки настройки.
- Если UI не видит API: проверьте `NEXT_PUBLIC_API_BASE_URL` и CORS (`CORS_ORIGIN`).
