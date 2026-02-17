# Спека 0017 — Auth v1: логин/пароль, сессии, безопасная авторизация (IMPLEMENTED)

Статус: **implemented**

Дата: 2026-02-17

## Факты функционала

- `POST /auth/login`: вход по логину/паролю
- `POST /auth/logout`: выход
- `GET /auth/me`: текущая сессия
- cookie sessions (`HttpOnly`, `SameSite=Lax`, `Secure` в prod)
- CSRF защита для mutating запросов
- rate limiting на login
- anti-enumeration (одинаковое сообщение при ошибке логина)

## Acceptance criteria

- Сессия создаётся/ротируется на логине и используется на защищённых эндпойнтах.
- Logout инвалидирует сессию.
- CSRF token требуется для защищённых POST/PUT/PATCH/DELETE.
