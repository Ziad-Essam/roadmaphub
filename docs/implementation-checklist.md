# Implementation checklist

Legend: ✅ done and tested · 🟡 in progress · ⬜ not started · ⛔ blocked · ⚪ not implemented (see limitations)

| Phase | Item | Status | Evidence |
|---|---|---|---|
| 0 | Read proposal, labs 1–8, report requirements, example project | ✅ | this folder's docs |
| 1 | Architecture, service boundaries, AWS ownership, internal API contract | ✅ | `docs/architecture.md`, `docs/service-boundaries.md`, `docs/internal-api-contract.md` |
| 2 | Monorepo skeleton, workspaces, .gitignore, .env.example | ✅ | `package.json`, `.gitignore`, `.env.example` |
| 3 | Public API contract | 🟡 | `docs/public-api-contract.md` now documents the checkpoint implementation; team must review and validate against Floci |
| 4 | Three independent backends + gateway + HTTP communication test | ✅ | `tests/phase4-communication.test.js` (7 tests) |
| 5 | Register/login, RS256 JWT, status checks, internal auth | ✅ | `tests/phase5-auth.test.js` (8 tests) |
| 6 | DynamoDB tables + repositories | ✅ | `infra/scripts/create-dynamodb.sh`, `services/*/repositories` |
| 7 | Roadmap functions | ✅ | `tests/phase10-workflows.test.js` |
| 8 | Engagement functions + worker | 🟡 | votes/comments/My votes ✅; notification worker in Phase 11 |
| 9 | Admin functions (duplicates, merge, undo, moderation) | ✅ | `tests/phase10-workflows.test.js` |
| 10 | Cross-service workflow tests | ✅ | 13 workflow tests incl. merge rollback when a service is down |
| 11 | EventBridge, SQS, SNS, Secrets, IAM, CloudWatch scripts | ⬜ | |
| 12 | Frontend on S3, ECS/ALB records, replicas | ⬜ | |
| 13 | Security hardening + security tests | ⬜ | |
| 14 | k6 load and failover tests | ⬜ | |
| 15 | Postgres adapters (Neon) | ⬜ | stretch |
| 16 | Vercel deployment | ⬜ | stretch |
| 17–20 | Docs, report drafts, demo plan, final checks | ⬜ | |

## How this was tested
The development sandbox cannot run Docker, so Floci itself cannot run here. AWS calls are tested against
**moto** (a local AWS emulator) on port 4566 with the same AWS CLI commands and SDK code. Everything must be
re-run once on a team PC with real Floci; results from moto are labelled as such.
