# Team baseline: import, verify, synchronize, then split ownership

## Verified GitHub state before import (23 November 2026)

Repository: `https://github.com/Ziad-Essam/roadmaphub` (public), default branch `main`.
Branches already created: `main`, `Ziad-Essam`, `Youssef-Salah`, `Joseph-Maged`. All four pointed to initial SHA `2e78051ac452c67b1fc8de6777fe8ab8ef19fb7c`; main contained only a small README. Collaborator permissions were not verified.

## Owner: create baseline on `main` exactly once

1. On Windows, extract **this ZIP** to a temporary location. It contains the checkpoint project plus additional contract/onboarding docs; it has no git history and should not be committed as a zip.
2. Clone the existing empty repo into a fresh folder (do not run `git init` again):
   ```bash
   git clone https://github.com/Ziad-Essam/roadmaphub.git
   cd roadmaphub
   git switch main
   ```
3. Copy the **contents** of the extracted folder (including hidden `.gitignore`, `.env.example`, `.github`) into the cloned repository root. Overwrite the tiny default README. Do **not** replace the clone's `.git` folder or copy nested folder levels. Do not copy personal secrets.
4. Before committing:
   ```bash
   git status --short
   git diff --check
   git add .
   git diff --cached --check
   git diff --cached --name-only
   ```
   Confirm you see folders `gateway`, `shared`, `services`, `infra`, `docs`, `tests`, and root `package.json`, and no `.env` or credentials.
5. Commit only after the team agrees this is the intended starting snapshot:
   ```bash
   git commit -m "chore: establish shared RoadmapHub baseline and API contracts"
   git push origin main
   ```
6. Protect `main` in GitHub settings using PR reviews/no force-push where permitted, after initial upload. Confirm both collaborators have Write access in Settings → Collaborators.

## Then EACH collaborator updates their own existing branch

Do **not** delete/recreate branches. Each student runs their own commands on their PC. For Youssef:
```bash
git clone https://github.com/Ziad-Essam/roadmaphub.git
cd roadmaphub
git fetch origin
git switch Youssef-Salah
git merge --ff-only origin/main
git push -u origin Youssef-Salah
```

Joseph substitutes `Joseph-Maged`; Ziad substitutes `Ziad-Essam`. This fast-forward works if their branches are still at the initial commit with no divergent work. If another student has started committing, do not reset or force push; resolve integration via PR.

## Files everyone must read BEFORE implementation

1. `docs/architecture.md` — architecture and Floci limitations.
2. `docs/service-boundaries.md` — functions, ownership and AWS allocation.
3. `docs/public-api-contract.md` — public URL paths, payloads and response conventions.
4. `docs/internal-api-contract.md` — inter-service paths, scopes, tokens, timeouts and merge orchestration.
5. `docs/requirements-traceability.md` and `docs/implementation-checklist.md` — university obligations and unfinished features.

## Team-wide contract freeze

No one may independently rename API endpoints, change response JSON shapes, feature status values, roles, request IDs, JWT format, service token format or table ownership. Proposed contract changes require a PR updating documentation, client/server code, and tests and explicit confirmation from affected teammates.

- Public gateway: `localhost:8080`; internal gateway: `127.0.0.1:8081`.
- S1: `localhost:3001`, S2: `localhost:3002`, S3: `localhost:3003`.
- User JWT: `Authorization: Bearer <RS256 JWT>`; internal JWT: `X-Service-Token: <HS256 JWT>` and required scopes.
- Case-sensitive status values: `under_review`, `planned`, `in_progress`, `shipped`.
- IDs: UUID; feature payload uses `featureId`; errors use `error.code`/`error.message`, request correlation uses `X-Request-Id` header.
- Each service writes only its owned DynamoDB tables; references across domains are resolved with internal HTTP APIs.
- Floci/DynamoDB is the primary assessed environment. Neon/Postgres and Vercel are separate supplementary deployments.

## First shared smoke test on the team's Windows PC

1. Install dependencies at repository root: `npm install` (Node >=20).
2. Start Docker Desktop. Run `docker compose -f infra/floci/docker-compose.yml up -d`.
3. Create tables: `bash infra/scripts/create-dynamodb.sh`. Confirm Floci responds on port 4566.
4. Copy `infra/.env.example` to `infra/.env`. Enter a real test admin email and a strong secret admin password locally. **IMPORTANT:** values containing spaces/angle brackets in this sourced Bash file must be shell-quoted; verify the example before running the script. Never commit it.
5. Generate/store secrets: `bash infra/scripts/create-secrets.sh`. Create admin: `bash infra/scripts/create-admin.sh`.
6. Run `bash scripts/start-all.sh`, then `curl -i http://localhost:8080/api/health` and `curl -i http://localhost:8080/api/categories`.
7. Run `npm test` and inspect failures. This project was originally tested with a different local emulator; do not mark Floci PASS until tests are rerun on your Floci instance.
8. Stop processes with `bash scripts/stop-all.sh`. Keep Floci data volume unless deliberately resetting.

**Known checkpoint gaps:** No browser frontend; no `docs/api-contract.md` before the document now added; EventBridge/SQS/SNS/CloudWatch/IAM/ECS/ALB full provisioning scripts still missing; no notification consumer; no Postgres adapters or Vercel deployment; incomplete security evidence and k6. Fix actual Floci compatibility and run tests before assigning feature work as finished.

## Distribution and PR process

- Owner commits common baseline to `main` once.
- Each member fast-forwards their own branch from `origin/main` once.
- Then each develops and commits their **own** service UI, backend, AWS resources, data logic, tests, evidence, and documentation.
- Members do not edit another service's internal implementation without discussing it. Shared contract changes require affected members to approve.
- PR checklist: relevant endpoint works; invalid input covered; authorization and ownership checked; inter-service calls tested; no secrets; Floci AWS action demonstrably works; docs and tests updated.
- Use meaningful commits, e.g. `feat(roadmap): add filtered roadmap board` rather than `updates`.

## Scope and academic integrity

This baseline contains shared and partially implemented code prepared before individual work. It is not evidence that any given student personally authored it. Each student must genuinely implement, review, test and defend their own contributions; Git history and individual statements must be truthful. The final compulsory live discussion assesses that understanding.
