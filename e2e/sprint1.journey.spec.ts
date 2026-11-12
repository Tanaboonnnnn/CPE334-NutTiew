import { test, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { expandDayTimeGroupAndLocateOffer } from './availability-calendar-helper';
loadEnv({ path: '.env', quiet: true });

const evidenceDir = resolve(process.cwd(), 'docs/evidence/sprint1');
if (!existsSync(evidenceDir)) {
  mkdirSync(evidenceDir, { recursive: true });
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const tag = randomBytes(6).toString('hex');
const password = 'JourneyPassword#2026';

const tutorEmail = `journey-tutor-${tag}@example.test`;
const customer1Email = `journey-cust1-${tag}@example.test`;
const customer2Email = `journey-cust2-${tag}@example.test`;

let tutorId = '';
let customer1Id = '';
let customer2Id = '';

const bangkokDayKey = (offsetDays: number): string =>
  new Date(Date.now() + offsetDays * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
const bangkokInstant = (dayKey: string, hhmm: string): Date =>
  new Date(`${dayKey}T${hhmm}:00.000+07:00`);

const futureDay = bangkokDayKey(20); // 20 days ahead
const slotStartTime = '14:00';
let createdBookingId = '';

test.beforeAll(async () => {
  const hash = await argon2.hash(password);
  const t = await pool.query<{ id: string }>(
    'INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,\'Tutor\') RETURNING "id"',
    [tutorEmail, hash],
  );
  tutorId = t.rows[0].id;

  const c1 = await pool.query<{ id: string }>(
    'INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,\'Customer\') RETURNING "id"',
    [customer1Email, hash],
  );
  customer1Id = c1.rows[0].id;

  const c2 = await pool.query<{ id: string }>(
    'INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,\'Customer\') RETURNING "id"',
    [customer2Email, hash],
  );
  customer2Id = c2.rows[0].id;
});

test.afterAll(async () => {
  await pool
    .query('UPDATE "User" SET "isActive"=false WHERE "id" = ANY($1::uuid[])', [
      [tutorId, customer1Id, customer2Id].filter(Boolean),
    ])
    .catch(() => {});
  await pool.end();
});

async function signIn(page: Page, email: string) {
  const h = randomBytes(12).toString('hex');
  await page.setExtraHTTPHeaders({
    'X-Forwarded-For': `2001:db8:${h.slice(0, 4)}:${h.slice(4, 8)}:${h.slice(8, 12)}::j`,
  });
  await page.goto('/');
  await page.getByLabel('อีเมล').fill(email);
  await page.getByLabel('รหัสผ่าน').fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page.getByText('เข้าสู่ระบบแล้ว')).toBeVisible();
}

async function signOut(page: Page) {
  const logoutBtn = page.getByRole('button', { name: 'ออกจากระบบ' });
  await logoutBtn.click();
  await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
}

test.describe('Sprint 1 End-to-End Vertical Journey (F-S1-01..05)', () => {
  test.use({
    viewport: { width: 1280, height: 900 },
    timezoneId: 'Asia/Bangkok',
  });

  test('Vertical Domain Journey: Tutor Slot Creation -> Customer Browse & Booking -> Customer Private Retrieval & Detail Modal -> Tutor Schedule Occupancy & Pseudonymous Ref -> Negative Conflict & Cross-Customer Protection', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // -------------------------------------------------------------
    // Step 1: Tutor logs in and creates a 60-minute Slot via UI form
    // -------------------------------------------------------------
    await signIn(page, tutorEmail);
    await expect(page.getByRole('heading', { name: 'ตารางเวลาติวของฉัน' })).toBeVisible();

    // Fill slot form (date 20 days ahead, 14:00)
    await page.getByLabel('วันที่').fill(futureDay);
    await page.getByLabel('เวลาเริ่ม').fill(slotStartTime);

    // End time preview is automatically 15:00
    await expect(page.getByRole('status', { name: 'เวลาสิ้นสุด' })).toHaveText('15:00');

    // Click submit and capture created slot ID
    const [createSlotRes] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/v1/tutor/slots') && res.request().method() === 'POST'),
      page.getByRole('button', { name: 'เพิ่มเวลาติว' }).click(),
    ]);
    expect(createSlotRes.status()).toBe(201);
    const slotJson = await createSlotRes.json();
    const createdSlotId = slotJson.data.id;
    await expect(page.getByText('บันทึกเวลาติวสำเร็จ')).toBeVisible();

    // Verify slot appears in list / calendar
    await expect(page.getByRole('list', { name: 'Slot ทั้งหมดของฉัน' }).getByText(slotStartTime)).toBeVisible();

    // Screenshot 1: Tutor slot created
    await page.screenshot({
      path: resolve(evidenceDir, '01-tutor-slot-created.png'),
      fullPage: true,
    });

    // Tutor logs out
    await signOut(page);

    // -------------------------------------------------------------
    // Step 2: Customer logs in and browses available slots
    // -------------------------------------------------------------
    await signIn(page, customer1Email);
    await expect(page.getByRole('heading', { name: 'เลือกช่วงเวลาติว' })).toBeVisible();

    // Verify available slot card appears inside selected calendar day & expanded time group
    const slotCard = await expandDayTimeGroupAndLocateOffer(page, futureDay, createdSlotId, slotStartTime);
    await slotCard.scrollIntoViewIfNeeded();
    await expect(slotCard).toBeVisible();
    await expect(slotCard.getByRole('button', { name: 'เลือกช่วงเวลานี้' })).toBeVisible();

    // Screenshot 2: Customer availability browse
    await page.screenshot({
      path: resolve(evidenceDir, '02-customer-availability-browse.png'),
      fullPage: true,
    });

    // -------------------------------------------------------------
    // Step 3: Customer books the slot and confirms
    // -------------------------------------------------------------
    await slotCard.getByRole('button', { name: 'เลือกช่วงเวลานี้' }).click();

    // Review summary surface appears
    const summary = page.locator('#selected-offer-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(slotStartTime);

    // Confirm booking
    await summary.getByRole('button', { name: 'ยืนยันการจอง' }).click();

    // Green confirmed banner appears
    const confirmedBanner = page.getByTestId('booking-confirmed-banner');
    await expect(confirmedBanner).toBeVisible();
    await expect(confirmedBanner).toContainText('จองสำเร็จ');

    const bookingIdEl = page.getByTestId('confirmed-booking-id');
    await expect(bookingIdEl).toBeVisible();
    createdBookingId = (await bookingIdEl.innerText()).trim();
    expect(createdBookingId).toMatch(/^[0-9a-f-]{36}$/i);

    // Screenshot 3: Customer booking confirmed
    await page.screenshot({
      path: resolve(evidenceDir, '03-customer-booking-confirmed.png'),
      fullPage: true,
    });

    // -------------------------------------------------------------
    // Step 4: Customer navigates to "การจองของฉัน" (Private Retrieval)
    // -------------------------------------------------------------
    const myBookingsNav = page.getByTestId('nav-my-bookings');
    await myBookingsNav.click();

    await expect(page.getByRole('heading', { name: 'การจองของฉัน' })).toBeVisible();

    const bookingItem = page.locator(`[data-booking-id="${createdBookingId}"]`);
    await expect(bookingItem).toBeVisible();
    await expect(bookingItem).toContainText('ยืนยันแล้ว');
    await expect(bookingItem).toContainText(slotStartTime);
    await expect(bookingItem).toContainText('15:00');

    // Screenshot 4: Customer private bookings list
    await page.screenshot({
      path: resolve(evidenceDir, '04-customer-private-bookings.png'),
      fullPage: true,
    });

    // -------------------------------------------------------------
    // Step 5: Customer opens booking detail modal
    // -------------------------------------------------------------
    const detailBtn = bookingItem.getByTestId('view-booking-detail');
    await detailBtn.click();

    const modalDialog = page.locator('[role="dialog"]');
    await expect(modalDialog).toBeVisible();
    await expect(modalDialog.getByRole('heading', { name: 'รายละเอียดการจอง' })).toBeVisible();
    await expect(modalDialog).toContainText(createdBookingId);
    await expect(modalDialog.getByTestId('detail-status-badge')).toContainText('ยืนยันแล้ว');

    // Screenshot 5: Customer booking detail modal
    await page.screenshot({
      path: resolve(evidenceDir, '05-customer-detail-modal.png'),
      fullPage: true,
    });

    // Dismiss modal via close button
    const closeBtn = page.getByTestId('close-detail-btn');
    await closeBtn.click();
    await expect(modalDialog).not.toBeVisible();

    // Customer logs out
    await signOut(page);

    // -------------------------------------------------------------
    // Step 6: Tutor logs back in and checks schedule view (Occupied + customerRef)
    // -------------------------------------------------------------
    await signIn(page, tutorEmail);
    await expect(page.getByRole('heading', { name: 'ตารางเวลาติวของฉัน' })).toBeVisible();

    // In agenda / calendar view: slot displays occupied badge
    const tutorBookingRow = page.locator(`[data-booking-id="${createdBookingId}"]`);
    await expect(tutorBookingRow).toBeVisible();
    await expect(tutorBookingRow.getByTestId('tutor-booking-status-badge')).toContainText('มีนัดหมาย (Booked)');

    // Customer ref is pseudonymous (CUST-...) with ZERO PII (no customer email or full name)
    const custRef = tutorBookingRow.getByTestId('tutor-booking-customer-ref');
    await expect(custRef).toBeVisible();
    const custRefText = (await custRef.innerText()).trim();
    expect(custRefText).toMatch(/^CUST-[0-9a-f]{8}$/i);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain(customer1Email);
    expect(bodyText).not.toContain(customer1Id);

    // Screenshot 6: Tutor schedule occupied with pseudonymous customerRef
    await page.screenshot({
      path: resolve(evidenceDir, '06-tutor-schedule-occupied.png'),
      fullPage: true,
    });

    // Tutor logs out
    await signOut(page);

    // -------------------------------------------------------------
    // Step 7: Negative Conflict (409) - Customer 2 tries to book occupied slot
    // -------------------------------------------------------------
    // To demonstrate rejection with authentic UI error presentation:
    // Create a new slot, Customer 2 selects it in UI, but in background Customer 1 books it.
    // When Customer 2 confirms, backend returns 409 Conflict.
    const raceDay = bangkokDayKey(21);
    const raceStart = bangkokInstant(raceDay, '13:00');
    const raceEnd = new Date(raceStart.getTime() + 3_600_000);

    const raceSlot = await pool.query<{ id: string }>(
      'INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle") VALUES($1,$2,$3,\'Offered\') RETURNING "id"',
      [tutorId, raceStart, raceEnd],
    );
    const raceSlotId = raceSlot.rows[0].id;

    await signIn(page, customer2Email);
    await expect(page.getByRole('heading', { name: 'เลือกช่วงเวลาติว' })).toBeVisible();

    const raceOffer = await expandDayTimeGroupAndLocateOffer(page, raceDay, raceSlotId, '13:00');
    await raceOffer.scrollIntoViewIfNeeded();
    await expect(raceOffer).toBeVisible();
    await raceOffer.getByRole('button', { name: 'เลือกช่วงเวลานี้' }).click();

    // Customer 1 books raceSlotId in database before Customer 2 clicks confirm
    await pool.query(
      'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt","status") VALUES($1,$2,$3,$4,\'Booked\')',
      [customer1Id, raceSlotId, raceStart, raceEnd],
    );

    // Customer 2 attempts to confirm booking
    await page.locator('#selected-offer-summary').getByRole('button', { name: 'ยืนยันการจอง' }).click();

    // 409 Conflict error banner appears
    const errorBanner = page.getByTestId('booking-error-banner');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText('ช่วงเวลาที่เลือกไม่ว่างแล้ว');

    // Screenshot 7: Negative conflict 409
    await page.screenshot({
      path: resolve(evidenceDir, '07-negative-conflict-409.png'),
      fullPage: true,
    });

    // -------------------------------------------------------------
    // Step 8: Negative Cross-Customer Protection (404)
    // -------------------------------------------------------------
    // Customer 2 attempts to query Customer 1's booking via API:
    // Backend MUST respond with 404 BOOKING_NOT_FOUND to prevent enumeration
    const crossRes = await page.request.get(`/api/v1/customer/bookings/${createdBookingId}`);
    expect(crossRes.status()).toBe(404);
    const crossJson = await crossRes.json();
    expect(crossJson.error.code).toBe('BOOKING_NOT_FOUND');

    // Customer 2 views "การจองของฉัน": Customer 1's booking is absent
    await page.getByTestId('nav-my-bookings').click();
    await expect(page.getByRole('heading', { name: 'การจองของฉัน' })).toBeVisible();
    await expect(page.locator(`[data-booking-id="${createdBookingId}"]`)).toHaveCount(0);

    // Screenshot 8: Negative cross-customer protection
    await page.screenshot({
      path: resolve(evidenceDir, '08-negative-cross-customer-404.png'),
      fullPage: true,
    });
  });
});
