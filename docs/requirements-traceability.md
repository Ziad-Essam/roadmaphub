# Requirements traceability matrix

Sources: Final Report Components document and university announcement (R), master project prompt (P),
Phase 1 proposal (PP). Status: Not started / In progress / Done (verified) / Not implemented.
"Where" points at the code or document that satisfies the requirement once it exists.

| ID | Requirement | Source | Where it is met | Owner | Status |
|---|---|---|---|---|---|
| R1 | One integrated browser app (HTML/CSS/JS) connected to a real backend, no hard-coded data | R | `frontend/`, gateway, three services | All | Not started |
| R2 | Node.js + Express only | R | `services/*/app.js` | All | In progress |
| R3 | Three services, one owner each, ≥3 related functions each | R, PP | `docs/service-boundaries.md` | All | In progress |
| R4 | Business logic or inter-service communication, not CRUD only | R | status workflow, vote uniqueness, merge saga, internal REST calls | All | Not started |
| R5 | REST methods, validation, correct status codes | R | `docs/api-contract.md`, controllers | All | Not started |
| R6 | Persistent database with create/read/update/delete/query | R | DynamoDB tables (`infra/scripts/create-dynamodb.sh`), repositories | All | Not started |
| R7 | ≥2 roles enforced in the backend | R | visitor/user/admin checks in each service | All | Not started |
| R8 | ≥1 external API doing a real job | R | Resend (status/merge emails), Turnstile (bot check) | Youssef, Joseph | Not started |
| R9 | Authentication on protected functions, ownership checks, no hard-coded secrets | R | admin-service issues RS256 JWT; others verify; Secrets Manager | Joseph + all | Not started |
| R10 | Logging and monitoring evidence incl. a suspicious-activity example | R | CloudWatch Logs groups, metric filters, alarm → SNS | All | Not started |
| R11 | Threat model ≥6 threats mapped to controls | R | `docs/security-threat-model.md` | All | Not started |
| R12 | ≥8 security tests (unauth, wrong role, invalid input, ownership, secret review) | R | `docs/security-test-results.md`, `scripts/run-security-tests.sh` | All | Not started |
| R13 | Deployment on Floci; each student ≥3 AWS services in own component | R | `docs/aws-service-ownership.md`, `infra/` | All | Not started |
| R14 | Public GitHub repo, each member's history, no secrets in history | R | GitHub, `.gitignore`, secret scan | All | Not started |
| R15 | Demo video ≤5 min; live demo | R | `docs/demo-runbook.md` | All | Not started |
| R16 | Report sections 1–16 + individual statements | R | `docs/report/` drafts | All | Not started |
| R17 | Cost statement, recovery approach, limitations | R | `docs/backup-recovery.md`, `docs/limitations.md` | All | Not started |
| P1 | Exactly four public statuses; no Declined; merged is internal | P | roadmap-service status rules | Ziad | Not started |
| P2 | Three independently running Express backends | P | `services/roadmap-service`, `engagement-service`, `admin-service` | All | In progress |
| P3 | Real REST calls between services with service-to-service auth, timeouts, retries, request IDs, idempotency | P | `shared/internal-client.js`, `/internal/*` routes | All | In progress |
| P4 | Duplicate suggestions, merge, redirect, distinct voters, undo within 7 days, recoverable | P, PP | admin-service merge saga + roadmap/engagement internal endpoints | Joseph (+Ziad, Youssef) | Not started |
| P5 | Lab 8 architecture: S3, DynamoDB, EventBridge, SQS+DLQ, SNS, IAM, Secrets Manager, CloudWatch Logs, ELB, ECS, Auto Scaling | P | `infra/scripts/*` | All | Not started |
| P6 | Working SQS consumer with retries, DLQ, idempotent processing | P | engagement notification worker | Youssef | Not started |
| P7 | Gateway: path routing to 3 services; round-robin + failover across replicas | P | `gateway/` | Ziad | In progress |
| P8 | k6 load tests: 1 vs 3 replicas, failure during traffic | P | `k6/` | All | Not started |
| P9 | Interchangeable storage (DynamoDB / Postgres) via STORAGE_DRIVER; Vercel + Neon supplementary | P | repositories | All | Not started (stretch, see plan) |
| PP1 | Turnstile on registration, feature submission, comments | PP | `shared/turnstile.js` | All | Not started |
| PP2 | Suspended/banned users cannot comment, vote or submit, even with a valid JWT | PP, P | status check via admin internal API | Joseph + all | Not started |
