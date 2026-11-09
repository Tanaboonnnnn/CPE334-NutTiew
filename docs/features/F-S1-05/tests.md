# F-S1-05 — Software Test Specification (STS) (Part E)

> **Documentation contract only; tests are planned and not executed yet.**
> Issue [#17](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/17). This document details the test strategy, test fixtures, execution steps, expected outcomes, and traceability mapping for the `RET-01..RET-16` test suite covering Protected Booking Retrieval and Authorized Tutor Schedule Inspection.

---

## 1. Traceability and Test Case Index

| Test ID | Requirement / Rule Trace | Acceptance Criteria | Validation Anchor | Target Layer & File | Summary of Verification |
|---|---|---|---|---|---|
| **RET-01** | `FR-S1-14`, `FR-S1-16`, `BR-S1-01` | **AC-S1-30** | `VC/TEST-S1-28` | API / Database (`retrieval.db.test.ts`) | Customer retrieves own committed Bookings list with Bangkok interval and `Booked` status. |
| **RET-02** | `FR-S1-14`, `FR-S1-16`, `BR-S1-15` | **AC-S1-30** | `VC/TEST-S1-28` | API / Database (`retrieval.db.test.ts`) | Customer retrieves own single Booking detail by valid UUID. |
| **RET-03** | `FR-S1-04`, `FR-S1-14`, `BR-S1-15`, `NFR-S1-01` | **AC-S1-31** | `VC/TEST-S1-29` | API / Database (`retrieval.db.test.ts`) | Cross-Customer probe: Customer B requests Customer A's Booking ID; returns `404 BOOKING_NOT_FOUND`. |
| **RET-04** | `FR-S1-15`, `BR-S1-16` | **AC-S1-32** | `VC/TEST-S1-30` | API / Database (`retrieval.db.test.ts`) | Tutor retrieves Bookings scheduled on their own Slots; opaque `customerRef` rendered. |
| **RET-05** | `FR-S1-07` | **AC-S1-32** | `VC/TEST-S1-30` | API / Database (`retrieval.db.test.ts`) | Tutor own-slots list (`/tutor/slots`) projects dynamic `occupancy: 'Occupied'` for booked Slot, `'Unoccupied'` for unbooked. |
| **RET-06** | `FR-S1-04`, `FR-S1-15`, `BR-S1-16`, `NFR-S1-01` | **AC-S1-33** | `VC/TEST-S1-31` | API / Database (`retrieval.db.test.ts`) | Cross-Tutor schedule isolation: Tutor B cannot inspect Tutor A's schedule bookings. |
| **RET-07** | `FR-S1-17`, `BR-S1-14`, `BR-S1-22`, `Q30` | **AC-S1-34** | `VC/TEST-S1-32` | API / Database (`retrieval.db.test.ts`) | Elapsed appointment displays `displayStatus: 'Past'`, while database `status` remains `'Booked'`, never `'Completed'`. |
| **RET-08** | `FR-S1-04`, `AC-S1-05` | — | `VC/TEST-S1-05` | API Guard (`retrieval.db.test.ts`) | Anonymous callers receive `401 UNAUTHENTICATED` on all customer and tutor retrieval endpoints. |
| **RET-09** | `FR-S1-04`, `AC-S1-06` | — | `VC/TEST-S1-06` | API Guard (`retrieval.db.test.ts`) | Role boundary: Authenticated Tutor calling Customer booking endpoints receives `403 FORBIDDEN`. |
| **RET-10** | `FR-S1-04`, `AC-S1-06` | — | `VC/TEST-S1-06` | API Guard (`retrieval.db.test.ts`) | Role boundary: Authenticated Customer calling Tutor booking endpoints receives `403 FORBIDDEN`. |
| **RET-11** | `NFR-S1-08` | — | — | API Input (`retrieval.db.test.ts`) | Malformed non-UUID in path parameter (`/api/v1/customer/bookings/invalid-id`) returns `400 INVALID_INPUT`. |
| **RET-12** | `NFR-S1-08` | — | — | API Input (`retrieval.db.test.ts`) | Unexpected query parameters on list and detail endpoints return `400 INVALID_INPUT`. |
| **RET-13** | `NFR-S1-01`, `NFR-S1-08` | — | `VC/TEST-S1-35` | Security / Privacy (`retrieval.db.test.ts`) | Full JSON response inspection: Zero leakage of password hashes, session tokens, or unapproved contact data. |
| **RET-14** | `FR-S1-16`, `NFR-S1-03` | **AC-S1-30** | `VC/TEST-S1-28` | Persistence / Lifecycle (`retrieval.db.test.ts`) | Server restart persistence: Fresh Express app instance reading same database returns identical committed Bookings. |
| **RET-15** | `FR-S1-14`, `FR-S1-17`, `NFR-S1-07` | **AC-S1-30**, **AC-S1-34** | `VC/TEST-S1-28`, `VC/TEST-S1-32` | Playwright E2E (`e2e/retrieval.spec.ts`) | Customer browser UI: Navigates to My Bookings, views upcoming & past badges, checks Bangkok time, opens detail view. |
| **RET-16** | `FR-S1-04`, `FR-S1-07`, `FR-S1-15` | **AC-S1-31**, **AC-S1-32** | `VC/TEST-S1-29`, `VC/TEST-S1-30` | Playwright E2E (`e2e/retrieval.spec.ts`) | Tutor browser UI: Inspects schedule bookings; Customer B attempting to visit Customer A booking detail shows safe 404 UI. |

---

## 2. Detailed Test Specifications

### RET-01: Customer Lists Own Committed Bookings
- **Goal:** Verify that an authenticated Customer can retrieve their own list of committed Bookings in deterministic ascending order.
- **Setup:**
  - Create Customer A and two Tutors (Tutor 1, Tutor 2).
  - Create two Slots (Slot 1 at +2h, Slot 2 at +5h).
  - Insert two committed Bookings for Customer A.
  - Create Customer B with a separate Booking on Slot 3.
- **Execution:** Customer A calls `GET /api/v1/customer/bookings`.
- **Expected Outcome:**
  - HTTP `200 OK`.
  - Response array contains exactly 2 items belonging to Customer A.
  - Customer B's Booking is completely omitted.
  - Response headers include `X-NutTiew-Session-Binding` and `Cache-Control: no-store`.

---

### RET-02: Customer Retrieves Single Booking Detail
- **Goal:** Verify that an authenticated Customer can fetch complete details of their own Booking by ID.
- **Execution:** Customer A calls `GET /api/v1/customer/bookings/:id` with Customer A's Booking ID.
- **Expected Outcome:**
  - HTTP `200 OK`.
  - Body contains `data.id`, `data.slotId`, `data.tutorId`, `data.tutorRef`, `data.startsAt`, `data.endsAt`, `data.status = 'Booked'`, and `data.createdAt`.

---

### RET-03: Cross-Customer Access Refusal (Safe 404)
- **Goal:** Prove that Customer B cannot inspect Customer A's Booking even if the exact UUID is known (`AC-S1-31`).
- **Setup:** Customer A owns Booking `UUID-A`. Customer B is authenticated.
- **Execution:** Customer B calls `GET /api/v1/customer/bookings/UUID-A`.
- **Expected Outcome:**
  - HTTP `404 Not Found` with `{ error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found' } }`.
  - Server does **NOT** return `403 FORBIDDEN` (which would confirm existence).
  - Zero private data is returned in the response body.

---

### RET-04: Tutor Lists Schedule Bookings
- **Goal:** Verify that a Tutor can retrieve Bookings scheduled on their own Slots (`AC-S1-32`).
- **Setup:**
  - Tutor 1 has Slot 1 with a committed Booking by Customer A.
  - Tutor 2 has Slot 2 with a committed Booking by Customer B.
- **Execution:** Tutor 1 calls `GET /api/v1/tutor/bookings`.
- **Expected Outcome:**
  - HTTP `200 OK`.
  - Response contains Slot 1's Booking.
  - Customer identity is masked as `customerRef: "CUST-" + customerAId.slice(0, 8)`.
  - Slot 2's Booking (Tutor 2) is completely absent.

---

### RET-05: Tutor Own-Slots Dynamic Occupancy
- **Goal:** Verify that `GET /api/v1/tutor/slots` dynamically reports `occupancy: 'Occupied'` when booked, and `'Unoccupied'` when not booked (`FR-S1-07`).
- **Setup:** Tutor 1 creates two Slots: Slot 1 (booked by Customer A) and Slot 2 (unbooked).
- **Execution:** Tutor 1 calls `GET /api/v1/tutor/slots`.
- **Expected Outcome:**
  - HTTP `200 OK`.
  - Slot 1 has `occupancy: 'Occupied'`.
  - Slot 2 has `occupancy: 'Unoccupied'`.

---

### RET-06: Cross-Tutor Schedule Isolation
- **Goal:** Verify that Tutor B cannot read or discover Tutor A's schedule bookings (`AC-S1-33`).
- **Execution:** Tutor B calls `GET /api/v1/tutor/bookings`.
- **Expected Outcome:**
  - Response array contains zero items from Tutor A.
  - API accepts no query parameters (e.g. `?tutorId=...` produces `400 INVALID_INPUT`).

---

### RET-07: Time-Derived "Past" Appointment Display (`Q30`, `AC-S1-34`)
- **Goal:** Verify that an elapsed Booking displays as `Past` without modifying database state or asserting `Completed`.
- **Setup:** Insert a fixture Booking with `startsAt = now() - 2 hours` and `endsAt = now() - 1 hour`.
- **Execution:** Customer opens `GET /api/v1/customer/bookings/:id`.
- **Expected Outcome:**
  - Response body contains `displayStatus: 'Past'`, but `status: 'Booked'`.
  - Database row check via `ownerPool.query`: `status` column is strictly `'Booked'`.
  - Slot remains occupied and is not automatically released.

---

### RET-08..RET-10: Authentication and Role Boundaries
- **RET-08:** Anonymous call to `/api/v1/customer/bookings` or `/api/v1/tutor/bookings` -> `401 UNAUTHENTICATED`.
- **RET-09:** Tutor session calling `/api/v1/customer/bookings` -> `403 FORBIDDEN`.
- **RET-10:** Customer session calling `/api/v1/tutor/bookings` or `/api/v1/tutor/slots` -> `403 FORBIDDEN`.

---

### RET-11..RET-13: Input Validation and Privacy Leak Checks
- **RET-11:** `GET /api/v1/customer/bookings/12345-invalid` -> `400 INVALID_INPUT`.
- **RET-12:** `GET /api/v1/customer/bookings?filter=all` -> `400 INVALID_INPUT`.
- **RET-13:** Stringify full response bodies across all endpoints; assert absence of substring `"passwordHash"`, `"tokenDigest"`, `"csrfNonce"`, or unmasked private emails.

---

### RET-14: Persistence Across Application Restart
- **Goal:** Prove that committed Bookings survive application shutdown and restart (`FR-S1-16`, `NFR-S1-03`).
- **Execution:**
  1. Commit Booking on Express app instance 1.
  2. Instantiate fresh Express app instance 2 against the same database pool.
  3. Query `GET /api/v1/customer/bookings` on instance 2.
- **Expected Outcome:** Returns the committed Booking with identical timestamps and IDs.

---

### RET-15 & RET-16: Playwright Edge Browser E2E Tests
- **RET-15 (Customer E2E):** Customer logs in, navigates to "การจองของฉัน", verifies Bangkok time format, clicks "ดูรายละเอียด", verifies Booking ID and "ยืนยันแล้ว" badge, verifies "สิ้นสุดแล้ว" badge for elapsed slot.
- **RET-16 (Tutor E2E & Negative Privacy):** Tutor logs in, views Agenda with "มีผู้จองแล้ว (Occupied)" badge, views schedule bookings. In parallel session, Customer B tries to directly browse Customer A's detail URL and verifies the "ไม่พบข้อมูลการจองนี้" error screen without any foreign data leakage.

---

## 3. Current Part E Status
All 16 test cases (`RET-01..RET-16`) are **PLANNED / NOT RUN**. No test execution or pass results are claimed in this Part E specification PR.
