# CPE334 NutTiew — Tutoring Appointment System

CPE334 Software Engineering group project (Semester 1/2026).

**Product:** one-to-one tutoring appointment scheduling (Theme 1 — Appointment & Scheduling).

## Status

Requirements discovery Q1–Q32 is closed. **Engineering baseline, system implementation and release are not yet complete.**
The Master Specification and group theme assignment must be checked with the instructor/TA before final SRS approval.

## Project documentation

- [Requirements decision log](docs/requirements/discovery-log.md)
- [Domain glossary](docs/requirements/CONTEXT.md)
- [Decision sign-off checklist](docs/requirements/requirements-signoff-checklist.md)
- [Unapproved TBD register](docs/requirements/requirements-tbd-register.md)
- [Sprint planning handoff](docs/requirements/github-start-handoff.md)

## Required delivery flow

`main` (accepted release) ← reviewed integration PR from `sprint1` (Sprint 1 staging) ← reviewed feature PRs from `feature/*` branches.

Every feature must be scoped through SRS/traceability/System SDS and have a versioned Feature SDS, UI/API/data contract (where relevant), Acceptance Criteria, Software Test Specification and Definition of Done **before implementing that feature**.

See the [CPE334 Project Deliverable 1](docs/requirements/requirements-signoff-checklist.md) evidence checklist. Due **8 Nov 2026 23:59 ICT**.

**Do not commit secrets.** 

## F-S1-01 Authentication implementation (Issue #13)

See [Part F implementation and local PostgreSQL setup](docs/features/F-S1-01/implementation.md).

## F-S1-02 Tutor Slot availability implementation (Issue #14)

See [Tutor Slot Part F implementation and PostgreSQL privilege setup](docs/features/F-S1-02/implementation.md).
Part E contracts are in the same folder. Feature/test evidence is tracked in the
[Slot verification ledger](docs/features/F-S1-02/verification-ledger.md).
