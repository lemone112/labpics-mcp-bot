# Labpics Web Platform — documentation (MVP)

This folder is the canonical documentation for **Labpics Web Platform (MVP)**.

## How to read

1. Product loop: [`docs/product/overview.md`](./product/overview.md)
2. Architecture: [`docs/architecture.md`](./architecture.md)
3. Data and retrieval: [`docs/data-model.md`](./data-model.md) → [`docs/rag.md`](./rag.md)
4. Operations: [`docs/deployment.md`](./deployment.md) → [`docs/pipelines.md`](./pipelines.md) → [`docs/runbooks.md`](./runbooks.md)
5. Behavioral requirements (specs): [`docs/specs/README.md`](./specs/README.md)

## Reference

- Glossary (canonical terms): [`docs/glossary.md`](./glossary.md)
- Documentation style rules: [`docs/style-guide.md`](./style-guide.md)
- Scope control: [`docs/mvp-vs-roadmap.md`](./mvp-vs-roadmap.md)

## Quick links

- API: [`docs/api.md`](./api.md)
- Data model: [`docs/data-model.md`](./data-model.md)
- RAG: [`docs/rag.md`](./rag.md)
- Runbooks: [`docs/runbooks.md`](./runbooks.md)
- Bugbot setup: [`docs/bugbot.md`](./bugbot.md)

## Repo structure (high level)

- `server/` — Fastify API + jobs + DB migrations
- `web/` — Next.js UI
- `docker-compose.yml` — local/prod composition (db + server + web)

> Note: older history may reference legacy Cloudflare Workers. For MVP, the web-first architecture described in `docs/architecture.md` is canonical.
