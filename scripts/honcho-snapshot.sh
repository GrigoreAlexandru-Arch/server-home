#!/usr/bin/env bash
# Snapshot the Honcho Postgres database and Redis RDB into arch-owned files
# under data/honcho/backups/, which Duplicati then picks up as ordinary files.
#
# Why: a file-level copy of a live PGDATA is not restorable (torn pages, no
# consistency), and the Redis RDB can be caught mid-rewrite. These consistent
# snapshots are the part that actually restores. pgdata/ and redis-data/ are
# excluded from the Duplicati job for the same reason.
#
# Run from cron shortly before the Duplicati job.
set -euo pipefail

REPO=/home/arch/docker-config
DEST="$REPO/data/honcho/backups"
PG_CONTAINER=honcho-db
REDIS_CONTAINER=honcho-redis
KEEP_DAYS=7

# Staging dir is outside the backed-up tree, so Duplicati never sees a partial
# file; it is on the same filesystem, so the final mv is an atomic rename.
STAGE=/home/arch/.cache/db-snapshot
STAMP=$(date +%F)

# Cron has no MTA: failures go to the journal so they are not silently lost.
trap 'logger -t honcho-snapshot -p user.err "FAILED at line $LINENO"' ERR

mkdir -p "$DEST" "$STAGE"

# Postgres: logical dump, restorable into any pgvector/pg15 instance.
docker exec "$PG_CONTAINER" pg_dump -U honcho -d honcho -Fc \
    > "$STAGE/honcho-db-$STAMP.dump"
mv -f "$STAGE/honcho-db-$STAMP.dump" "$DEST/honcho-db-$STAMP.dump"

# Redis: force a fresh snapshot, wait for it to report ok, then copy it out.
docker exec "$REDIS_CONTAINER" redis-cli BGSAVE >/dev/null
status=""
for _ in $(seq 1 30); do
    status=$(docker exec "$REDIS_CONTAINER" redis-cli info persistence | tr -d '\r')
    if [[ "$status" == *"rdb_bgsave_in_progress:0"* && \
          "$status" == *"rdb_last_bgsave_status:ok"* ]]; then
        break
    fi
    sleep 1
done
if [[ "$status" != *"rdb_last_bgsave_status:ok"* ]]; then
    echo "honcho-snapshot: redis BGSAVE did not report ok" >&2
    exit 1
fi
docker exec "$REDIS_CONTAINER" cat /data/dump.rdb > "$STAGE/honcho-redis-$STAMP.rdb"
mv -f "$STAGE/honcho-redis-$STAMP.rdb" "$DEST/honcho-redis-$STAMP.rdb"

# Retention: keep the last KEEP_DAYS dumps; Duplicati keeps its own versions.
find "$DEST" -maxdepth 1 -type f -name 'honcho-*' -mtime +"$KEEP_DAYS" -delete

logger -t honcho-snapshot "snapshots written to $DEST ($STAMP)"
