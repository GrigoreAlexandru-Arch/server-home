# Honcho (self-hosted memory layer)

Deployment settings for Honcho — Plastic Labs' AI-native memory backend for
Hermes Agent. Runs as its own docker-compose stack on **localhost only**
(only Hermes on this box consumes it). All reasoning through
`deepseek/deepseek-v4-flash-0731` via OpenRouter; embeddings via
`openai/text-embedding-3-small`.

## Layout

- **Here (`data/honcho/`)** — the committed deployment settings (the *only*
  source of truth):
  - `config.toml` — Honcho providers/models/tiers
  - `docker-compose.yml` — api + deriver + postgres + redis
  - `Dockerfile`, `.dockerignore` — build (upstream, pinned by revision below)
  - `docker/entrypoint.sh`, `database/init.sql` — build/mount deps
- **`~/honcho/`** — the working checkout (upstream source + `.env`, NOT in this
  repo). Symlinks its config/compose/Dockerfile here so there's no drift.
  `.env` lives there as a real file (secrets, gitignored).
- **`~/honcho-self-hosted/`** — the elkimek config-overlay repo this was based on.

## Restore / fresh build

```bash
git clone --depth 1 https://github.com/plastic-labs/honcho.git ~/honcho
# symlink the deployment settings back in (targets the newly-cloned paths)
cd ~/honcho
ln -s ~/docker-config/data/honcho/config.toml      ~/honcho/config.toml
ln -s ~/docker-config/data/honcho/docker-compose.yml ~/honcho/docker-compose.yml
ln -s ~/docker-config/data/honcho/Dockerfile       ~/honcho/Dockerfile
ln -s ~/docker-config/data/honcho/.dockerignore    ~/honcho/.dockerignore
ln -s ~/docker-config/data/honcho/docker/entrypoint.sh ~/honcho/docker/entrypoint.sh
ln -s ~/docker-config/data/honcho/database/init.sql ~/honcho/database/init.sql
# .env is NOT symlinked — copy the example and fill in your OpenRouter key
cp .env.template .env
```

## Bring up / maintain

```bash
cd ~/honcho
docker compose up -d --build     # build happens against . (source + symlinked config)
docker compose logs -f api deriver
curl -s http://localhost:8000/openapi.json | head -1
```

Notes:
- Removing `credsStore` from `~/.docker/config.json` was required for the
  headless `docker compose build` to work (D-Bus autolaunch error otherwise).
- Update: `docker compose down && git -C ~/honcho pull && docker compose up -d --build`
  (re-applies because the committed files are symlinked in).
- Backup: `docker compose exec database pg_dump -U honcho honcho > backup.sql`
- **DeepSeek V4 Flash is a reasoning model** — Honcho's OpenAI backend handles
  `reasoning_content` explicitly, so it does not pollute stored observations.