#!/usr/bin/env bash
# Creates the first administrator from ADMIN_* in infra/.env (owner: Joseph).
source "$(dirname "$0")/../lib.sh"
step "Admin account"
[ -f "$ROOT_DIR/infra/.env" ] && set -a && . <(sed 's/\r$//' "$ROOT_DIR/infra/.env") && set +a
node "$ROOT_DIR/services/admin-service/scripts/create-admin.js"
