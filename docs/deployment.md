# Deployment (MVP)

This project deploys as a Docker Compose stack:

- Postgres (pgvector)
- `server` (Fastify API + jobs)
- `web` (Next.js UI)

## Environments

- dev: auto-deploy on pushes to `cursor/labpics_dashboard` (if workflows are enabled)
- prod: manual deploy via GitHub Actions environment approvals

## Required secrets/vars

See `README.md` for the full list of environment variables and secrets.

## Health checks

- API: `GET /health`
- UI: `/login`

## Operational guidance

See runbooks: [`docs/runbooks.md`](./runbooks.md)
