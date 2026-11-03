# Feature Inventory — Deliverable 1 Part B

Draft for teammate review. [SRS](srs.md) is authoritative. Sprint 2/3 allocations are proposed, not approved.

| Stable ID | Feature and required outcome | Actor | Sprint | Dependency | Linked FR/BR/NFR | Planned verification |
|---|---|---|---|---|---|---|
| F-S1-01 | Customer/Tutor can log in, retrieve trusted identity, and log out; backend rejects unauthorized roles and records | Customer/Tutor | S1 | none | FR-001, FR-002, FR-003, FR-004, BR-002, BR-033, NFR-001, NFR-002 | VAL-001/002 (planned) |
| F-S1-02 | Tutor creates and retrieves own 60-minute Slots; concurrent overlap is rejected and adjacent offers allowed | Tutor | S1 | F-S1-01 | FR-005, FR-006, FR-007, BR-003, BR-004, BR-006, BR-035 | VAL-003/004/005 (planned) |
| F-S1-03 | Customer discovers eligible Tutor/time offers without third-party Booking data | Customer | S1 | F-S1-02 | FR-008, FR-009 | VAL-006 (planned) |
| F-S1-04 | Customer books one eligible Slot persistently; concurrent same-Slot claims and overlapping Customer bookings are rejected | Customer | S1 | F-S1-01/02/03 | FR-010, FR-011, FR-012, FR-013, BR-001, BR-005, BR-028, NFR-008 (S1 Booking retry safety) | VAL-007..011/014/030 (planned) |
| F-S1-05 | Customer reads only own persisted Bookings and Tutor reads only own schedule after refresh; Past is not Completed | Customer/Tutor | S1 | F-S1-01/04 | FR-014, FR-015, FR-016, FR-017, BR-030 | VAL-012/013 (planned) |
| F-S2-01 | Customer cancels own eligible Booking and atomically reopens original Slot (proposed) | Customer | S2 proposed | F-S1-04 | FR-020, FR-021, BR-007, BR-008 | VAL-015/016 (planned) |
| F-S2-02 | Customer reschedules at most once, even across Tutors, retaining ID and atomic history (proposed) | Customer | S2 proposed | F-S1-04/05 | FR-022, FR-023, FR-024, FR-025, FR-026, FR-027, BR-009, BR-010, BR-011, BR-012, BR-013, BR-014, BR-015, BR-016, NFR-008 | VAL-017..020 (planned) |
| F-S2-03 | Authorized Tutor cancels with a reason and atomically withdraws the Slot (proposed) | Tutor | S2 proposed | F-S1-02/04 | FR-028, FR-029, FR-030, BR-017, BR-018, BR-019, BR-020 | VAL-021/022 (planned) |
| F-S2-04 | Owning Customer privately reads and rereads durable cancellation notice (proposed) | Customer | S2 proposed | F-S2-03 | FR-031, FR-032, BR-021, BR-022, BR-023, BR-024, BR-025, NFR-014 | VAL-023/024 (planned) |
| F-S2-05 | Tutor withdraws unoccupied future Slot, preserving history and allowing distinct replacement (proposed) | Tutor | S2 proposed | F-S1-02 | FR-033, FR-034, BR-026, BR-027, BR-032 | VAL-025..027 (planned) |
| F-S3-01 | Tutor views authorized counts and matching lists for Upcoming, Past and Cancelled (proposed) | Tutor | S3 proposed | F-S1-05 | FR-035, FR-036, BR-031, NFR-016 | VAL-028/029 (planned) |
| SYS-01 | System preserves atomic/durable changes, authorization, reproducible evidence and a proposed deployment design | System | S1-S3/Lab5+ | all | FR-018, FR-019, BR-029, BR-034, NFR-003, NFR-004, NFR-005, NFR-006, NFR-007, NFR-009, NFR-010, NFR-011, NFR-012, NFR-013, NFR-015 | VAL-005/006/010/011/012/014/020/022/023/029/030..036 (planned across S1/S2/S3) |

## Baseline and invariants

F-S1-01..05 retain the five accepted Sprint 1 identities (Auth, Tutor Slots, Availability, Booking, Protected Read) from [requirements.md](requirements.md). SYS-01 owns cross-cutting engineering obligations, while all features still enforce role and record authorization. NFR-004 is shared by F-S1-02 (Race A) and F-S1-04 (Races B/C), while NFR-007 privacy applies to F-S1-03/F-S1-05 in S1, F-S2-04 in proposed S2, and F-S3-01 in proposed S3. These shared applications do not create duplicate primary owners; see [traceability.md](traceability.md).

Race A: F-S1-02 / Q06 / FR-006 / BR-006/034 / VAL-005 — same-Tutor overlapping offered Slots.

Race B: F-S1-04 / Q01 / FR-012 / BR-001/034 / VAL-010 — two Customers, one Slot.

Race C: F-S1-04 / Q28 / FR-013 / BR-028/034 / VAL-011 — one Customer, overlapping Tutors.

All three require actual committed database checks. S2 cancellation, rescheduling, withdrawal and notices and S3 summary are planned only. See [traceability.md](traceability.md) for coverage and SRS §13 for OD-001..015.

## Acceptance and review

Each feature must preserve its listed requirement outcomes and planned VAL evidence; Feature SDS/STS must be peer reviewed before implementation. Owner @Chxtamos; independent reviewer @Tanaboonnnnn. Issue #10 requires a PR into sprint1.
