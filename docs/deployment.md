# Deployment (MVP)

This branch deploys a Docker Compose stack:

- Postgres (pgvector)
- server (Fastify)
- web (Next.js)

## Local

1. Create env files:

- `cp .env.example .env`

2. Start:

- `docker compose up --build`

3. Smoke check:

- API: `GET http://localhost:8080/health`
- UI: `http://localhost:3000/login`

## Production (VPS)

Recommended approach:

- clone repo to `/opt/labpics`
- create `.env`
- run `docker compose up -d --build`

### Required secrets (example)

- `POSTGRES_PASSWORD`
- `OPENAI_API_KEY`
- `CHATWOOT_API_TOKEN`
- `AUTH_PASSWORD`
- `SESSION_SECRET` (if you later add signing)

## Post-deploy checklist

- `GET /health` returns `{ ok: true }`
- Login works
- Create/select project works
- Run Chatwoot sync → creates `cw_*` and `rag_chunks`
- Run embeddings → moves pending → ready
- Search returns results
