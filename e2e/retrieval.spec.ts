import { test, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env', quiet: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const tag = randomBytes(6).toString('hex');
const password = 'RetrievalE2EPassword#2026';

const tutorEmail = `ret-e2e-tutor-${tag}@example.test`;
const customer1Email = `ret-e2e-c1-${tag}@example.test`;
const customer2Email = `ret-e2e-c2-${tag}@example.test`;

let tutorId = '';
let customer1Id = '';
let customer2Id = '';

let futureSlotId = '';
let pastSlotId = '';
let openSlotId = '';

let futureBookingId = '';
let pastBookingId = '';

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

  // Create 3 Slots for Tutor:
  // 1. Future slot (e.g. 5 days ahead)
  const futureStart = new Date(Date.now() + 5 * 86_400_000);
  futureStart.setMinutes(0, 0, 0);
  const futureEnd = new Date(futureStart.getTime() + 3_600_000);

  const s1 = await pool.query<{ id: string }>(
    'INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle") VALUES($1,$2,$3,\'Offered\') RETURNING "id"',
    [tutorId, futureStart, futureEnd],
  );
  futureSlotId = s1.rows[0].id;

  // 2. Past slot (e.g. 2 days ago)
  const pastStart = new Date(Date.now() - 2 * 86_400_000);
  pastStart.setMinutes(0, 0, 0);
  const pastEnd = new Date(pastStart.getTime() + 3_600_000);

  const s2 = await pool.query<{ id: string }>(
    'INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle") VALUES($1,$2,$3,\'Offered\') RETURNING "id"',
    [tutorId, pastStart, pastEnd],
  );
  pastSlotId = s2.rows[0].id;

  // 3. Open unoccupied future slot (e.g. 6 days ahead)
  const openStart = new Date(Date.now() + 6 * 86_400_000);
  openStart.setMinutes(0, 0, 0);
  const openEnd = new Date(openStart.getTime() + 3_600_000);

  const s3 = await pool.query<{ id: string }>(
    'INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle") VALUES($1,$2,$3,\'Offered\') RETURNING "id"',
    [tutorId, openStart, openEnd],
  );
  openSlotId = s3.rows[0].id;

  // Create Bookings for Customer 1:
  // Booking 1: Future slot
  const b1 = await pool.query<{ id: string }>(
    'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt","status") VALUES($1,$2,$3,$4,\'Booked\') RETURNING "id"',
    [customer1Id, futureSlotId, futureStart, futureEnd],
  );
  futureBookingId = b1.rows[0].id;

  // Booking 2: Past slot (disable trigger temporarily for test fixture)
  await pool.query('ALTER TABLE "Booking" DISABLE TRIGGER USER');
  try {
    const b2 = await pool.query<{ id: string }>(
      'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt","status") VALUES($1,$2,$3,$4,\'Booked\') RETURNING "id"',
      [customer1Id, pastSlotId, pastStart, pastEnd],
    );
    pastBookingId = b2.rows[0].id;
  } finally {
    await pool.query('ALTER TABLE "Booking" ENABLE TRIGGER USER');
  }
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
    'X-Forwarded-For': `2001:db8:${h.slice(0, 4)}:${h.slice(4, 8)}:${h.slice(8, 12)}::d`,
  });
  await page.goto('/');
  await page.getByLabel('อีเมล').fill(email);
  await page.getByLabel('รหัสผ่าน').fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page.getByText('เข้าสู่ระบบแล้ว')).toBeVisible();
}

test.describe('F-S1-05 Booking Retrieval and Schedule View E2E (RET-15 & RET-16)', () => {
  test.use({ timezoneId: 'America/Los_Angeles' }); // Ensure browser timezone does not leak into Bangkok UI

  test('RET-15: Customer views private bookings list, Bangkok formatting, upcoming/past badges, opens and dismisses modal with Escape and Close button, handles empty state', async ({
    page,
  }) => {
    await signIn(page, customer1Email);

    // Navigate to "การจองของฉัน"
    const myBookingsNav = page.locator('[data-testid="nav-my-bookings"]');
    await expect(myBookingsNav).toBeVisible();
    await myBookingsNav.click();

    // Section is visible
    const bookingsSection = page.locator('#customer-bookings-section');
    await expect(bookingsSection).toBeVisible();

    // Check list has both bookings
    const bookingsList = page.locator('[data-testid="customer-bookings-list"]');
    await expect(bookingsList).toBeVisible();

    const futureCard = page.locator(`[data-booking-id="${futureBookingId}"]`);
    await expect(futureCard).toBeVisible();
    // Future booking badge: "ยืนยันแล้ว" with .badge-booked
    const futureBadge = futureCard.locator('[data-testid="customer-booking-status-badge"]');
    await expect(futureBadge).toHaveText('ยืนยันแล้ว');
    await expect(futureBadge).toHaveClass(/badge-booked/);

    const pastCard = page.locator(`[data-booking-id="${pastBookingId}"]`);
    await expect(pastCard).toBeVisible();
    // Past booking badge: "สิ้นสุดแล้ว" with .badge-past
    const pastBadge = pastCard.locator('[data-testid="customer-booking-status-badge"]');
    await expect(pastBadge).toHaveText('สิ้นสุดแล้ว');
    await expect(pastBadge).toHaveClass(/badge-past/);

    // Verify Bangkok wall-clock time string appears
    await expect(futureCard.locator('.booking-time-interval')).toContainText('Asia/Bangkok');
    await expect(pastCard.locator('.booking-time-interval')).toContainText('Asia/Bangkok');

    // Open detail modal for future booking
    const viewDetailBtn = futureCard.locator('[data-testid="view-booking-detail"]');
    await viewDetailBtn.click();

    // Modal is displayed
    const modal = page.locator('#customer-booking-detail-modal');
    await expect(modal).toBeVisible();
    await expect(page.locator('[data-testid="detail-booking-id"]')).toHaveText(futureBookingId);
    await expect(page.locator('[data-testid="detail-status-badge"]')).toHaveText('ยืนยันแล้ว');

    // Dismiss modal with Escape key
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();

    // Open detail modal for past booking
    const pastDetailBtn = pastCard.locator('[data-testid="view-booking-detail"]');
    await pastDetailBtn.click();
    await expect(modal).toBeVisible();
    await expect(page.locator('[data-testid="detail-booking-id"]')).toHaveText(pastBookingId);
    await expect(page.locator('[data-testid="detail-status-badge"]')).toHaveText('สิ้นสุดแล้ว');

    // Dismiss modal with close button
    const closeBtn = page.locator('[data-testid="close-detail-btn"]');
    await closeBtn.click();
    await expect(modal).toBeHidden();

    // Sign out Customer 1
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByLabel('อีเมล')).toBeVisible();

    // Sign in Customer 2 (who has 0 bookings)
    await signIn(page, customer2Email);
    await page.locator('[data-testid="nav-my-bookings"]').click();

    // Verifies empty state message and button
    await expect(page.getByText('คุณยังไม่มีประวัติการจองติว')).toBeVisible();
    const browseBtn = page.locator('[data-testid="empty-browse-availability-btn"]');
    await expect(browseBtn).toBeVisible();

    // Clicking browse button returns to availability tab
    await browseBtn.click();
    await expect(page.locator('#availability-heading')).toBeVisible();
  });

  test('RET-16: Tutor views dynamic occupancy badges and schedule bookings list; Customer B cannot see Customer A bookings or retrieve via API (safe 404)', async ({
    page,
  }) => {
    // 1. Tutor logs in
    await signIn(page, tutorEmail);

    // Tutor Agenda occupancy checks
    const occupiedSlotRow = page.locator(`[data-slot-id="${futureSlotId}"]`);
    await expect(occupiedSlotRow).toBeVisible();
    await expect(occupiedSlotRow.locator('[data-testid="slot-occupancy-badge"]')).toHaveText(/มีผู้จองแล้ว \(Occupied\)/);
    await expect(occupiedSlotRow.locator('[data-testid="slot-occupancy-badge"]')).toHaveClass(/badge-occupied/);

    const unoccupiedSlotRow = page.locator(`[data-slot-id="${openSlotId}"]`);
    await expect(unoccupiedSlotRow).toBeVisible();
    await expect(unoccupiedSlotRow.locator('[data-testid="slot-occupancy-badge"]')).toHaveText(/ว่าง \(เปิดรับจอง\)/);
    await expect(unoccupiedSlotRow.locator('[data-testid="slot-occupancy-badge"]')).toHaveClass(/badge-unoccupied/);

    // Tutor Schedule Bookings list checks
    const scheduleSection = page.locator('#tutor-schedule-bookings-section');
    await expect(scheduleSection).toBeVisible();

    const futureScheduleItem = scheduleSection.locator(`[data-booking-id="${futureBookingId}"]`);
    await expect(futureScheduleItem).toBeVisible();
    const customerRef = futureScheduleItem.locator('[data-testid="tutor-booking-customer-ref"]');
    const expectedRef = 'CUST-' + customer1Id.slice(0, 8);
    await expect(customerRef).toHaveText(expectedRef);

    // Ensure raw customer email or full UUID is NOT displayed in schedule section
    await expect(scheduleSection).not.toContainText(customer1Email);

    // Sign out Tutor
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByLabel('อีเมล')).toBeVisible();

    // 2. Customer B logs in (Negative Privacy Isolation)
    await signIn(page, customer2Email);
    await page.locator('[data-testid="nav-my-bookings"]').click();

    // Customer A's bookings must NOT be in Customer B's list
    await expect(page.locator(`[data-booking-id="${futureBookingId}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-booking-id="${pastBookingId}"]`)).toHaveCount(0);

    // Direct API probe from Customer B's session to Customer A's booking
    const probeResult = await page.evaluate(async (bookingId) => {
      const res = await fetch(`/api/v1/customer/bookings/${bookingId}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, body: data };
    }, futureBookingId);

    // Must return safe 404 BOOKING_NOT_FOUND, zero disclosure
    expect(probeResult.status).toBe(404);
    expect(probeResult.body.error).toEqual({
      code: 'BOOKING_NOT_FOUND',
      message: 'Booking not found',
    });
    expect(typeof probeResult.body.requestId).toBe('string');
  });
});
