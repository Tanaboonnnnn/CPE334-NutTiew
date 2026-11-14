# NutTiew — Deployment Automation Preparation (Lab 5 / GH-05)

> **Status: OFFLINE PREPARATION ONLY.** This is a draft runbook + offline evidence
> for the GitHub-side deployment automation. **No live Cloud Run revision, no
> persistent Cloud SQL database, no automatic release exists** until it is
> actually demonstrated in a separately authorized GCP session (marked `PENDING`
> below). Nothing in this file claims a successful real deployment.

**Verification status legend used throughout:** `IMPLEMENTED` = the code/script is
written; `TESTED OFFLINE` = verified by the offline suite; `REQUIRES LIVE GCP
CONFIGURATION` = needs IAM/WIF/Cloud SQL/etc. set up in a separate session;
`PENDING` = gated/not yet demonstrated; `NOT IMPLEMENTED` = explicitly not built.
No feature here is claimed as a live cloud deployment or live readiness.

- **Repository:** [Tanaboonnnnn/CPE334-NutTiew](https://github.com/Tanaboonnnnn/CPE334-NutTiew)
- **Issue:** [GH-05 — Deployment Automation Preparation (#68)](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/68)
- **Branch:** `chore/68-deployment-prep` (from `origin/sprint1`)
- **Lab 5 traceability:** Handout §4.1 (R-02, R-07, R-08, R-09), §4.3, §5; Student Guide Episodes 4–7. Live checks C-04/C-05/C-06 are **PENDING**, not demonstrated here.

---

## A. System architecture

```
 Browser
   │  HTTPS (single origin)
   ▼
 Cloud Run  (one service; serves BOTH the built React UI and the Express API)
   │        - NODE_ENV=production (cookies are Secure)
   │        - AUTH_CANONICAL_ORIGIN = exact public https origin
   │        - listens on 0.0.0.0:PORT
   │        - connects via Cloud SQL connector / proxy to Cloud SQL
   ▼
 Cloud SQL for PostgreSQL  (nuttiew)
   │  two roles:
   │    nuttiew_owner   -> migrations / admin (DATABASE_URL)
   │    nuttiew_runtime -> non-owner runtime  (DATABASE_URL_APP)
```

Supporting infrastructure used by a real deployment (all `PENDING`):

- **Artifact Registry** — stores the runtime and migration Docker images, tagged
  with the **full Git commit SHA** and immutable digest.
- **Cloud Run migration job** — an isolated one-shot job that runs
  `compose/init-db.mjs` (migrations + runtime grants) with the migration/admin
  credential **before** the runtime is deployed. The application is **never** put
  into a startup-migration path with the privileged credential.
- **Secret Manager** — holds the runtime `DATABASE_URL_APP`, the HMAC keys, and
  (separately) the migration `DATABASE_URL` needed only by the migration job.
- **GitHub Actions CD** — `.github/workflows/deploy.yml` runs only on an approved
  `main` release, behind a fail-closed `DEPLOY_ENABLED` gate, and authenticates
  via OIDC / Workload Identity Federation (no committed service-account key).

### Why migration and runtime credentials are separate

The API (`apps/api/src/config.ts::createPool`) **refuses** to start unless it is
given `DATABASE_URL_APP` and rejects it if it equals `DATABASE_URL`. The
migration/admin role `nuttiew_owner` owns the schema so `prisma migrate deploy`
and grants can run; the runtime role `nuttiew_runtime` receives only the narrowest
table/column rights the API actually uses (see §E). Keeping them separate means a
compromised runtime container can never apply schema changes or read the admin
password.

---

## B. Adaptation from the Lab 5 Starter Kit (TokTickIT)

The Starter Kit used by the course is a **TokTickIT** example. NutTiew is a
different application; we **adapt concepts, not code**. The actual instructor
zip was not present in this workspace, so every "difference" below is grounded in
the *real* NutTiew source that was inspected, not in the kit files (which were
not accessible to GH-05).

| Concern | TokTickIT (kit, not inspected) | NutTiew (inspected, source-grounded) | Consequence |
|---|---|---|---|
| Project/org structure | `apps/...` demo service | `apps/api` + `apps/web` npm workspaces, Node 24, npm | Build both workspaces; single-origin UI+API |
| Port | varies | `PORT` (default `3001`), binds `0.0.0.0` (`server.ts`) | Cloud Run `--port=3001` |
| Health/readiness | `/api/health`-style | **No** `/api/health`, **no** `/api/categories`. DB readiness = `GET /api/ready` → `200 {"status":"ready"}` else `503` (`app.ts`) | `smoke_test.py` targets `/` and `/api/ready` only |
| DB roles | single admin | `nuttiew_owner` + `nuttiew_runtime` two-role model | Keep the two credentials; never give runtime the admin URL |
| Migration | in startup | separate isolated Cloud Run migration job running `compose/init-db.mjs` (owner) | Migration never runs as part of runtime startup |
| Runtime image | contains full toolchain | `runtime` stage runs `npm prune --omit=dev` → **no Prisma CLI** in runtime | Migrations must run in the `migrate` image, not runtime |
| Seed | kit seed | `apps/api/prisma/seed.ts` idempotent, runs via `DATABASE_URL_APP` only | Seed is optional, private env, re-runnable, not in first-deploy |
| Auth/CSRF | kit auth | Argon2 + cookie sessions + CSRF + origin validation (`AUTH_CANONICAL_ORIGIN`) | Canonical origin must match the real public HTTPS origin |

---

## C. Environment variable inventory

Sources of truth: `.env.example`, `docker-compose.yml`, `compose/db-init.sh`,
`compose/init-db.mjs`, `apps/api/src/config.ts`, `apps/api/src/server.ts`, and the
deploy scripts.

| Name | Purpose | Required | Secret | Used by | Source of value | Local dev | In GCP (PENDING) |
|---|---|---|---|---|---|---|---|
| `DATABASE_URL` | Migration/admin connection URL | yes | yes | Prisma CLI, migrate job | operator-generated password | `nuttiew_owner` on `127.0.0.1` | Secret Manager, migration job only; **never in runtime container** |
| `DATABASE_URL_APP` | Restricted runtime connection URL | yes | yes | API runtime, seed | operator-generated password | `nuttiew_runtime` on `127.0.0.1` | Secret Manager, mounted to Cloud Run runtime |
| `AUTH_CSRF_HMAC_KEY` | CSRF signing / rate-limit HMAC key (≥32 bytes hex) | yes | yes | API runtime | `openssl rand -hex 32` | `.env` | Secret Manager secret mounted to runtime |
| `AUTH_RATE_KEY` | rate-limit bucket HMAC key (≥32 bytes hex, distinct) | yes | yes | API runtime | `openssl rand -hex 32` | `.env` | Secret Manager secret mounted to runtime |
| `AUTH_CANONICAL_ORIGIN` | Same-origin for cookie/CSRF | yes | no | API runtime | public HTTPS origin | `http://localhost:5173` | exact public Cloud Run https origin; cookies Secure when `NODE_ENV=production` |
| `AUTH_CSRF_KEY_VERSION` | CSRF key version tag | no | no | API runtime | `v1` | `.env` | `v1` |
| `AUTH_CSRF_PREVIOUS_KEY_VERSION` | prior key version during rotation | no | no | API runtime | operator | optional | optional rotation window |
| `AUTH_CSRF_PREVIOUS_HMAC_KEY` | prior HMAC key during rotation | no | yes | API runtime | operator | optional | optional; keep secret |
| `AUTH_TRUSTED_PROXIES` | trusted reverse-proxy IPs for `X-Forwarded-For` | no | no | API runtime | operator | empty | Cloud Run ingress → see §I (set precisely, never broad) |
| `NODE_ENV` | runtime mode; `production` forces Secure cookies | yes | no | API runtime | `production` | `development` | `production` |
| `PORT` | API listen port | no (default 3001) | no | API runtime | `3001` | `3001` | Cloud Run `--port=3001` |
| `WEB_DIST` | built React UI dir for single-origin serving | no (image default) | no | API runtime | `/app/apps/web/dist` | unset (Vite dev) | image default |
| `POSTGRES_PASSWORD` | Compose DB superuser (local only) | local only | yes | compose `db` | operator | `.env` | n/a (Cloud SQL manages superuser) |
| `DB_OWNER_PASSWORD` | owner role password (local role DDL) | local only | yes | `db-init.sh` | operator | `.env` | provisioned into Secret Manager / DB at bootstrap |
| `DB_RUNTIME_PASSWORD` | runtime role password (local role DDL) | local only | yes | `db-init.sh` | operator | `.env` | provisioned into Secret Manager / DB at bootstrap |
| `SEED_EMAIL` / `SEED_PASSWORD` / `SEED_ROLE` | idempotent demo-user seed (Lab 6) | no | yes | `seed` profile | private inputs | optional `.env` | optional, private |
| `NUTTIEW_*` | deployment config (`PROJECT_ID`, `REGION`, image names, SA, secrets refs, scaling…) | deploy only | no | deploy scripts / CD | operator placeholders | dry-run placeholders | GitHub repository variables + Environment |

> **No real secret value appears** in this document or in any repository file.

### Deployment feature status (finding F — GH-05 is GitHub-only preparation)

| Feature | Status | Live GCP needed? |
|---|---|---|
| Offline deploy/release/smoke/check-runs/gate tests | **IMPLEMENTED + TESTED OFFLINE** | no |
| `deploy.sh` / `release.sh` guarded real-execution paths | **IMPLEMENTED** (must be verified live) | yes (run `DRY_RUN=0` only in an authorized session) |
| `deploy.yml` fail-closed gate + `DEPLOY_CD_READY` + `demo` Environment + WIF auth | **PREPARED** (not verified against GitHub/GCP) | WIF/IAM + repository variables |
| Cloud SQL instance/Database | **PENDING live configuration** (edition/version/tier subject to availability + Free Trial; explicit approval required) | yes |
| Cloud SQL DB roles + extensions bootstrap | **PREPARED offline**; `NUTTIEW_DB_BOOTSTRAP_DONE=1` is an operator ACKNOWLEDGEMENT, not proof the DB is operational — a read-only readiness preflight also runs before migrations (real mode) | yes |
| Cloud Run migration job (Cloud SQL connection + `DATABASE_URL` only) | **PREPARED offline**; completion is checked on the exact execution started by the release (not a stale one) | yes |
| Immutable `@sha256:` digest deploy (no `latest` fallback) | **IMPLEMENTED + TESTED OFFLINE** | yes (registry must exist) |
| Live readiness / smoke against a public URL | **PENDING** (no live URL exists) | yes |
| Live persistence / rollback / release evidence | **PENDING / NOT IMPLEMENTED** | yes |

No committed feature claims a production-ready deployment: every live GCP step stays
`PENDING` until a separately authorized GCP session verifies it.

---

## D. Local verification commands

Prerequisites: Node 24 (`>=24 <25`), npm 11, git, Docker (engine running), a
reachable PostgreSQL only for DB/integration tests. The following were executed
during GH-05 where safe; results are in the final report (§F/G).

```bash
# 0. Install locked dependencies + Prisma client
npm ci
npm run db:generate

# 2. Unit tests (API + web), typecheck, production build
npm test
npm run typecheck
npm run build

# 3. Database migration (needs a reachable PostgreSQL + .env)
npm run db:migrate
# optional idempotent seed (Lab 6):
#   npm run db:seed

# 4. Docker images (build both runtime and migrate targets)
docker build --target runtime -t nuttiew-gh05:runtime .
docker build --target migrate -t nuttiew-gh05:migrate .

# 5. Docker Compose config validation (offline, synthetic placeholders)
docker compose config --quiet

# 6. Offline deployment tests (no GCP, no DB, no live URL) — GL5
bash deploy/tests/run_all_offline.sh

# 7. Smoke test example against a CONTROLLED local target
python3 deploy/smoke_test.py --base-url http://127.0.0.1:PORT_FOR_LOCAL_INSTANCE
```

> DB integration tests (`npm run test:db`) and browser E2E (`npm run test:e2e`)
> require a live isolated database / Edge and are not re-claimed here unless
> actually run (see report).

---

## E. GCP resource plan (intended names/placeholders — PENDING)

The team's candidate project (non-secret, previously configured) is
`project-a4c95fa2-28c5-4e9a-89d`. The final project/region are **subject to
verification**; the deploy scripts read all of these from environment/GitHub
variables — nothing is hard-coded into executable logic.

| Resource | Intended name / placeholder | Notes |
|---|---|---|
| GCP project | `NUTTIEW_PROJECT_ID` (candidate `project-a4c95fa2-28c5-4e9a-89d`) | deploy scripts require it |
| Region | `NUTTIEW_REGION` (e.g. `asia-southeast1`) | availability @ team verification |
| Artifact Registry repo | `NUTTIEW_ARTIFACT_REPO` | docker format, region-mirrored |
| Runtime image | `NUTTIEW_RUNTIME_IMAGE` | `gcr`/docker AR path; tag = full SHA + digest |
| Migration image | `NUTTIEW_MIGRATE_IMAGE` | same working tree, `migrate` target |
| Cloud SQL instance | `NUTTIEW_SQL_INSTANCE` | PostgreSQL; edition/version/tier must be a valid combination (default `ENTERPRISE`/`POSTGRES_15`/`db-f1-micro`, shared-core — see §J). PENDING live availability |
| Database | `nuttiew` (`NUTTIEW_SQL_DB_NAME`) | owner = `nuttiew_owner` |
| DB owner role | `nuttiew_owner` | owns schema; used by migration job |
| DB runtime role | `nuttiew_runtime` | non-owner, grants per §I |
| Runtime SA | `NUTTIEW_RUNTIME_SA_EMAIL` | least privilege: Cloud SQL client + read its app secret |
| Deploy SA | `NUTTIEW_DEPLOY_SA_EMAIL` | Artifact Registry writer, Cloud Run dev, Cloud SQL client, Secret Manager (deploy-time) |
| Migration SA | `NUTTIEW_MIGRATE_SA_EMAIL` | **dedicated migration identity** (finding #4): Cloud SQL client + read ONLY the migration `DATABASE_URL` secret; no deployment admin / no broad Secret Manager |
| Secrets | `DATABASE_URL`, `DATABASE_URL_APP`, `AUTH_CSRF_HMAC_KEY`, `AUTH_RATE_KEY` | Secret Manager; only refs in runtime |
| Migration job | `NUTTIEW_MIGRATE_JOB` (default `<service>-migrate`) | isolated Cloud Run job |
| Cloud Run service | `NUTTIEW_CLOUD_RUN_SERVICE` (e.g. `nuttiew`) | single origin UI+API |
| GitHub Environment | `demo` | protection restricts deploy to `main` |

**Cloud SQL connection method (PENDING).** The application uses `pg` (node-postgres,
`apps/api/package.json` → `"pg"` ≥8) whose `connectionString` supports the
standard `postgresql://` scheme. Two compatible options for Cloud Run:

1. **Cloud SQL connector / Unix socket** — recommended: the node app connects over
   a local Unix socket to the Cloud SQL Proxy/sidecar with instance IAM auth; no
   public IP exposure.
2. **Private IP + authorized connection string** — a `postgresql://user:pw@PRIVATE_IP/db`
   URL. Works with `pg`, but requires VPC/private-net and the runtime SA having
   `roles/cloudsql.client`.

Exact socket host/port and the connection-string form will be finalized and
verified during the GCP phase; until then mark **connection method = PENDING /
unverified**.

---

## F. First deployment (safe operator runbook)

> Everything below is a dry-run/simulation until a **separately authorized**
> session validates configuration and runs a real `DRY_RUN=0` execution. The
> first-deployment runbook is implemented in `deploy/deploy.sh`.

Step 1 — **Preflight** (read-only, no cost):
```bash
bash -n deploy/deploy.sh
DRY_RUN=1 \
  NUTTIEW_PROJECT_ID="..." NUTTIEW_REGION="asia-southeast1" \
  NUTTIEW_ARTIFACT_REPO="..." NUTTIEW_RUNTIME_IMAGE="..." NUTTIEW_MIGRATE_IMAGE="..." \
  NUTTIEW_SQL_INSTANCE="..." NUTTIEW_RUNTIME_SA_EMAIL="..." NUTTIEW_DEPLOY_SA_EMAIL="..." \
  NUTTIEW_CLOUD_RUN_SERVICE="nuttiew" NUTTIEW_ORIGIN="https://..." \
  bash deploy/deploy.sh
```
This prints a redacted, simulated plan and **changes nothing**.

Step 2 — **Create billable infrastructure** (explicit confirmation required; the
deploy runbook's §5–§8 describe the exact `gcloud` steps): enable APIs, create the
Artifact Registry repo, create the Cloud SQL instance, bootstrap the two roles +
`pgcrypto`/`btree_gist` extensions, create the two service accounts, and references
to the Secret Manager secrets.

Step 3 — **Build + publish** tagged images (full SHA + digest).

Step 4 — **Migration job** before the runtime is live: create + run the isolated
Cloud Run job; inspect status; abort if it fails.

Step 5 — **Deploy Cloud Run** with the restricted credential.

Step 6 — **Resolve real URL + final origin**, then reconfigure `AUTH_CANONICAL_ORIGIN`
to the actual public HTTPS origin so cookies/CSRF validate.

Step 7 — **Read-only smoke** (`deploy/smoke_test.py --base-url …`).

Step 8 — **Record** SHA, digest, revision, URL into the evidence doc.

> Cost/billing resources (Cloud SQL instance, Artifact Registry storage) are
> created only by explicit operator action in a separately authorized session.

---

## G. Repeatable release

The agreed release procedure (matches the review workflow in `AGENTS.md`):

```
Issue → chore/<issue> branch from origin/sprint1 → PR into sprint1
      → teammate approval + required CI (Unit/types/build, PG18/Auth/Slot/Race A,
        Edge/Auth/Tutor UI E2E) → merge
      → reviewed sprint1 → main Release PR → merge
      → CD workflow (deploy.yml) fires on the new main SHA with DEPLOY_ENABLED=true
      → 1) fail-closed gate (DEPLOY_ENABLED + ref must be main)
      → 2) verify the exact release SHA's required GitHub Actions Check Runs are
           green (via deploy/tests/verify_check_runs.sh; Check Runs API, not the
           legacy commit status API) and that the SHA is reachable from main
      → 3) a SINGLE `release` job under the `demo` Environment: a fail-closed
           DEPLOY_CD_READY/WIF enablement check, then it calls deploy/release.sh
           ONCE (migration job → Cloud Run → read-only smoke). The exact same
           release never runs its migration twice.
```

`deploy/release.sh` is executed in real mode (DRY_RUN=0, NUTTIEW_ALLOW_REAL=1)
inside that single job. It pins an **exact full commit SHA**, requires the
checkout HEAD to BE that SHA, verifies the active gcloud project matches the
configured project, and refuses to deploy the runtime unless the Cloud Run
migration job it started completes successfully AND the read-only smoke test's
real exit code is zero. If WIF/IAM or other GCP prerequisites are not configured,
the release job fails closed with a clear error (it never reports a false
successful deployment). The release SHA and immutable image digest are recorded
alongside the deployed revision and public URL.

---

## H. Rollback and recovery

- **Application-image rollback:** point the Cloud Run service back at a previously
  built image (pinned digest) — `gcloud run services update … --image …`. This does
  **not** reverse any database change.
- **Failed migration:** the CD workflow hard-stops before deploying the runtime.
  Diagnosis: inspect the Cloud Run migration job's execution logs; `prisma migrate deploy`
  is forward-only; do **not** attempt a destructive `prisma migrate reset` on live data.
- **Disabled / no automated rollback.** GH-05 implements a fail-closed gate, not an
  automated roll-back. Documented manual/roll-forward recovery only.

---

## I. Security

- **Least-privilege DB roles:** `nuttiew_runtime` has `SELECT, INSERT, UPDATE, DELETE`
  on `User`/`Session`/`AuthAttemptBucket`/`AuthAttemptReservation`; `SELECT, INSERT`
  on `Slot`/`Booking`; plus a **column-level** `UPDATE ("id")` on `Slot` solely so
  `SELECT … FOR UPDATE` row locks work. No broad `UPDATE`/`DELETE`/`TRUNCATE` on
  `Slot`/`Booking`; no trigger/constraint bypass (`compose/init-db.mjs`).
- **Secret Manager:** secrets are never echoed; the runtime only reads its own
  restricted secret; the migration/admin URL is never mounted into the runtime.
- **Workload Identity Federation / OIDC:** future GitHub auth must be scoped with
  exact Workload Identity Federation conditions so credentials can only be
  requested for this release. Planned conditions (all required, none omitted):
  - repository identity: `repos/Tanaboonnnnn/CPE334-NutTiew`
    (`attribute.repository` exact), plus the persistent owner/repo numeric
    identifiers where supported (`attribute.repository_owner_id` /
    `attribute.repository_id` are immutable and survive renames),
  - protected ref: `ref == 'refs/heads/main'` (`attribute.ref`),
  - exact workflow: `attribute.workflow == 'deploy.yml'`,
  - GitHub Environment: conditions on the `demo` deployment environment,
  - least-privilege service account: the deploy SA (`NUTTIEW_DEPLOY_SA_EMAIL`)
    with only the roles documented in this file.
  **No service-account JSON key is ever committed.**
- **Cookie/CSRF origin:** `NODE_ENV=production` marks cookies `Secure`; the exact
  public HTTPS `AUTH_CANONICAL_ORIGIN` must be set or cookies/CSRF break.
- **Origin policy (finding #3):** a REAL deployment requires an exact `https://`
  origin with a real hostname; the deploy scripts reject HTTP, embedded
  credentials, paths, query strings, fragments and placeholder domains (e.g.
  `.example.*`, `.test`, `localhost`, `.a.run.app`) in real mode. HTTP is only
  allowed as a local DRY-RUN preview.
- **Docker registry auth (finding #2):** images are pushed only after
  `gcloud auth configure-docker <region>-docker.pkg.dev` succeeds on the real path;
  there is no anonymous or insecure registry fallback.
- **Migration identity (finding #4):** `NUTTIEW_MIGRATE_SA_EMAIL` is a dedicated
  least-privilege SA for the Cloud Run migration job (Cloud SQL client + read only
  the `DATABASE_URL` secret); it never receives deployment administration or broad
  Secret Manager access. (Future IAM bindings are PENDING until GCP configuration.)
- **GitHub Environment protection + branch protection** on `main` (Ruleset
  #27154099) gate the real deploy.

---

## J. Cost controls

Follows the instructor's low-cost guidance; the team has a GCP Free Trial and a
configured Budget Alert (background only):

- Cloud Run **min instances = 0**, **max ≤ 3**, modest concurrency and instance
  size (deploy scripts default `MIN=0`, `MAX=3`, `CONCURRENCY=80`).
- Cloud SQL: a small fixed tier with an explicit, valid edition/version/tier
  combination (default `ENTERPRISE` / `POSTGRES_15` / `db-f1-micro`, shared-core).
  **No assumed zero cost** — Cloud SQL bills for instance uptime + storage + backup
  regardless of usage; region availability and Free Trial limits apply per Region.
  Storage and automated-backup choices (default off here to keep cost low) affect
  the bill; an explicit `db-f1-micro` (shared-core) is offered under ENTERPRISE,
  NOT Enterprise Plus (which requires at least standard tier). **Explicit operator
  approval is required before any Cloud SQL provisioning** — this stays PENDING.
- No automatically destructive teardown. Paid resources are created only by an
  explicit, confirmed operator action; ongoing Cloud SQL charges are a tracked
  risk. The service must remain available through the grading window — **do not
  propose deleting required resources before grading ends.**

---

## K. Lab 5 evidence status + traceability

See also [quality-gate-evidence.md](./quality-gate-evidence.md) (GH-04, R-05/R-06
/C-01/C-02).

| Lab label | Item | Status (GH-05) |
|---|---|---|
| R-02 | CI/required checks on supported envs | **Offline/implemented** (existing CI + GH-03 Docker verification preserved) |
| R-07 | Production build & unit tests on deploy path | **Prepared + verified offline** (npm test/typecheck/build) |
| R-08 | Dockerized runtime image | **Prepared + verified** locally (build targets) |
| R-09 | Deployment configuration & **deploy workflow** | **Prepared offline**; `deploy.sh`/`release.sh`/`deploy.yml` ready |
| C-04 | Live Cloud Run deployment | **PENDING** — no live GCP verification |
| C-05 | Live persistent Cloud SQL / migration on cloud | **PENDING** — not demonstrated |
| C-06 | Automatic release + smoke on live URL | **PENDING** — offline smoke only; no public URL exists |

> **Nothing in this doc claims a live Cloud Run revision, persistent Cloud SQL,
> public URL, or automatic release until actually verified.** All such claims are
> marked PENDING.
