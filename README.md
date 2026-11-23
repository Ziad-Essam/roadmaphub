# RoadmapHub: public product roadmap and feature voting

Team 22 (Lab Group A-3) · Cloud Computing and Cloud Security (26CSCN29H)

Users suggest features, vote (one effective vote per person), comment and follow their requests on a
four-column roadmap (Under Review, Planned, In Progress, Shipped). The product team changes statuses,
merges duplicate requests (undo within 7 days) and suspends or bans accounts.

## Three independent services
| Service | Owner | Port | Folder |
|---|---|---|---|
| Roadmap (S1) | Ziad Essameldin Abdelwahed, 239680 | 3001 | `services/roadmap-service` |
| Engagement (S2) | Youssef Mohamed Salah, 239650 | 3002 | `services/engagement-service` |
| Administration and Triage (S3) | Joseph Maged Aziz, 240028 | 3003 | `services/admin-service` |
| Gateway (load balancer stand-in) | deployment lead | 8080 public, 8081 internal | `gateway/` |

Each service is its own Express app with its own routes, controllers, services, repositories, tables and
logs. They talk to each other only over HTTP (`/internal/*`, service tokens). See `docs/architecture.md`,
`docs/service-boundaries.md` and `docs/internal-api-contract.md`.

## Run it on Floci (Windows: Git Bash)
```bash
npm install                                            # once, at the project root (npm workspaces)
docker compose -f infra/floci/docker-compose.yml up -d # Floci (Docker Desktop must be running)
bash infra/scripts/create-dynamodb.sh                  # tables, indexes, categories
cp infra/.env.example infra/.env                       # then fill RESEND_API_KEY and ADMIN_* (never commit it)
bash infra/scripts/create-secrets.sh                   # JWT keys, internal key, Resend, Turnstile
bash infra/scripts/create-admin.sh                     # first administrator
bash scripts/start-all.sh                              # 3 services + gateway  ->  http://localhost:8080
bash scripts/stop-all.sh                               # stop (Floci data is kept)
```
More replicas for the scaling test: `REPLICAS=3 bash scripts/start-all.sh`.

## Tests
```bash
npm test     # starts every service as its own process; needs Floci (or moto) on localhost:4566
```

## Status
See `docs/implementation-checklist.md` (what is done, tested, simulated or not implemented).
