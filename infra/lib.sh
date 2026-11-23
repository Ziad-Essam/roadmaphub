#!/usr/bin/env bash
# Shared settings for every infra script. Usage at the top of a script:  source "$(dirname "$0")/../lib.sh"
# Works in Git Bash on Windows and in Linux/macOS shells.
export AWS_REGION="${AWS_REGION:-us-east-1}"
export AWS_DEFAULT_REGION="$AWS_REGION"
export AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL:-http://localhost:4566}"
# Floci accepts any keys; these are not secrets.
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
export AWS_PAGER=""
export MSYS_NO_PATHCONV=1          # stop Git Bash turning /aws/... into C:/Program Files/Git/aws/...
export ACCOUNT_ID="000000000000"
export PREFIX="roadhub"

# awsl = aws pointed at Floci (same idea as Lab 8)
awsl() { aws --endpoint-url "$AWS_ENDPOINT_URL" --region "$AWS_REGION" "$@"; }

ok()   { printf '  \033[32mOK\033[0m    %s\n' "$*"; }
info() { printf '  \033[36m...\033[0m   %s\n' "$*"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$*"; }
step() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

# Project root (the folder that contains services/, infra/ ...)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ROOT_DIR
