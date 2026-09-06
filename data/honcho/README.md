# Honcho (self-hosted memory layer)

Deployment settings for Honcho — Plastic Labs' AI-native memory backend for
Hermes Agent. Runs as part of the **root docker-compose stack** (`containet`
network only — **not** exposed via nginx-proxy / no VIRTUAL_HOST). Only Hermes
on this box consumes it, via the api's `127.0.0.1:8000` host port. All
reasoning through `deepseek/deepseek-v4-flash-0731` via OpenRouter; embeddings
via `openai/text-embedding-3-small`.

## Layout

- **Here (`data/honcho/`)** — the committed deployment settings (the *only*
  source of truth):
  - `config.toml` — Honcho providers/models/tiers (mounted read-only at runtime)
  - `Dockerfile`, `.dockerignore` — build (upstream, pinned by revision)
  - `docker/entrypoint.sh`, `database/init.sql` — runtime mount deps
  - runtime data: `pgdata/`, `redis-data/` (gitignored, created by the stack)
- **`~/honcho/`** — the working checkout (upstream source, NOT in this repo).
  The build context for `honcho-api`/`honcho-deriver` in the root compose.
  Symlinks `config.toml` and `Dockerfile` here so there's no drift. `.env` is
  NOT used by the stack (secrets come from the root repo `.env`).
- **`~/honcho-self-hosted/`** — the elkimek config-overlay repo this was based on.

## Services (in root `docker-compose.yaml`)

| service | exposes | notes |
|---|---|---|
| `honcho-api` | `127.0.0.1:8000` (loopback only) | Hermes points here |
| `honcho-deriver` | — | LLM observation extraction |
| `honcho-db` | — | pgvector/postgres, `./data/honcho/pgdata` |
| `honcho-redis` | — | cache, `./data/honcho/redis-data` |

Secrets: `LLM_VLLM_API_KEY` + `LLM_EMBEDDING_API_KEY` go in the repo-root
`.env` (gitignored). `config.toml` is mounted at runtime (not baked) so edits
take effect on container restart — no rebuild needed.

## Bring up / maintain

```bash
cd ~/docker-config
docker compose up -d honcho-redis honcho-db honcho-api honcho-deriver
docker compose logs -f honcho-api honcho-deriver
curl -s http://localhost:8000/health
```

Notes:
- Removing `credsStore` from `~/.docker/config.json` was required for the
  headless `docker compose build` to work (D-Bus autolaunch error otherwise).
- Update: `docker compose pull` then `docker compose up -d --build --force-recreate
  honcho-api honcho-deriver` (build context is `../honcho`; the committed
  Dockerfile is referenced directly, so it does not need symlinking to build).
- Backup: `docker compose exec honcho-db pg_dump -U honcho honcho > backup.sql`
- **DeepSeek V4 Flash is a reasoning model** — Honcho's OpenAI backend handles
  `reasoning_content` explicitly, so it does not pollute stored observations.