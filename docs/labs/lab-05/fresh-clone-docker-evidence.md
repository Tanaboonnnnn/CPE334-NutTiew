# Lab 5 C-03 — Fresh-clone Docker reproducibility (NutTiew)

- **Checked:** 14 November 2026 (Asia/Bangkok)
- **Issue:** [#76 — Fresh-clone Docker C-03](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/76)
- **Upstream baseline:** `sprint1@721f68e2926d362d504ecbafc60855ffb8b5edef`
- **Fully working test commit:** `7a08c57f497ab033d98f1a34a45743d0e982d624` on `chore/76-c03-compose-fresh-clone`

This is evidence for **C-03 / R-01 (Docker from a fresh clone)** and **R-02 (environment-only configuration, no real secrets)**. It covers **Answer Part 2 (20 points)** in the Lab 5 handout. It is a *local* Docker demonstration; it is **not** evidence of GCP deployment, public URL, cloud persistence, or a release from `main` (C-04/C-05/C-06 remain PENDING).

## 1. Test isolation and clean source

The test was run on Windows with Git `core.autocrlf=true`, Docker Engine `29.9.2` and Docker Compose `v5.6.0`. The final checkout was a **new `git clone --depth 1` from GitHub** of the exact tested commit above.

- No host `node_modules`, `apps/api/dist`, `apps/web/dist`, or `.env` existed immediately after clone.
- `.env` was generated privately from the tracked `.env.example`, with **new random 32-byte hex values** for the three DB passwords and two HMAC keys; all actual values were suppressed from reports and logs.
- The tracked template contains placeholders only; `git check-ignore -q .env` passed, and the checkout's `git status --short --branch` contained no tracked changes.
- Dedicated Compose project: `cpe334lab5c03final`. Temporary host UI port: `127.0.0.1:3188`. PostgreSQL port `5432` was **not** published on the host.
- Dedicated data volume: `cpe334lab5c03final_nuttiew_pg_data`. No pre-existing project, database, container or volume was reused.

## 2. Real failures discovered, diagnosed and prevented

| Stage | Observed before fix | Confirmed cause | Correction and regression |
| --- | --- | --- | --- |
| Fresh clone from `sprint1@721f68e` | `docker compose config --quiet` exited 0; actual `up` failed `invalid volume name or ID: value is empty` | `docker-compose.yml` interpolated an unset `NUTTIEW_DB_VOLUME` into an empty explicit `name` | Default name now uses `COMPOSE_PROJECT_NAME` and preserves explicit override. `python scripts/verify_compose_volume.py` **RED before / GREEN after**, checking two independent projects and the override |
| Fresh checkout on Windows, after volume fix | PostgreSQL initialized but exited **127** on the mounted init script, with `env: 'bash\r': No such file or directory` | Windows checkout converted `compose/db-init.sh` to CRLF (`git ls-files --eol`: `i/lf w/crlf`) | `.gitattributes` now pins `*.sh text eol=lf`; `python scripts/verify_container_script_eol.py` **RED before / GREEN after**. A brand-new Windows clone at `7a08c57` confirmed `i/lf w/lf attr/text eol=lf` |

Both regressions run inside the existing **required `Unit / types / build` CI job**. The three required CI job names were not changed.

## 3. Reproduction commands and observed results

Run from a **fresh clone of the tested branch/commit**, with a private `.env` populated from `.env.example` using fresh local synthetic values. Set `NUTTIEW_HTTP_PORT=3188` for this isolated proof. Never push `.env` or reuse live passwords.

```bash
python scripts/verify_compose_volume.py
python scripts/verify_container_script_eol.py

docker compose -p cpe334lab5c03final --env-file .env config --quiet
docker compose -p cpe334lab5c03final --env-file .env build app migrate
docker compose -p cpe334lab5c03final --env-file .env up --no-build --wait --wait-timeout 180

curl -fsS http://127.0.0.1:3188/api/ready
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3188/
docker compose -p cpe334lab5c03final --env-file .env ps -a
```

| Verification | Actual result at tested commit | Status |
| --- | --- | --- |
| Clone checkout and ignored local `.env` | No host build artifacts; Git status clean; `.env` ignored | **PASS** |
| Compose project isolation and LF scripts | Both regression scripts exit **0**; volume resolved to `cpe334lab5c03final_nuttiew_pg_data` | **PASS** |
| Build from fresh source | Runtime and migration image builds exit **0** (Docker layer cache permitted for final run) | **PASS** |
| `docker compose up --no-build --wait` | Exit **0** | **PASS** |
| PostgreSQL 18 and NutTiew runtime | Both Docker health states **healthy** | **PASS** |
| Migration | One-shot `migrate` container **Exited (0)** before app startup | **PASS** |
| `GET http://127.0.0.1:3188/api/ready` | HTTP **200**, body `{"status":"ready"}` | **PASS** |
| `GET /` and referenced React JS | Both HTTP **200**; root HTML contains `<div id="root"`; JS bundle served (303,903 bytes) | **PASS** |
| Database identity/schema | `nuttiew_owner` and `nuttiew_runtime` roles: **2/2**; `pgcrypto` + `btree_gist`: **2/2**; core `User`/`Session`/`Slot`/`Booking` tables: **4/4** | **PASS** |
| Runtime DB restriction | `DATABASE_URL_APP` present; privileged `DATABASE_URL` absent; restricted role can `INSERT` but not `DELETE` `Slot` | **PASS** |
| Secrets and network | No `/app/.env` in runtime or migration images; PostgreSQL port not published to host | **PASS** |

Database counts and permissions were verified with **read-only SQL** inside the isolated PostgreSQL container. No user data, production connection string, or private key was used.

## 4. Cleanup and remaining work

After capturing the above results, the temporary Compose projects `cpe334lab5c03final` and `cpe334lab5c03proof` were stopped with project-specific `docker compose ... down --volumes`; subsequent label-filtered checks found **zero remaining project containers or database volumes**. Existing unrelated student-system and PostgreSQL containers remained present and untouched.

This test did **not** verify a GCP deployment, public domain, Cloud SQL, managed secrets, or persistence after a cloud redeploy. Those remain for **C-04, C-05 and C-06**. This document is a reproducibility evidence record, not a claim that all of Lab 5 is complete.

For the final Lab 5 PDF **Answer Part 2**, cite this document, the exact tested commit, `Dockerfile`, `.dockerignore`, `.env.example`, `docker-compose.yml`, and the required CI run for the review PR once it succeeds. No local test credential needs to be included.
