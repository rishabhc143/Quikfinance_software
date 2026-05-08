#!/usr/bin/env bash
# Vercel build script.
#
# Vercel deploys run this script (because package.json defines
# `vercel-build`). It applies any pending Prisma migrations against
# the production database BEFORE the Next.js build runs, so the
# generated Prisma client and the runtime DB schema stay in sync.
#
# Without this, prod would silently drift every time a developer
# adds a migration locally — the Prisma client would reference
# columns/tables that don't exist in prod, and every server
# component touching them would crash with "Server Components render"
# (which is exactly what was happening on every Sales sub-page).
#
# DIRECT_URL is required by `prisma migrate deploy`. If the Vercel
# env doesn't define it (Neon often only sets DATABASE_URL by
# default), we fall back to DATABASE_URL — pooled connections work
# for migrations, just slower.

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set; cannot run migrations" >&2
  exit 1
fi

if [ -z "${DIRECT_URL:-}" ]; then
  echo "DIRECT_URL not set, falling back to DATABASE_URL for migrations"
  export DIRECT_URL="$DATABASE_URL"
fi

echo "==> Applying Prisma migrations to production database..."
npx prisma migrate deploy

echo "==> Generating Prisma client..."
npx prisma generate

echo "==> Building Next.js..."
npx next build
