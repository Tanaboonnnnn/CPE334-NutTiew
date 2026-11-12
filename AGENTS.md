# CPE334 NutTiew — Agent Operating Rules

Scope: the entire `CPE334-NutTiew` repository. These are executable working rules for **one primary agent** at a time. Follow the assigned Issue and the actual repository state; this file does not authorize starting unrelated work.

## 1. Mission and source hierarchy

- Build the CPE334 **Tutoring Appointment System** (Theme 1: Appointment & Scheduling), with Customer/Learner and Tutor/Staff as distinct authorized roles.
- The user-assigned GitHub Issue is the **task boundary**, not permission to implement every downstream Issue. Read its complete description, current comments, dependencies and linked PRs before changing files.
- For business behavior, consult `docs/requirements.md` (reviewed Sprint 1 baseline, Q01–Q32). When available, use the approved whole-product SRS, Feature Inventory/Traceability, System SDS and per-feature contracts. Compare conflicting statements and report them; never silently choose one.
- Instructor-issued updated/final Master Specifications and Deliverable instructions take precedence **when actually provided**. For Sprint 1, use the available Group Work Specification v1 (6 October 2026, labeled Draft) as the working master expressly referenced by Project Deliverable 1 v1. Follow the published theme-assignment rule and document any uncertainties honestly; do **not** invent a separate instructor Final Master / Theme 1 sign-off requirement solely because the working source is labeled Draft. Never claim unverified instructor approval.
- Sprint 1 is a working **UI → API/application → persistent DB** slice. Whole-product SRS/Inventory/SDS/three-sprint planning cover Sprints 1–3; Sprint 1 feature contracts, implementation and tests cover Sprint 1 only. Cancellation, rescheduling, notifications, withdrawal and summary are later-sprint capabilities unless the approved plan changes.
- Maintain stable requirement/feature/test identifiers and trace links. Label stakeholder-approved rules, instructor requirements, engineering decisions, proposals, and unresolved TBDs distinctly. Never manufacture approvals, pass results, citations or missing source data.

## 2. Single-agent execution — NO delegation

- **One agent owns discovery, decisions, edits, commands, QA and reporting.** Do not launch subagents, agent teams, parallel coding agents, delegated research/review workers or background agent sessions.
- Sequential direct tool use is fine; parallel independent read-only tool queries are fine when they cannot race or change state. Do not parallelize repository writes, Git operations or dependent validation steps.
- A requested peer review means an actual **human teammate GitHub review**. An agent's self-review is an additional check, never a substitute.
- Do not claim autonomous or asynchronous continuation. Finish and report in the current work session; if blocked, leave an accurate handoff without promising later action.

## 3. GitHub workflow and permissions

1. Inspect `git status --short`, current branch, `git log -1`, remote/upstream and the live Issue/PR state. Check for `AGENTS.md` in relevant subdirectories.
2. **`main` is accepted release; `sprint1` is integration/staging.** Branch each distinct Issue from the current remote `sprint1`: use `docs/<issue>-...`, `feature/<issue>-...`, or `chore/<issue>-...` as appropriate.
3. Before branching, fetch and verify the remote base SHA. If the working tree is dirty, another agent/person has changed the branch, or a remote head moved unexpectedly, **stop and diagnose**; preserve others' work. Never reset or clean it away.
4. Commit **only authorized files** for this Issue. Review staged paths and `git diff --cached --check`; keep commits coherent, messages meaningful and scope small. Do not add exploratory artifacts, unrelated context docs, secret files or empty contracts.
5. Push the dedicated Issue branch; open/update an **Issue-linked PR with base `sprint1`**, explaining scope, dependencies, files, verification, limitations and explicit reviewer requests. When @Tanaboonnnnn is the author, request @Chxtamos; when @Chxtamos is the author, request @Tanaboonnnnn. Confirm the real GitHub reviewer request and later review state.
6. Leave the PR **open for human approval**. Never approve your own PR, self-merge, merge on the user's behalf without a fresh explicit request, or directly push to `sprint1` / `main`. Later release work uses a separately reviewed `sprint1 → main` PR.
7. Update Project #6 Kanban to the **verified** stage (Backlog → Specified → Started → PR Review → Fixing → Done), and Sprint field. `Done` requires the actual Issue DoD; `PR Review` means awaiting review; `Fixing` means review changes are being addressed.
8. **Destructive Git operations** (force-push, history rewrite, delete branch/Issue/Project, `reset --hard`, `clean`, rebase of shared work) require a fresh explicit user authorization and remote-SHA safety check. Creation of an Issue/PR alone never authorizes deleting another item.

For an **AGENTS.md-only task**, its PR may contain `AGENTS.md` alone. It is not an invitation to edit README, SRS, tests, configurations or Issue #9. Never use the agent guidance PR as a shortcut to start the next task.

## 4. Loop Engineering — mandatory per task

Use a closed-loop process. Every step must have an observable exit condition; record real results, not confidence.

### LOOP 0 — Define and preflight

- Restate the exact Issue goal, allowed files, out-of-scope items, source-of-truth documents, blockers, target branch and **measurable acceptance criteria**.
- Check repo/tree, Issue dependencies, source references, ownership/reviewer and existing conventions **before designing edits**.
- **Exit:** one bounded target and an explicit go/no-go decision. If required inputs are unavailable, document the blocker and stop.

### LOOP 1 — Plan narrowly

- Map the files touched and why. Identify dependency order, expected artifacts, verification commands and rollback/safety checks.
- Prefer reversible vertical slices and existing conventions. For documentation work, map required decisions → section/ID → verification. For implementation, map requirement/AC → test → code.
- Do not introduce a dependency, architecture redesign, product rule or second Issue without an approved reason.
- **Exit:** a checkable plan with no unexplained source, scope or authorization gaps.

### LOOP 2 — Act once

- Make **one coherent change** on the assigned Issue branch. Keep the change small enough to inspect.
- For code, start with an appropriate failing test when feasible, verify it actually fails for the expected reason, then implement the minimum change.
- For docs, write evidence-grounded content with source/decision and stable ID references, not padding or duplicated boilerplate.
- **Exit:** a diff that addresses exactly one planned outcome.

### LOOP 3 — Observe

- Inspect actual command output, changed paths, relevant document/code snippets and unexpected side effects. Treat errors and missing evidence as signals, never as permission to skip checks.
- Compare the current result against the planned invariant, source and Issue. If new information changes the design, update the plan before editing again.
- **Exit:** observed success/failure and the reason are recorded.

### LOOP 4 — Verify

- Run the **most relevant checks that exist in the repo**: Markdown structure/links/IDs/provenance for docs; unit/integration/DB concurrency/security tests, lint/typecheck/build and E2E where applicable for code.
- Use genuine UI/API/DB and persisted rows when claiming a working feature; mocks alone do not prove Sprint 1 integration. Race tests must verify committed final state, not just HTTP messages.
- Check `git diff --check`, staged file allowlist, AC/FR/BR/NFR/VC coverage, permissions/privacy, error paths and forbidden feature creep. Compare the PR diff with the target base.
- **Exit:** each required check has command/method, observed result, and PASS/FAIL/NOT RUN with reason. A skipped or unavailable check is **not** PASS.

### LOOP 5 — Recover

- Diagnose the observed failure before the next edit; identify the smallest likely cause and verify it with a targeted check.
- Retry a **narrower** change and rerun affected verification. Track attempts and new evidence; do not repeat the same unsuccessful operation blindly.
- **Stop after three failures of the same class without a materially new hypothesis or result.** Report blocker, unchanged guarantees and safe next action. Never hide a failure by deleting tests or relaxing requirements without approval.
- **Exit:** either checks pass or the agent stops with a precise, reproducible blocker.

### LOOP 6 — Stop and hand off

- Stop when the Issue's scoped artifacts are verified and a human-reviewed PR is ready for review **or** when an authorization/source/dependency/technical blocker is reached.
- Report what is done, what remains, current branch/commit/PR and Kanban stage. Do not start another Issue, auto-merge, invent next tasks, or leave a claim of successful release without evidence.

### Persistent task context

- If a long Issue needs a handoff, keep a concise task-state note with: Issue goal, branch/SHA, done, next, decisions, blockers and exact verification output. Prefer an Issue/PR comment or untracked local note unless the Issue **explicitly authorizes** a tracked `TASK_STATE.md`.
- On resume, re-read the latest Issue, comments, current branch/status/diff and state note; the note never overrides fresh repository evidence.

## 5. Instructor-first document and implementation gates

- **Part A:** whole-product SRS — scope, actors, numbered FR/BR/NFR, exclusions, assumptions and source provenance. This is **not** merely Sprint 1 `docs/requirements.md`.
- **Part B:** Feature Inventory and traceability from requirement → feature → sprint → verification; gaps identified.
- **Part C:** whole-product System SDS — architecture, data entities and constraints, UI/API and error conventions, permissions, persistent DB, safe configuration and future deployment design.
- **Part D:** three-sprint plan with goals, dependencies, verifiable outcomes and feasible Sprint 1 slice.
- **Part E, before each feature's code:** versioned Feature SDS (`specification.md` or adopted equivalent), applicable `ui-spec.md` / `api-spec.md`, data contract, mapped AC, `tests.md`/STS, DoD and **documented peer review**. File naming is a convention, not proof of content.
- **Part F:** real working UI/API/database, negative/authorization/concurrency checks, meaningful TDD evidence, source SHA, actual build/test pass/fail/skip counts, teammate-reviewed integration/release and reproducible setup; submission PDF is separate evidence.
- **Sprint 1 release gate, source-aligned:** Group Work Specification v1 §§5.3, 8.3, 9 and Project Deliverable 1 v1 §§2, 3.6, 4–5 require a working UI→API→persistent-DB slice, authorization/domain tests, reviewed PRs, integration evidence, a reviewed `sprint1 → main` release, release SHA/tag, and truthful D1 submission evidence. Neither supplied handout requires a separate **independent formal WCAG 2.2 AA / screen-reader sign-off** or separately signed **Final Master / Theme 1 confirmation** before the Sprint 1 merge. Keep these as non-blocking follow-up quality/source-verification items unless a newer instructor instruction explicitly requires them. Do not claim an unperformed audit passed; do not waive theme eligibility, actual documented requirements, reviewer approval, test failures, the release tag, or the course submission obligations.
- Instructor D1 timing and Lab 5 scope are different: **do not claim GCP/Docker/CI/CD is already complete** without actual instructions and evidence. Read the authoritative handout for any deadlines or submission specifics; never infer them from README alone.
- For Issue #9 specifically: author a **whole-product** `docs/srs.md`, map Q01–Q32, mark open Master/Theme/policy gates, and correct the reviewed `AC-S1-35` reference in `docs/requirements.md` §16.1 if it remains wrong. **Do not author Part B/C/D files or any application code within #9.**

## 6. Safety, integrity and stop rules

- Preserve all existing files, commits, branches and user work. Avoid forceful cleanup; prefer surgical edits and narrow diffs.
- Never commit tokens, passwords, private keys, production data or real user records. Use environment examples with placeholders and confirm ignored secrets remain untracked.
- Enforce backend authorization and privacy, not just disabled UI. Every Booking/Slot conflict must preserve atomic committed invariants and the authoritative Asia/Bangkok time rules.
- Stop and report if an **actual instructor-required** source or approval needed for the specific task is missing, stakeholder business rules conflict, an Issue prerequisite is unresolved, required account access is absent, the next action would be destructive, or the proposed fix expands scope. Do not block the Sprint 1 release solely for lack of a separately signed Final Master / Theme 1 confirmation that the supplied D1 handout does not require.
- If a command/tool is unavailable, name it and use another **verifiable** method if appropriate; do not simulate its success or fabricate screenshots/results.

## 7. Mandatory completion report

End every task with the following evidence, concise but complete:

1. **Issue and scope:** linked Issue, requested output, explicit out-of-scope.
2. **Changes:** exact file paths and concise content summary.
3. **Git:** branch, base and head SHA, commits, PR URL/base, requested reviewer, merge status and Project stage.
4. **Verification:** exact checks run and their observed PASS/FAIL results; any checks not run and why.
5. **Traceability:** requirements/AC/STS IDs covered, remaining gaps and source/approval status.
6. **Risks/blockers:** open decisions, failed checks, dependency issues and next authorized action.

**Never write “done”, “approved”, “merged”, “tests pass”, or “ready to submit” unless the corresponding action/result was actually verified.**
