# Labpics Web Platform — docs index (MVP)

This directory is the canonical documentation for **Labpics Web Platform (MVP)**.

## Quick links

- Product
  - [Product overview](./product/overview.md)
  - [Architecture decisions (MVP)](./product/decisions.md)
- Architecture
  - [System architecture (Web-first)](./architecture.md)
  - [API reference (MVP)](./api.md)
- Data
  - [Data model & tables](./data-model.md)
  - [RAG & embeddings](./rag.md)
- Operations
  - [Pipelines & jobs](./pipelines.md)
  - [Deployment](./deployment.md)
  - [Runbooks](./runbooks.md)

## Repo structure (high level)

- `server/` — Fastify API + jobs + DB migrations
- `web/` — Next.js UI
- `docker-compose.yml` — local/prod composition (db + server + web)

> Legacy Cloudflare Workers are referenced in older history, but **this branch is Web-first**.
