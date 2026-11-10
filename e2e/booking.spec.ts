import { test, expect, type Page } from '@playwright/test';
import { openAvailabilityOffer } from './helpers/open-availability-offer.js';
import { Pool } from 'pg';
import argon2 from 'argon2';
import { randomBytes, randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env', quiet: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const tag = randomBytes(6).toString('hex');
const password = 'BookingBrowserPassword#2026';

const tutor1Email = `book-e2e-t1-${tag}@example.test`;
const tutor2Email = `book-e2e-t2-${tag}@example.test`;
const customer1Email = `book-e2e-c1-${tag}@example.test`;
const customer2Email = `book-e2e-c2-${tag}@example.test`;

let tutorAId = '';
let tutorBId = '';
let customer1Id = '';
let customer2Id = '';

const bangkokDayKey = (offsetDays: number): string =>
  new Date(Date.now() + offsetDays * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
const bangkokInstant = (dayKey: string, hhmm: string): Date =>
  new Date(`${dayKey}T${hhmm}:00.000+07:00`);

const dayTarget = bangkokDayKey(16);
let hourCounter = 8;

async function createOfferedSlot(tutorId: string, hhmm?: string): Promise<string> {
  const timeStr = hhmm ?? `${String(hourCounter++).padStart(2, '0')}:00`;
  const start = bangkokInstant(dayTarget, timeStr);
  const end = new Date(start.getTime() + 3_600_000);
  const r = await pool.query<{ id: string }>(
    'INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle") VALUES($1,$2,$3,\'Offered\') RETURNING "id"',
    [tutorId, start, end],
  );
  return r.rows[0].id;
}

test.beforeAll(async () => {
  await pool.query(
    `UPDATE "User" SET "isActive"=false WHERE "role"='Tutor' AND ("email" LIKE 'avail-%@example.test' OR "email" LIKE 'book-e2e-%@example.test')`,
  );

  const hash = await argon2.hash(password);
  const t1 = await pool.query<{ id: string }>(
    'INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,\'Tutor\') RETURNING "id"',
    [tutor1Email, hash],
  );
  const t2 = await pool.query<{ id: string }>(
    'INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,\'Tutor\') RETURNING "id"',
    [tutor2Email, hash],
  );
  [tutorAId, tutorBId] = [t1.rows[0].id, t2.rows[0].id].sort((a, b) => a.localeCompare(b));

  const c1 = await pool.query<{ id: string }>(
    'INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,\'Customer\') RETURNING "id"',
    [customer1Email, hash],
  );
  const c2 = await pool.query<{ id: string }>(
    'INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,\'Customer\') RETURNING "id"',
    [customer2Email, hash],
  );
  customer1Id = c1.rows[0].id;
  customer2Id = c2.rows[0].id;
});

test.afterAll(async () => {
  await pool
    .query('UPDATE "User" SET "isActive"=false WHERE "id" = ANY($1::uuid[])', [
      [tutorAId, tutorBId, customer1Id, customer2Id].filter(Boolean),
    ])
    .catch(() => {});
  await pool.end();
});

async function signIn(page: Page, email = customer1Email, navigate = true) {
  const h = randomBytes(12).toString('hex');
  await page.setExtraHTTPHeaders({
    'X-Forwarded-For': `2001:db8:${h.slice(0, 4)}:${h.slice(4, 8)}:${h.slice(8, 12)}::d`,
  });
  if (navigate) await page.goto('/');
  await page.getByLabel('อีเมล').fill(email);
  await page.getByLabel('รหัสผ่าน').fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page.getByText('เข้าสู่ระบบแล้ว')).toBeVisible();
}

test.describe('F-S1-04 Customer Booking Confirmation UI & Edge E2E (BOOK-01..BOOK-29)', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('BOOK-01 / BOOK-13 / BOOK-15 confirms a selected offer (201) with exact POST body {"slotId"}, handles 503 BOOKING_OUTCOME_UNKNOWN by locking selection and retrying exact same slotId to 200 original Booking ID', async ({
    page,
  }) => {
    const slot1Id = await createOfferedSlot(tutorAId, '09:00');
    const slot2Id = await createOfferedSlot(tutorBId, '11:00');
    const slot3Id = await createOfferedSlot(tutorAId, '13:00');

    const capturedBodies: unknown[] = [];
    let interceptUnknown = false;
    let firstCommittedId = '';

    await page.route('**/api/v1/customer/bookings', async route => {
      const req = route.request();
      if (req.method() === 'POST') {
        capturedBodies.push(req.postDataJSON());
      }
      if (interceptUnknown) {
        interceptUnknown = false;
        // Let the real server commit the booking, then simulate lost response with 503 BOOKING_OUTCOME_UNKNOWN (BOOK-15)
        const real = await route.fetch();
        expect(real.status()).toBe(201);
        const realJson = (await real.json()) as { data: { id: string } };
        firstCommittedId = realJson.data.id;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          headers: { 'Cache-Control': 'no-store' },
          body: JSON.stringify({
            error: {
              code: 'BOOKING_OUTCOME_UNKNOWN',
              message: 'Booking outcome could not be confirmed',
            },
            requestId: 'simulated-lost-commit',
          }),
        });
        return;
      }
      await route.continue();
    });

    await signIn(page, customer1Email);

    // 1. Select slot1Id and confirm (201 Created)
    const offer1 = page.locator(`[data-offer-slot-id="${slot1Id}"]`);
    await openAvailabilityOffer(page, slot1Id);
    await expect(offer1).toBeVisible();
    await offer1.getByRole('button', { name: 'เลือกช่วงเวลานี้' }).click();

    const summary = page.locator('#selected-offer-summary');
    await expect(summary).toBeVisible();
    const confirmBtn = summary.getByRole('button', { name: 'ยืนยันการจอง' });
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    const confirmedBanner = page.getByTestId('booking-confirmed-banner');
    await expect(confirmedBanner).toBeVisible();
    await expect(confirmedBanner).toContainText('จองสำเร็จ');
    await expect(confirmedBanner).toContainText('09:00–10:00 น.');
    const confirmedIdText = await page.getByTestId('confirmed-booking-id').innerText();
    expect(confirmedIdText).toMatch(/^[0-9a-f-]{36}$/i);

    // Verify request body contained ONLY {"slotId": slot1Id} (BOOK-09)
    expect(capturedBodies[0]).toEqual({ slotId: slot1Id });

    // And slot1Id is removed from the refreshed availability list
    await expect(page.locator(`[data-offer-slot-id="${slot1Id}"]`)).toHaveCount(0);

    // 2. Select slot2Id, trigger 503 BOOKING_OUTCOME_UNKNOWN after server commit (BOOK-15)
    const offer2 = page.locator(`[data-offer-slot-id="${slot2Id}"]`);
    const offer3 = page.locator(`[data-offer-slot-id="${slot3Id}"]`);
    await openAvailabilityOffer(page, slot2Id);
    await expect(offer2).toBeVisible();
    await openAvailabilityOffer(page, slot3Id);
    await expect(offer3).toBeVisible();

    await openAvailabilityOffer(page, slot2Id);
    await offer2.getByRole('button', { name: 'เลือกช่วงเวลานี้' }).click();
    interceptUnknown = true;
    await page.locator('#selected-offer-summary').getByRole('button', { name: 'ยืนยันการจอง' }).click();

    // Unknown outcome state: does NOT claim success or failure, preserves slot2Id, disables selecting slot3Id, offers "ส่งคำขอเดิมอีกครั้ง"
    await expect(page.getByText('รอการยืนยันผลการจองช่วงเวลาติว')).toBeVisible();
    const retrySameBtn = page.getByRole('button', { name: 'ส่งคำขอเดิมอีกครั้ง' });
    await expect(retrySameBtn).toBeVisible();
    await openAvailabilityOffer(page, slot3Id);
    await expect(offer3.getByRole('button', { name: 'เลือกช่วงเวลานี้' })).toBeDisabled();

    // Click "ส่งคำขอเดิมอีกครั้ง" -> sends exact same {"slotId": slot2Id} and receives 200 OK with original Booking ID!
    await retrySameBtn.click();
    await expect(confirmedBanner).toBeVisible();
    await expect(confirmedBanner).toContainText('ยืนยันการจองเดิมแล้ว');
    await expect(page.getByTestId('confirmed-booking-id')).toHaveText(firstCommittedId);
    expect(capturedBodies[1]).toEqual({ slotId: slot2Id });
    expect(capturedBodies[2]).toEqual({ slotId: slot2Id });
  });

  test('BOOK-04 / BOOK-05 / BOOK-07 surfaces safe 409 conflict and 422 cutoff errors without false success and refreshes availability', async ({
    page,
  }) => {
    const slotConflictId = await createOfferedSlot(tutorAId, '15:00');
    const slotCutoffId = await createOfferedSlot(tutorBId, '17:00');

    await signIn(page, customer1Email);
    const offerConflict = page.locator(`[data-offer-slot-id="${slotConflictId}"]`);
    await openAvailabilityOffer(page, slotConflictId);
    await expect(offerConflict).toBeVisible();
    await offerConflict.getByRole('button', { name: 'เลือกช่วงเวลานี้' }).click();

    // Another Customer books slotConflictId in the database after Customer 1 selected it (BOOK-07)
    const sRow = await pool.query<{ startsAt: Date; endsAt: Date }>(
      'SELECT "startsAt","endsAt" FROM "Slot" WHERE "id"=$1',
      [slotConflictId],
    );
    const c2Booking = await pool.query<{ id: string }>(
      'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt","status") VALUES($1,$2,$3,$4,\'Booked\') RETURNING "id"',
      [customer2Id, slotConflictId, sRow.rows[0].startsAt, sRow.rows[0].endsAt],
    );

    await page.locator('#selected-offer-summary').getByRole('button', { name: 'ยืนยันการจอง' }).click();

    const errorBanner = page.getByTestId('booking-error-banner');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText('ช่วงเวลาที่เลือกไม่ว่างแล้ว');
    await expect(page.getByTestId('booking-confirmed-banner')).toHaveCount(0);
    // Must not leak Customer 2 ID or Booking ID
    const pageText = await page.locator('body').innerText();
    expect(pageText).not.toContain(customer2Id);
    expect(pageText).not.toContain(c2Booking.rows[0].id);
    // Availability list refreshes and removes the now-occupied slotConflictId
    await expect(page.locator(`[data-offer-slot-id="${slotConflictId}"]`)).toHaveCount(0);

    // Now test 422 BOOKING_NOT_ELIGIBLE response handling
    const offerCutoff = page.locator(`[data-offer-slot-id="${slotCutoffId}"]`);
    await openAvailabilityOffer(page, slotCutoffId);
    await expect(offerCutoff).toBeVisible();
    await offerCutoff.getByRole('button', { name: 'เลือกช่วงเวลานี้' }).click();

    await page.route('**/api/v1/customer/bookings', async route => {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'no-store' },
        body: JSON.stringify({
          error: {
            code: 'BOOKING_NOT_ELIGIBLE',
            message: 'Slot is no longer eligible for booking',
          },
          requestId: 'cutoff-422',
        }),
      });
    });

    await page.locator('#selected-offer-summary').getByRole('button', { name: 'ยืนยันการจอง' }).click();
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText('ใกล้เวลาเริ่มน้อยกว่า 60 นาที');
    await expect(page.getByTestId('booking-confirmed-banner')).toHaveCount(0);
  });

  test('BOOK-28 / BOOK-29 performs post-CSRF GET /auth/me binding recheck with A->B re-bootstrap recovery (when Session B is valid vs when Session is invalid), isolates Availability 200 from CSRF 503 with recovery, and suppresses late Booking POST response across logout or Session switch', async ({
    page,
  }) => {
    const slotLateId = await createOfferedSlot(tutorAId, '19:00');
    const slotCsrfRecoverId = await createOfferedSlot(tutorBId, '21:00');

    // 1. P2 / F-S1-03 §3 + F-S1-04 §3: When GET /api/v1/customer/availability returns 200 with offers
    //    but GET /api/v1/auth/csrf returns 503, offers MUST remain visible and selectable; only the
    //    booking confirmation button is disabled until "เตรียมการจองอีกครั้ง" recovers CSRF!
    let failCsrf = true;
    await page.route('**/api/v1/auth/csrf', async route => {
      if (failCsrf) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          headers: { 'Cache-Control': 'no-store' },
          body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'CSRF unavailable' } }),
        });
        return;
      }
      await route.continue();
    });

    await signIn(page, customer1Email);
    // Availability 200 offers must still render despite CSRF 503!
    const offerCsrf = page.locator(`[data-offer-slot-id="${slotCsrfRecoverId}"]`);
    await openAvailabilityOffer(page, slotCsrfRecoverId);
    await expect(offerCsrf).toBeVisible();
    await expect(page.locator('#availability-error')).toHaveCount(0);

    // Select the offer: confirm button is disabled and CSRF preparation error + retry button are shown
    await offerCsrf.getByRole('button', { name: 'เลือกช่วงเวลานี้' }).click();
    const summaryCsrf = page.locator('#selected-offer-summary');
    await expect(summaryCsrf).toBeVisible();
    await expect(page.getByTestId('booking-csrf-error')).toBeVisible();
    await expect(summaryCsrf.getByRole('button', { name: 'ยืนยันการจอง' })).toBeDisabled();

    // Recover CSRF via "เตรียมการจองอีกครั้ง" -> confirm button becomes enabled and booking succeeds (201)!
    failCsrf = false;
    await summaryCsrf.getByRole('button', { name: 'เตรียมการจองอีกครั้ง' }).click();
    await expect(page.getByTestId('booking-csrf-error')).toHaveCount(0);
    await expect(summaryCsrf.getByRole('button', { name: 'ยืนยันการจอง' })).toBeEnabled();
    await summaryCsrf.getByRole('button', { name: 'ยืนยันการจอง' }).click();
    await expect(page.getByTestId('booking-confirmed-banner')).toBeVisible();

    await page.unroute('**/api/v1/auth/csrf');
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();

    // 2. BOOK-28 (Case A: Synthetic header-mismatch UI test):
    //    When the post-CSRF GET /api/v1/auth/me returns a changed binding ('session-b-valid-binding'),
    //    the UI must discard the old token/state and restart identity/CSRF bootstrap (/auth/me -> /auth/csrf -> /auth/me)
    //    under Session B WITHOUT kicking the user to the login screen!
    let csrfCallsCaseA = 0;
    let meCallsWithSessionB = 0;
    let rebootstrapStarted = false;

    await page.route('**/api/v1/auth/csrf', async route => {
      csrfCallsCaseA++;
      await route.continue();
    });
    await page.route('**/api/v1/customer/availability', async route => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          ...(rebootstrapStarted ? { 'x-nuttiew-session-binding': 'session-b-valid-binding' } : {}),
        },
      });
    });
    await page.route('**/api/v1/auth/me', async route => {
      const response = await route.fetch();
      if (csrfCallsCaseA >= 1) {
        rebootstrapStarted = true;
        meCallsWithSessionB++;
        await route.fulfill({
          response,
          headers: {
            ...response.headers(),
            'x-nuttiew-session-binding': 'session-b-valid-binding',
          },
        });
        return;
      }
      await route.fulfill({ response });
    });

    await signIn(page, customer1Email, false);
    // Verify that post-CSRF /auth/me detected the A->B binding change, triggered re-bootstrap (csrfCallsCaseA >= 2, meCallsWithSessionB >= 3),
    // and kept Customer 1 signed in on the Availability screen with a working confirm button!
    await expect.poll(() => csrfCallsCaseA, { timeout: 5_000 }).toBeGreaterThanOrEqual(2);
    await expect.poll(() => meCallsWithSessionB, { timeout: 5_000 }).toBeGreaterThanOrEqual(3);
    await expect(page.getByRole('heading', { name: 'เลือกช่วงเวลาติว' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toHaveCount(0);

    const offerAfterRebootstrap = page.locator(`[data-offer-slot-id="${slotLateId}"]`);
    await openAvailabilityOffer(page, slotLateId);
    await expect(offerAfterRebootstrap).toBeVisible();
    await offerAfterRebootstrap.getByRole('button', { name: 'เลือกช่วงเวลานี้' }).click();
    await expect(
      page.locator('#selected-offer-summary').getByRole('button', { name: 'ยืนยันการจอง' }),
    ).toBeEnabled();

    await page.unroute('**/api/v1/auth/csrf');
    await page.unroute('**/api/v1/customer/availability');
    await page.unroute('**/api/v1/auth/me');

    // 3. BOOK-28 (Case B1: Indeterminate re-bootstrap failure — SESSION_BINDING_MISMATCH followed by /auth/me 503):
    //    Must hold the user in the Customer Session Guard screen (heading "ตรวจสอบสถานะเซสชัน", alert,
    //    and retry action "ตรวจสอบเซสชันอีกครั้ง") WITHOUT kicking the customer to the Login screen.
    //    Then clicking "ตรวจสอบเซสชันอีกครั้ง" with /auth/me recovering to 200 restores the Availability screen!
    let meFail503Once = true;
    await page.route('**/api/v1/customer/bookings', async route => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'no-store' },
        body: JSON.stringify({
          error: { code: 'SESSION_BINDING_MISMATCH', message: 'Session binding mismatch' },
          requestId: 'mismatch-then-503',
        }),
      });
    });
    await page.route('**/api/v1/auth/me', async route => {
      if (meFail503Once) {
        meFail503Once = false;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          headers: { 'Cache-Control': 'no-store' },
          body: JSON.stringify({
            error: { code: 'SERVICE_UNAVAILABLE', message: 'Auth service temporarily unavailable' },
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.locator('#selected-offer-summary').getByRole('button', { name: 'ยืนยันการจอง' }).click();

    // Verify guarded state: heading "ตรวจสอบสถานะเซสชัน", retry button present, NO login form shown!
    await expect(page.getByRole('heading', { name: 'ตรวจสอบสถานะเซสชัน' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ตรวจสอบเซสชันอีกครั้ง' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toHaveCount(0);

    // Click "ตรวจสอบเซสชันอีกครั้ง" -> /auth/me recovers to 200, returning to Availability screen!
    await page.getByRole('button', { name: 'ตรวจสอบเซสชันอีกครั้ง' }).click();
    await expect(page.getByRole('heading', { name: 'เลือกช่วงเวลาติว' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ตรวจสอบสถานะเซสชัน' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toHaveCount(0);

    await page.unroute('**/api/v1/customer/bookings');
    await page.unroute('**/api/v1/auth/me');

    // 4. BOOK-28 (Case B2: Binding mismatch followed by invalid Session 401 on re-bootstrap -> transitions to Login screen):
    await page.route('**/api/v1/customer/bookings', async route => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'no-store' },
        body: JSON.stringify({
          error: { code: 'SESSION_BINDING_MISMATCH', message: 'Session binding mismatch' },
          requestId: 'mismatch-then-401',
        }),
      });
    });
    await page.route('**/api/v1/auth/me', async route => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'no-store' },
        body: JSON.stringify({
          error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
        }),
      });
    });

    const offerForB2 = page.locator(`[data-offer-slot-id="${slotLateId}"]`);
    await openAvailabilityOffer(page, slotLateId);
    await expect(offerForB2).toBeVisible();
    await offerForB2.getByRole('button', { name: 'เลือกช่วงเวลานี้' }).click();
    await page.locator('#selected-offer-summary').getByRole('button', { name: 'ยืนยันการจอง' }).click();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();

    await page.unroute('**/api/v1/customer/bookings');
    await page.unroute('**/api/v1/auth/me');

    // 5. BOOK-29: Start a Booking POST under Session A, hold its 201 response, logout / switch session, then release A's late 201 -> never displayed!
    await signIn(page, customer1Email, false);
    const offerLate = page.locator(`[data-offer-slot-id="${slotLateId}"]`);
    await openAvailabilityOffer(page, slotLateId);
    await expect(offerLate).toBeVisible();
    await offerLate.getByRole('button', { name: 'เลือกช่วงเวลานี้' }).click();

    let postCaptured!: () => void;
    const postInFlight = new Promise<void>(resolve => {
      postCaptured = resolve;
    });
    let releaseLatePost!: () => void;
    const holdLatePost = new Promise<void>(resolve => {
      releaseLatePost = resolve;
    });
    let latePostDelivered!: () => void;
    const lateDelivered = new Promise<void>(resolve => {
      latePostDelivered = resolve;
    });
    const fakeSecretBookingId = randomUUID();

    await page.route('**/api/v1/customer/bookings', async route => {
      postCaptured();
      await holdLatePost;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'no-store' },
        body: JSON.stringify({
          data: {
            id: fakeSecretBookingId,
            slotId: slotLateId,
            startsAt: new Date(Date.now() + 86_400_000).toISOString(),
            endsAt: new Date(Date.now() + 90_000_000).toISOString(),
            status: 'Booked',
          },
          meta: { requestId: 'late-post-a' },
        }),
      });
      latePostDelivered();
    });

    await page.locator('#selected-offer-summary').getByRole('button', { name: 'ยืนยันการจอง' }).click();
    await postInFlight;

    // Logout Session A and sign in as Customer 2 (Session B) while Session A's POST is still in flight
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
    await signIn(page, customer2Email, false);
    await expect(page.getByRole('heading', { name: 'เลือกช่วงเวลาติว' })).toBeVisible();

    // Deliver Session A's late 201 response while Customer 2 is active
    releaseLatePost();
    await lateDelivered;
    await page.evaluate(
      () => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    );

    // Session A's Booking ID and confirmation banner must NEVER appear under Session B!
    await expect(page.getByTestId('booking-confirmed-banner')).toHaveCount(0);
    const bodyAfterLate = await page.locator('body').innerText();
    expect(bodyAfterLate).not.toContain(fakeSecretBookingId);
  });
});
