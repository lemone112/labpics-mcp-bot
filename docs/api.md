# API reference (MVP)

Base URL:

- browser/UI: `NEXT_PUBLIC_API_BASE_URL` (default `/api`)
- direct backend: `http://localhost:8080`

Every response includes `request_id` in the body and `x-request-id` in headers.

## Access model

Public routes:

- `GET /health`
- `GET /metrics`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /auth/signup/status`

All other routes require a valid session cookie.

## MVP endpoints (implemented)

### Auth

- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /auth/signup/status`

### Projects

- `GET /projects`
- `POST /projects`
- `POST /projects/:id/select`

### Jobs

- `POST /jobs/chatwoot/sync`
- `POST /jobs/embeddings/run`
- `GET /jobs/scheduler`
- `POST /jobs/scheduler/tick`
- `GET /jobs/status`

### Search

- `POST /search`

### Data review

- `GET /contacts`
- `GET /conversations`
- `GET /messages`

## Planned / roadmap endpoints

These are intentionally not treated as MVP contracts. Keep them behind feature flags or in separate modules until implemented:

- audit/evidence APIs (`/audit`, `/evidence/*`)
- outbound/approval APIs (`/outbound/*`)
- Control Tower, identity linking, CRM, signals/NBA, digests, analytics

If you implement one of these, add it to the MVP section and update the relevant spec.
