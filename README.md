# Labpics MCP Bot (Telegram + Cloudflare Workers)

This repo contains **two Cloudflare Workers**:

- `tgbot` — Telegram webhook/UI worker (Projects/Dashboard, free text, voice transcription optional).
- `agent-gw` — Agent gateway worker (commitments extraction via LLM, Supabase writeback).

## Architecture

Telegram -> **tgbot** (webhook) -> **Service Binding** -> **agent-gw** -> Supabase (memory/linking/commitments)

## Cloudflare setup

### 1) Deploy workers
Create 2 workers in Cloudflare:

- `tgbot`
- `agent-gw`

Paste code from:
- `tgbot/src/index.js`
- `agent-gw/src/index.js`

### 2) Add Service Binding (IMPORTANT)
In **tgbot** worker settings:

- Bindings -> Add -> Service
  - Name: `AGENT_GW`
  - Service: `agent-gw`
  - Environment: production

### 3) Env vars / secrets

#### tgbot
Vars:
- `ENV=dev`
- `SUPABASE_URL=https://<ref>.supabase.co`
- `TELEGRAM_WEBHOOK_PATH=/telegram/webhook/<random>`

Secrets:
- `TELEGRAM_BOT_TOKEN`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AGENT_GATEWAY_HMAC_SECRET`
- `OPENAI_API_KEY` (optional, for voice transcription)

#### agent-gw
Vars:
- `SUPABASE_URL=https://<ref>.supabase.co`

Secrets:
- `SUPABASE_SERVICE_ROLE_KEY`
- `AGENT_GATEWAY_HMAC_SECRET`
- `OPENAI_API_KEY`

## Supabase
This project expects existing tables:
- `projects`, `telegram_users`, `user_project_state`, `user_input_state`
- `rag_chunks`
- `project_commitments`

Commitments extraction writes into `project_commitments`.

## Notes
- Commitments extraction uses OpenAI JSON mode (`response_format: json_object`).
- Linear issue creation/writeback was prototyped via Composio toolchain in the chat; production wiring can be added to `agent-gw` next.
