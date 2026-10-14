#!/usr/bin/env bash
# Consistent SQLite snapshot of the Vaultwarden database (plus its RSA key)
# into data/vaultwarden/backups/ -- ordinary files that the Duplicati
# "Home Server Configs" job (~16:46) then picks up and ships, encrypted, to
# Google Drive.
#
# Why: Duplicati takes a FILE-LEVEL copy of db.sqlite3 / -wal / -shm.  Reading
# those three in sequence while Vaultwarden is mid-write can yield a torn
# restore.  Python's sqlite3 online-backup API takes a consistent snapshot of a
# live WAL-mode database with no downtime and no sqlite3 CLI (neither the host
# nor the vaultwarden image has one).
#
# Run from cron shortly before the Duplicati job.
set -euo pipefail

REPO=/home/arch/docker-config
SRC="$REPO/data/vaultwarden/db.sqlite3"
KEY="$REPO/data/vaultwarden/rsa_key.pem"
DEST="$REPO/data/vaultwarden/backups"
KEEP_DAYS=7

# Staging dir is outside the backed-up tree, so Duplicati never scans a partial
# file; it sits on the same filesystem, so the final mv is an atomic rename.
STAGE=/home/arch/.cache/db-snapshot
STAMP=$(date +%F)

# Cron has no MTA: failures go to the journal so they are not silently lost.
trap 'logger -t vaultwarden-snapshot -p user.err "FAILED at line $LINENO"' ERR

mkdir -p "$DEST" "$STAGE"

# Consistent online backup of the live DB (WAL-aware), integrity-checked BEFORE
# it is moved into the backed-up tree.
/usr/bin/python3 - "$SRC" "$STAGE/vaultwarden-db-$STAMP.sqlite3" <<'PY'
import sqlite3, sys
src_path, dst_path = sys.argv[1], sys.argv[2]
src = sqlite3.connect(f"file:{src_path}?mode=ro", uri=True)
dst = sqlite3.connect(dst_path)
with dst:
    src.backup(dst)                      # online backup API: consistent, no lock held long
res = dst.execute("PRAGMA integrity_check").fetchone()[0]
if res != "ok":
    sys.stderr.write(f"integrity_check failed: {res}\n")
    sys.exit(1)
dst.close()
src.close()
PY
mv -f "$STAGE/vaultwarden-db-$STAMP.sqlite3" "$DEST/vaultwarden-db-$STAMP.sqlite3"

# The RSA signing key: losing it invalidates every existing session/token (the
# vault data itself still decrypts). Keep it beside the dump so a restore is
# self-contained.
cp -f "$KEY" "$STAGE/rsa_key.pem"
mv -f "$STAGE/rsa_key.pem" "$DEST/rsa_key.pem"

# Retention: keep the last KEEP_DAYS dumps; Duplicati keeps its own versions.
find "$DEST" -maxdepth 1 -type f -name 'vaultwarden-db-*.sqlite3' -mtime +"$KEEP_DAYS" -delete

logger -t vaultwarden-snapshot "snapshot written to $DEST ($STAMP)"
