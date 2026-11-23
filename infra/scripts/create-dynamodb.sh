#!/usr/bin/env bash
# Creates every DynamoDB table and index (database lead: Youssef). Safe to run again.
# Each table belongs to ONE service; no service touches another service's tables.
source "$(dirname "$0")/../lib.sh"
step "DynamoDB tables"

make_table() {
  local name="$1"; shift
  if awsl dynamodb describe-table --table-name "$name" >/dev/null 2>&1; then
    ok "$name (already exists)"; return
  fi
  awsl dynamodb create-table --table-name "$name" --billing-mode PAY_PER_REQUEST "$@" >/dev/null
  awsl dynamodb wait table-exists --table-name "$name"
  ok "$name created"
}
gsi() { # gsi <name> <hashAttr> [rangeAttr]
  if [ -n "${3:-}" ]; then
    printf '{"IndexName":"%s","KeySchema":[{"AttributeName":"%s","KeyType":"HASH"},{"AttributeName":"%s","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}' "$1" "$2" "$3"
  else
    printf '{"IndexName":"%s","KeySchema":[{"AttributeName":"%s","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}' "$1" "$2"
  fi
}

# ---------- Roadmap Service (Ziad) ----------
# boardStatus is set only on public (not merged) requests -> a "sparse" index that holds exactly the board cards.
make_table "$PREFIX-features" \
  --attribute-definitions AttributeName=featureId,AttributeType=S AttributeName=boardStatus,AttributeType=S \
    AttributeName=createdAt,AttributeType=S AttributeName=voteCount,AttributeType=N AttributeName=authorId,AttributeType=S \
  --key-schema AttributeName=featureId,KeyType=HASH \
  --global-secondary-indexes "[$(gsi status-created-index boardStatus createdAt),$(gsi status-votes-index boardStatus voteCount),$(gsi author-index authorId createdAt)]"
make_table "$PREFIX-categories" \
  --attribute-definitions AttributeName=categoryId,AttributeType=S \
  --key-schema AttributeName=categoryId,KeyType=HASH

# ---------- Engagement Service (Youssef) ----------
# Key (featureId, userId): the same person can never have two vote rows on one request.
make_table "$PREFIX-votes" \
  --attribute-definitions AttributeName=featureId,AttributeType=S AttributeName=userId,AttributeType=S AttributeName=createdAt,AttributeType=S \
  --key-schema AttributeName=featureId,KeyType=HASH AttributeName=userId,KeyType=RANGE \
  --global-secondary-indexes "[$(gsi user-index userId createdAt)]"
make_table "$PREFIX-comments" \
  --attribute-definitions AttributeName=commentId,AttributeType=S AttributeName=featureId,AttributeType=S AttributeName=createdAt,AttributeType=S \
  --key-schema AttributeName=commentId,KeyType=HASH \
  --global-secondary-indexes "[$(gsi feature-index featureId createdAt)]"
make_table "$PREFIX-engagement-counts" \
  --attribute-definitions AttributeName=featureId,AttributeType=S \
  --key-schema AttributeName=featureId,KeyType=HASH
# Merge links: duplicate -> canonical request (logical merge, nothing is copied)
make_table "$PREFIX-engagement-links" \
  --attribute-definitions AttributeName=featureId,AttributeType=S AttributeName=canonicalId,AttributeType=S \
  --key-schema AttributeName=featureId,KeyType=HASH \
  --global-secondary-indexes "[$(gsi canonical-index canonicalId)]"
make_table "$PREFIX-notifications" \
  --attribute-definitions AttributeName=notificationId,AttributeType=S AttributeName=recipientId,AttributeType=S AttributeName=createdAt,AttributeType=S \
  --key-schema AttributeName=notificationId,KeyType=HASH \
  --global-secondary-indexes "[$(gsi recipient-index recipientId createdAt)]"
# Queue messages already handled (SQS can deliver a message more than once)
make_table "$PREFIX-processed-messages" \
  --attribute-definitions AttributeName=messageId,AttributeType=S \
  --key-schema AttributeName=messageId,KeyType=HASH

# ---------- Administration Service (Joseph) ----------
# Holds user items (userId = uuid) and e-mail lock items (userId = "email#<address>") so an
# e-mail address can only be registered once, even with two sign-ups at the same moment.
make_table "$PREFIX-users" \
  --attribute-definitions AttributeName=userId,AttributeType=S AttributeName=listKey,AttributeType=S AttributeName=createdAt,AttributeType=S \
  --key-schema AttributeName=userId,KeyType=HASH \
  --global-secondary-indexes "[$(gsi list-index listKey createdAt)]"
make_table "$PREFIX-merges" \
  --attribute-definitions AttributeName=mergeId,AttributeType=S AttributeName=listKey,AttributeType=S AttributeName=createdAt,AttributeType=S \
  --key-schema AttributeName=mergeId,KeyType=HASH \
  --global-secondary-indexes "[$(gsi list-index listKey createdAt)]"
make_table "$PREFIX-audit" \
  --attribute-definitions AttributeName=auditId,AttributeType=S AttributeName=listKey,AttributeType=S AttributeName=createdAt,AttributeType=S \
  --key-schema AttributeName=auditId,KeyType=HASH \
  --global-secondary-indexes "[$(gsi list-index listKey createdAt)]"

step "Extra settings"
awsl dynamodb update-time-to-live --table-name "$PREFIX-processed-messages" \
  --time-to-live-specification Enabled=true,AttributeName=expiresAt >/dev/null 2>&1 \
  && ok "TTL on $PREFIX-processed-messages (old message ids expire)" || info "TTL not supported here"
for t in features votes comments users merges audit; do
  awsl dynamodb update-continuous-backups --table-name "$PREFIX-$t" \
    --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true >/dev/null 2>&1 \
    && ok "point-in-time recovery: $PREFIX-$t" || info "point-in-time recovery not supported for $PREFIX-$t"
done

step "Seed the fixed category list"
while IFS='|' read -r id name order; do
  awsl dynamodb put-item --table-name "$PREFIX-categories" --item \
    "{\"categoryId\":{\"S\":\"$id\"},\"name\":{\"S\":\"$name\"},\"sortOrder\":{\"N\":\"$order\"}}" >/dev/null
  ok "category $id"
done <<'CATS'
ui-ux|User interface and design|1
performance|Performance and speed|2
integrations|Integrations|3
mobile|Mobile experience|4
security|Security and privacy|5
reporting|Reports and analytics|6
other|Other|7
CATS
