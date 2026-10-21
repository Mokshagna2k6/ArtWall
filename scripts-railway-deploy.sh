#!/usr/bin/env bash
# Create + configure the Railway scheduler. Safe to re-run; stops on first failure.
set -euo pipefail
cd /e/Internship-Work/ArtWall

get() { sed -n "s/^$1=//p" apps/web/.env | head -1 | tr -d '\r'; }
CRON_SECRET=$(get CRON_SECRET)
[ -n "$CRON_SECRET" ] || { echo "CRON_SECRET missing from apps/web/.env"; exit 1; }

echo "== creating project =="
railway init --name artwall-scheduler

echo "== creating service from this repo =="
railway add --service artwall-scheduler

echo "== variables =="
railway variables --set "WEB_APP_URL=https://artwall-production.vercel.app" \
                  --set "CRON_SECRET=$CRON_SECRET" \
                  --set "CRON_TZ=Asia/Kolkata"

echo "== deploying =="
railway up --detach

echo "== done. Check: railway status, then GET /status on the generated domain =="
