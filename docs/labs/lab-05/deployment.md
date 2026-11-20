# NutTiew — Lab 5 Deployment Runbook and Verified Production Evidence

> **Current status (20 November 2026): LIVE PRODUCTION VERIFIED.**
> The accepted Sprint 1 application has been released from protected `main`,
> served by Cloud Run, and checked through its real UI/API and persistent Cloud SQL.
> The last inspected serving revision is `nuttiew-00007-69p` (100% traffic),
> created by a **no-change Cloud Run Console redeploy** on 19 November 2026.
> That Console action did **not** build a new Git commit or run the GitHub CD
> pipeline again. The deployed source lineage remains the previously verified
> `main@ff55ac766ca792f0cc3ae29adad39d71ea4bca11` release.

This document began as the **GH-05 offline-preparation runbook**. Sections B–J
retain the original preparation choices and safe operator commands for
repeatability; historical `PENDING`/planned notes in those sections refer to
the **pre-deployment GH-05 phase**, not the current production status.
**Section K is the source of truth for live verification and any remaining
limitations.** `IMPLEMENTED` refers to code present, `TESTED OFFLINE` to
locally verified scripts, and `VERIFIED LIVE` only to observed GCP, GitHub
Actions or public-application evidence. Uninspected IAM/provider details
remain explicitly unverified.

- **Repository:** [Tanaboonnnnn/CPE334-NutTiew](https://github.com/Tanaboonnnnn/CPE334-NutTiew)
- **Issue:** [GH-05 — Deployment Automation Preparation (#68)](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/68)
- **Preparation branch (historical):** `chore/68-deployment-prep` (from `origin/sprint1`)
- **Verified release:** [PR #99](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/99) → [CD run #44455509285](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/44455509285), `main@ff55ac766ca792f0cc3ae29adad39d71ea4bca11`
- **Live URL:** https://nuttiew-nxe2keefba-as.a.run.app/
- **Lab 5 traceability:** Handout R-01–R-12 and C-01–C-06; [C-04 live workflow](c04-production-evidence.md), [C-05 persistence](c05-persistence-evidence.md), and the live CD link above.

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

Supporting infrastructure **now used by the verified Production release**
(historically planned during GH-05):

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

| Name | Purpose | Required | Secret | Used by | Source of value | Local dev | GCP Production configuration |
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

### Deployment feature status (original GH-05 scope; updated after live release)

| Feature | Status | Live GCP needed? |
|---|---|---|
| Offline deploy/release/smoke/check-runs/gate tests | **IMPLEMENTED + TESTED OFFLINE**, plus passing PR CI | no |
| `deploy.sh` / `release.sh` guarded real-execution paths | **VERIFIED LIVE** for the successful main release/CD path; retain explicit operator review of paid-resource operations | yes |
| `deploy.yml` fail-closed gate + `DEPLOY_CD_READY` + `demo` Environment + WIF auth | **VERIFIED LIVE EXECUTION** via successful [CD #44455509285](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/44455509285); exact WIF provider IAM conditions not independently audited | yes |
| Cloud SQL instance/Database | **VERIFIED LIVE**: `nuttiew-pg` reported `RUNNABLE`, live booking retrieved after two new Cloud Run revisions | yes |
| Cloud SQL DB roles + extensions bootstrap | Runtime successfully reads its data; the original live migration job completed; **individual role grants/extension lists not re-audited** during C-05 | yes |
| Cloud Run migration job | **VERIFIED LIVE** in successful release run; no migration was rerun during C-05 | yes |
| Immutable `@sha256:` digest deployment | **VERIFIED LIVE** for approved release digest `sha256:ac1c9b0e…996e`; image digests for the later no-change Console revisions were not independently recorded | yes |
| Live readiness / smoke against public URL | **VERIFIED LIVE**: `/` HTTP 200, `/api/ready` HTTP 200 (`{"status":"ready"}`) | yes |
| Persistent booking across application replacement and redeploy | **VERIFIED LIVE**: same confirmed Booking ID before/after `00006-sen` → `00006-lkt` → `00007-69p`; no forced in-place restart | yes |
| Rollback | **NOT TESTED LIVE** (optional guidance, not a separate Lab 5 requirement) | yes |

The original GH-05 version of this table described **planned** infrastructure.
The evidence-based current status and precise limits are in §K.

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

## E. GCP resources — current verified values and remaining configuration placeholders

The live GCP Project ID is `project-a4c95fa2-28c5-4e9a-89d`, region
`asia-southeast1`, service `nuttiew`, Cloud SQL instance `nuttiew-pg`.
The deployment scripts continue to read values from environment/GitHub variables.
**Items not independently inspected in the final C-05 session remain
configuration references**, not claims that every provider binding was audited.

| Resource | Intended name / placeholder | Notes |
|---|---|---|
| GCP project | `project-a4c95fa2-28c5-4e9a-89d` (via `NUTTIEW_PROJECT_ID`) | live project |
| Region | `asia-southeast1` (via `NUTTIEW_REGION`) | live Cloud Run and Cloud SQL region |
| Artifact Registry repo | `NUTTIEW_ARTIFACT_REPO` | docker format, region-mirrored |
| Runtime image | `NUTTIEW_RUNTIME_IMAGE` | `gcr`/docker AR path; tag = full SHA + digest |
| Migration image | `NUTTIEW_MIGRATE_IMAGE` | same working tree, `migrate` target |
| Cloud SQL instance | `nuttiew-pg` (`NUTTIEW_SQL_INSTANCE`) | observed `RUNNABLE`; exact tier and edition not re-checked in this evidence session |
| Database | `nuttiew` (`NUTTIEW_SQL_DB_NAME`) | owner = `nuttiew_owner` |
| DB owner role | `nuttiew_owner` | owns schema; used by migration job |
| DB runtime role | `nuttiew_runtime` | non-owner, grants per §I |
| Runtime SA | `NUTTIEW_RUNTIME_SA_EMAIL` | least privilege: Cloud SQL client + read its app secret |
| Deploy SA | `NUTTIEW_DEPLOY_SA_EMAIL` | Artifact Registry writer, Cloud Run dev, Cloud SQL client, Secret Manager (deploy-time) |
| Migration SA | `NUTTIEW_MIGRATE_SA_EMAIL` | **dedicated migration identity** (finding #4): Cloud SQL client + read ONLY the migration `DATABASE_URL` secret; no deployment admin / no broad Secret Manager |
| Secrets | `DATABASE_URL`, `DATABASE_URL_APP`, `AUTH_CSRF_HMAC_KEY`, `AUTH_RATE_KEY` | Secret Manager; only refs in runtime |
| Migration job | `nuttiew-migrate` (`NUTTIEW_MIGRATE_JOB`) | release job execution verified in [CD run](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/44455509285) |
| Cloud Run service | `nuttiew` (`NUTTIEW_CLOUD_RUN_SERVICE`) | single origin UI+API; last serving revision `nuttiew-00007-69p` |
| Bootstrap password secrets | `NUTTIEW_SQL_POSTGRES_PASSWORD_SECRET`, `NUTTIEW_SQL_OWNER_PASSWORD_SECRET`, `NUTTIEW_SQL_RUNTIME_PASSWORD_SECRET` | **required in REAL mode** — three Secret Manager refs holding the postgres superuser, DB owner and DB runtime passwords; each must EXIST, be readable and carry a NONEMPTY value before any mutation (audited finding F2). Values are never generated or printed by the scripts |
| Secret creation ordering | `secrets create` for `DATABASE_URL`/`DATABASE_URL_APP`/`AUTH_CSRF_HMAC_KEY`/`AUTH_RATE_KEY` | created idempotently (reuse if present) BEFORE the service-account IAM bindings, so the migration SA secret IAM binding always targets an existing secret (audited finding F3). Migration SA receives only `roles/secretmanager.secretAccessor` on the migration `DATABASE_URL` secret — least privilege, never broad Secret Manager |
| GitHub Environment | `demo` | protection restricts deploy to `main` |

**Cloud SQL connection method (implemented and live; detailed connector IAM not re-audited).** The application uses `pg` (node-postgres,
`apps/api/package.json` → `"pg"` ≥8) whose `connectionString` supports the
standard `postgresql://` scheme. Two compatible options for Cloud Run:

1. **Cloud SQL connector / Unix socket** — recommended: the node app connects over
   a local Unix socket to the Cloud SQL Proxy/sidecar with instance IAM auth; no
   public IP exposure.
2. **Private IP + authorized connection string** — a `postgresql://user:pw@PRIVATE_IP/db`
   URL. Works with `pg`, but requires VPC/private-net and the runtime SA having
   `roles/cloudsql.client`.

The live runtime `DATABASE_URL_APP` reference was observed to target localhost,
consistent with a Cloud SQL Auth Proxy/connector path. Its secret value was not
printed or stored; the public readiness endpoint and confirmed booking provide
real application-to-database evidence. This check does **not** independently
certify all network/IAM settings or Cloud SQL IP restrictions.

---

## F. First deployment (safe operator runbook)

> **Historical first-deployment procedure, already executed in an authorized GCP
> session.** Retained below so another operator can reproduce the release safely.
> The live first-deploy/release result is evidenced by
> [CD #44455509285](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/44455509285);
> do **not** rerun this script just to reproduce screenshots.

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

> **Bootstrap-secret prerequisite (audited findings F2/F3).** Before any avoidable
> cloud mutation, `deploy/deploy.sh` in REAL mode verifies the three bootstrap
> password secrets exist, are readable and carry nonempty values
> (`verify_bootstrap_secret`). A missing resource, a secret with no usable version,
> a permission denial and an empty value each FAIL CLOSED with a distinct,
> actionable error before anything is created — never a silent skip, never an
> auto-generated password. Operator must have already populated those Secret
> Manager **values** (the runbook only creates the secret *references* later).
> Secret references are created idempotently **before** the service-account IAM
> bindings, so the migration SA can be granted `secretAccessor` only on the
> already-existing migration `DATABASE_URL` secret. Idempotency is enforced by a
> `describe`-first probe (`ensure_secret_create` / `ensure_iam_sa`): an existing
> resource is reused without modification; a missing resource is created; and a
> permission-denied or unexpected error fails closed before anything is deployed —
> never `|| true` over an aborting `gcloud_safe`. This text records the
> original GH-05 preflight design; §K documents the later live verification.

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

**Observed live release:** [reviewed release PR #99](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/99)
merged into protected `main` at
`ff55ac766ca792f0cc3ae29adad39d71ea4bca11`; successful
[GitHub Actions CD #44455509285](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/44455509285)
was **manually dispatched** against that `main` SHA after the reviewed release.
The CD run completed the migration, staged revision readiness verification,
tagged smoke, 100%-traffic switch and public smoke. Its released revision was
`nuttiew-00006-sen`, image digest
`sha256:ac1c9b0eb8e77d3245982ede48f5917494bfd020c6755134836da684db5d996e`.
This is evidence of the **human-reviewed, repeatable GitHub Actions deployment
path**, not evidence that the initial automatic `push` attempt succeeded (the
earlier push-triggered CD run failed). Later C-05 **Console** no-change redeploys
were separate operations and did not generate a new GitHub Actions run.

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
- **Workload Identity Federation / OIDC:** the successful real CD used the
  repository's configured authentication workflow. The list below records
  the **intended least-privilege provider restrictions** from GH-05;
  the provider's actual live claim/attribute policy was **not independently
  audited for C-05**, so do not claim every condition was proven:
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
- **Migration identity (finding #4):** `NUTTIEW_MIGRATE_SA_EMAIL` is the
  configured dedicated migration SA for the Cloud Run job; the successful
  migration job is recorded in the CD run. Its complete effective IAM bindings
  were **not independently re-audited** during C-05.
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
  Storage and automated-backup choices affect the bill. The originally planned
  default tier was `db-f1-micro` under Enterprise, but the **actual live tier was
  not checked in this C-05 session**, so no exact billed instance tier is claimed.
  The existing `nuttiew-pg` instance was observed `RUNNABLE`; any further
  provisioning, resize or cost change requires explicit operator approval.
- No automatically destructive teardown. Paid resources are created only by an
  explicit, confirmed operator action; ongoing Cloud SQL charges are a tracked
  risk. The service must remain available through the grading window — **do not
  propose deleting required resources before grading ends.**

---

## K. Current Lab 5 evidence status and submission index

**Last verified 19 November 2026 (Asia/Bangkok)**; updated in this runbook
20 November 2026. This section supersedes the earlier GH-05 `PENDING` statuses.
The course handout defines R-01–R-12 and C-01–C-06; the original GH-05-only
labels elsewhere in this runbook are engineering shorthand, **not a substitute
for the handout's actual requirement IDs**.

| Handout ID | Live/CI status | Direct checkable evidence |
| --- | --- | --- |
| R-01/R-02, C-03 | **PASS (local reproducibility)**: clean clone, Docker Compose, isolated PostgreSQL, no committed secrets | [fresh-clone-docker-evidence.md](fresh-clone-docker-evidence.md), [PR #77](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/77), `Dockerfile`, `.dockerignore`, `.env.example` |
| R-05, C-01 | **PASS**: reviewed PR with tests/types/build, DB/race, Edge E2E, Docker | [quality-gate-evidence.md](quality-gate-evidence.md), [PR #72](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/72), [CI #43458545343](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/43458545343) |
| R-06, C-02 | **PASS**: deliberately broken temporary PR blocked by required check; not merged | [PR #73](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/73), [failed CI #43486762424](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/43486762424), [Ruleset #27154099](https://github.com/Tanaboonnnnn/CPE334-NutTiew/rules/27154099) |
| R-03, C-04 | **PASS**: Tutor Login → create Slot → overlap rejected → Customer Login/Booking → both roles see confirmed booking; 401/403 restrictions | [C-04 live evidence](c04-production-evidence.md), [PR #101](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/101), [public URL](https://nuttiew-nxe2keefba-as.a.run.app/) |
| R-04, C-05 | **PASS for app revision replacement/redeploy**, with honest limitation: no forced in-place process kill | [C-05 persistence report](c05-persistence-evidence.md) + images; booking `a971b49d-52e4-4a9f-ba90-05058c63ecaf`, `00006-sen` → `00006-lkt` → `00007-69p` |
| R-07/R-08, C-06 | **VERIFIED for reviewed release + manually dispatched successful CD**; **automatic post-merge push-trigger not demonstrated as successful**, so do not present this as fully automatic | [PR #98](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/98) → [PR #99](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/99) → [successful CD #44455509285](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/44455509285), SHA `ff55ac766ca792f0cc3ae29adad39d71ea4bca11`, digest `sha256:ac1c9b0e…996e` |
| R-09/R-10/R-11 | **Evidence to cross-check at submission**: Project #6, `lab5` labels, real teammate reviews and two-member contributions | [GitHub Project #6](https://github.com/users/Tanaboonnnnn/projects/6), [PR #72](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/72), [PR #99](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/99), [PR #101](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/101) |
| R-12 | **Repository visibility to confirm again on submission date** | [Public repository](https://github.com/Tanaboonnnnn/CPE334-NutTiew) |

### Latest Production identity

- **Public URL:** https://nuttiew-nxe2keefba-as.a.run.app/
- **Git source lineage / last GitHub release:** `main@ff55ac766ca792f0cc3ae29adad39d71ea4bca11`; original release image `sha256:ac1c9b0eb8e77d3245982ede48f5917494bfd020c6755134836da684db5d996e`.
- **First verified CD revision:** `nuttiew-00006-sen`, 100% traffic at deployment time.
- **Current observed Cloud Run revision after C-05:** `nuttiew-00007-69p`, 100% traffic. Created with the same service configuration through Console; **no fresh Git commit or CD run**. The exact Console revision image digest was not independently read, so it is not asserted to equal the prior digest.
- **Database:** `nuttiew-pg`, observed `RUNNABLE`; existing Customer Booking unchanged after both revision replacements.
- **Final smoke:** `/` HTTP 200 and `/api/ready` HTTP 200 with `{"status":"ready"}`.
- **Security:** No demo credentials or connection strings in source/report; GCP permissions/Workload Identity configuration must be verified from Console if TAs ask for individual live IAM bindings.

### How to assemble the PDF (Handout §12)

Submit **one PDF per team**, titled `lab5_sec<section>_<group name>.pdf`,
with **Answer Part 0–4** in order. Include both students' names, student IDs,
GitHub handles and section **only in the controlled LEB2 submission**, not
in the public repository. Keep the evidence concise and use captions
identifying C-/R-ID, URLs, PR/run numbers and exact release SHA. The
[C-04 screenshots](c04-production-evidence.md) and
[C-05 screenshots](c05-persistence-evidence.md) supply Part 3 without
inventing a restart command or automatic CD run.
