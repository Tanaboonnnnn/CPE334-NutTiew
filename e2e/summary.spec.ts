import { test, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env', quiet: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let tutorEmail = '';
let tutorEmptyEmail = '';
let customerEmail = '';
const password = 'SummaryE2E#2026';

let tutorId = '';
let customerId = '';
let pastBookingId = '';

// Yesterday 14:00-15:00 Asia/Bangkok (07:00-08:00 UTC)
const yesterdayBangkok = new Date(Date.now() - 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
const pastStart = new Date(yesterdayBangkok + 'T14:00:00.000+07:00');
const pastEnd = new Date(pastStart.getTime() + 3_600_000);

async function assertDisposableTestDatabase(db: Pick<Pool, 'query'>): Promise<void> {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error('Refusing E2E summary fixtures: DATABASE_URL is not set');
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Refusing E2E summary fixtures: invalid DATABASE_URL');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(`Refusing E2E summary fixtures: unsupported DATABASE_URL protocol "${parsed.protocol}"`);
  }
  const host = parsed.hostname.toLowerCase();
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
  const dbName = parsed.pathname.replace(/^\/+/, '');
  if (!isLoopback || !/(_ci|_test)$/i.test(dbName)) {
    throw new Error(`Refusing E2E summary fixtures against non-disposable database "${dbName}" on "${host}"`);
  }
  const res = await db.query<{ db: string }>('SELECT current_database() AS db');
  const liveDb = res.rows[0]?.db ?? '';
  if (liveDb !== dbName || !/(_ci|_test)$/i.test(liveDb)) {
    throw new Error(`Refusing E2E summary fixtures: live database "${liveDb}" is not an allowed disposable test DB`);
  }
}

test.beforeEach(async () => {
  await assertDisposableTestDatabase(pool);
  // Each test gets its own Tutor, Customer and bookings (never count rows from another case).
  const tag = randomBytes(8).toString('hex');
  tutorEmail = 'summary-t-' + tag + '@example.test';
  tutorEmptyEmail = 'summary-te-' + tag + '@example.test';
  customerEmail = 'summary-c-secret-' + tag + '@example.test';
  const hash = await argon2.hash(password);
  const users = await pool.query<{ id: string; role: string; email: string }>(
    'INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3),($4,$5,$6),($7,$8,$9) RETURNING "id","role","email"',
    [tutorEmail, hash, 'Tutor', tutorEmptyEmail, hash, 'Tutor', customerEmail, hash, 'Customer'],
  );
  tutorId = users.rows.find(u => u.email === tutorEmail)!.id;
  customerId = users.rows.find(u => u.email === customerEmail)!.id;

  const client = await pool.connect();
  try {
    await assertDisposableTestDatabase(client);
    await client.query('BEGIN');
    const slot = await client.query<{ id: string }>(
      'INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle") VALUES($1,$2,$3,\'Offered\') RETURNING "id"',
      [tutorId, pastStart, pastEnd],
    );
    await client.query('ALTER TABLE public."Booking" DISABLE TRIGGER booking_s2_row_guard');
    const booking = await client.query<{ id: string }>(
      'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt","status") VALUES($1,$2,$3,$4,\'Booked\') RETURNING "id"',
      [customerId, slot.rows[0].id, pastStart, pastEnd],
    );
    await client.query('ALTER TABLE public."Booking" ENABLE TRIGGER booking_s2_row_guard');
    await client.query('COMMIT');
    pastBookingId = booking.rows[0].id;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

test.afterAll(async () => {
  await pool.end();
});

async function signIn(page: Page, email: string) {
  const h = randomBytes(12).toString('hex');
  await page.setExtraHTTPHeaders({
    'X-Forwarded-For': '2001:db8:' + h.slice(0, 4) + ':' + h.slice(4, 8) + ':' + h.slice(8, 12) + '::5',
  });
  await page.goto('/');
  await page.getByLabel('อีเมล').fill(email);
  await page.getByLabel('รหัสผ่าน').fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page.getByText('เข้าสู่ระบบแล้ว')).toBeVisible();
}

async function cancelBooking(page: Page, actor: 'customer' | 'tutor', id: string, data: object) {
  const me = await page.request.get('/api/v1/auth/me');
  const csrf = await page.request.get('/api/v1/auth/csrf');
  expect(me.status()).toBe(200);
  expect(csrf.status()).toBe(200);
  const result = await page.request.post('/api/v1/' + actor + '/bookings/' + id + '/cancel', {
    headers: {
      Origin: new URL(page.url()).origin,
      'X-CSRF-Token': (await csrf.json()).csrfToken,
      'X-NutTiew-Expected-Session-Binding': me.headers()['x-nuttiew-session-binding'],
    },
    data,
  });
  expect(result.status()).toBe(200);
  return (await result.json()).data.cancelledAt as string;
}

test.describe('F-S3-01 SUM-08 — Tutor Past Booked Summary E2E (non-Bangkok browser)', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('SUM-08 renders Past Booked count/list in Asia/Bangkok, persists across reload, and denies Customer', async ({ page }) => {
    await signIn(page, tutorEmail);

    const section = page.getByTestId('tutor-appointment-summary');
    await expect(section).toBeVisible();
    await expect(section.getByRole('heading', { name: 'สรุปนัดหมายผู้สอน' })).toBeVisible();
    await expect(section.getByTestId('tutor-summary-past-count')).toContainText('นัดหมายที่ผ่านมาแล้ว (Past Booked): 1 รายการ');
    await expect(section.getByTestId('tutor-summary-evaluated-at')).toContainText('(Asia/Bangkok)');

    const items = section.getByTestId('tutor-summary-past-item');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('14:00');
    await expect(items.first()).toContainText('15:00');
    await expect(items.first()).toContainText('(Asia/Bangkok)');
    await expect(items.first()).toContainText('CUST-' + customerId.slice(0, 8));
    await expect(items.first()).toContainText(pastBookingId);
    await expect(items.first().getByTestId('tutor-summary-status-badge')).toHaveText('สิ้นสุดแล้ว (Past)');

    // Never display Completed or Customer email
    await expect(section).not.toContainText('Completed');
    await expect(section).not.toContainText('เสร็จสมบูรณ์');
    await expect(section).not.toContainText(customerEmail);

    // Manual refresh works
    await section.getByTestId('refresh-tutor-summary').click();
    await expect(section.getByTestId('tutor-summary-past-count')).toContainText('1 รายการ');
    await expect(items).toHaveCount(1);

    // Persists across full browser reload
    await page.reload();
    await expect(page.getByTestId('tutor-summary-past-count')).toContainText('นัดหมายที่ผ่านมาแล้ว (Past Booked): 1 รายการ');
    await expect(page.getByTestId('tutor-summary-past-item')).toHaveCount(1);
    await expect(page.getByTestId('tutor-summary-past-item').first()).toContainText(pastBookingId);

    // Sign out and verify Customer cannot see summary UI or call API
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();

    await signIn(page, customerEmail);
    await expect(page.getByTestId('tutor-appointment-summary')).toHaveCount(0);
    const apiStatus = await page.evaluate(async () => {
      const r = await fetch('/api/v1/tutor/summary', { credentials: 'same-origin' });
      return r.status;
    });
    expect(apiStatus).toBe(403);
  });

  test('SUM-08b renders explicit empty state (0 rows) and error/retry recovery without fabricating 0 counts', async ({ page }) => {
    // 1. Empty state for Tutor with zero past bookings
    await signIn(page, tutorEmptyEmail);
    const section = page.getByTestId('tutor-appointment-summary');
    await expect(section.getByTestId('tutor-summary-past-count')).toContainText('นัดหมายที่ผ่านมาแล้ว (Past Booked): 0 รายการ');
    await expect(section.getByTestId('tutor-summary-empty')).toHaveText('ยังไม่มีนัดหมายที่ผ่านมาแล้ว');
    await expect(section.getByTestId('tutor-summary-evaluated-at')).toContainText('(Asia/Bangkok)');
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();

    // 2. Error + retry state on transient 503 without fabricating 0 count
    let permitSuccessfulGet = false;
    await page.route('**/api/v1/tutor/summary', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      // React StrictMode may abort and reissue the initial GET on mount; keep 503
      // active until the user explicitly triggers the retry action.
      if (!permitSuccessfulGet) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' }, requestId: 'test-503' }),
        });
        return;
      }
      await route.continue();
    });

    await signIn(page, tutorEmail);
    await expect(page.getByTestId('tutor-summary-error')).toBeVisible();
    await expect(page.getByTestId('tutor-summary-error')).toContainText('ไม่สามารถโหลดสรุปนัดหมายได้');
    await expect(page.getByTestId('tutor-summary-past-count')).toHaveCount(0);

    permitSuccessfulGet = true;
    await page.getByRole('button', { name: 'ลองโหลดสรุปอีกครั้ง' }).click();
    await expect(page.getByTestId('tutor-summary-past-count')).toContainText('นัดหมายที่ผ่านมาแล้ว (Past Booked): 1 รายการ');
    await expect(page.getByTestId('tutor-summary-past-item')).toHaveCount(1);
    await expect(page.getByTestId('tutor-summary-past-item').first()).toContainText(pastBookingId);
  });
});

test.describe('F-S3-01 SUM-10 — #147 Cancelled slice', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('renders real customer and tutor cancellations, Bangkok time, privacy, and reload persistence', async ({ page }) => {
    const day = new Date(Date.now() + 14 * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
    const book = async (hour: string) => {
      const start = new Date(day + 'T' + hour + ':00:00.000+07:00');
      const end = new Date(start.getTime() + 3_600_000);
      const slot = await pool.query<{ id: string }>(
        'INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle") VALUES($1,$2,$3,\'Offered\') RETURNING "id"',
        [tutorId, start, end],
      );
      const booking = await pool.query<{ id: string }>(
        'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt","status") VALUES($1,$2,$3,$4,\'Booked\') RETURNING "id"',
        [customerId, slot.rows[0].id, start, end],
      );
      return booking.rows[0].id;
    };
    const customerBooking = await book('14');
    const tutorBooking = await book('16');
    const privateReason = 'PRIVATE_E2E_CANCELLATION_147';


    await signIn(page, tutorEmptyEmail);
    const section = page.getByTestId('tutor-appointment-summary');
    await expect(section.getByTestId('tutor-summary-cancelled-count')).toContainText('0 รายการ');
    await expect(section.getByTestId('tutor-summary-cancelled-empty')).toHaveText('ยังไม่มีนัดหมายที่ถูกยกเลิก');
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();

    await signIn(page, customerEmail);
    const customerTime = await cancelBooking(page, 'customer', customerBooking, {});
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();

    await signIn(page, tutorEmail);
    const tutorTime = await cancelBooking(page, 'tutor', tutorBooking, { reason: privateReason });
    await page.reload();
    await expect(section.getByRole('heading', { name: 'นัดหมายที่ยกเลิกแล้ว (Cancelled): 2 รายการ' })).toBeVisible();
    const rows = section.getByRole('list', { name: 'รายการนัดหมายที่ยกเลิกแล้ว' }).getByRole('listitem');
    await expect(rows).toHaveCount(2);
    const bangkokTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    for (const [index, id, actorLabel, start, timestamp] of [
      [0, tutorBooking, 'ผู้สอนยกเลิก', '16:00', tutorTime],
      [1, customerBooking, 'ผู้เรียนยกเลิก', '14:00', customerTime],
    ] as const) {
      const row = rows.nth(index);
      await expect(row).toContainText(id);
      await expect(row).toContainText(actorLabel);
      await expect(row).toContainText(start);
      await expect(row).toContainText('Asia/Bangkok');
      const cancelledAt = row.getByTestId('tutor-summary-cancelled-at');
      await expect(cancelledAt).toHaveAttribute('datetime', timestamp);
      await expect(cancelledAt).toContainText(bangkokTime.format(new Date(timestamp)));
    }
    await expect(section).not.toContainText(privateReason);
    await expect(section).not.toContainText(customerEmail);
    await expect(section).not.toContainText(customerId);
  });
});

test.describe('F-S3-01 SUM-10 — #148 integrated four-category summary (OD-006 Option 1)', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('renders all four server-classified categories together, in Asia/Bangkok, with isolation and refresh recovery', async ({ page }) => {
    // 1. Seed one Upcoming Booked (10 days ahead, 10:00-11:00 Asia/Bangkok) and one In-Progress Booked (now - 20m .. now + 40m)
    const upcomingDay = new Date(Date.now() + 10 * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
    const upcomingStart = new Date(upcomingDay + 'T10:00:00.000+07:00');
    const upcomingEnd = new Date(upcomingStart.getTime() + 3_600_000);

    const nowRoundedMin = Math.floor(Date.now() / 60_000) * 60_000;
    const inProgressStart = new Date(nowRoundedMin - 20 * 60_000);
    const inProgressEnd = new Date(inProgressStart.getTime() + 3_600_000);

    let upcomingBookingId = '';
    let inProgressBookingId = '';
    const client = await pool.connect();
    try {
      await assertDisposableTestDatabase(client);
      await client.query('BEGIN');
      const slotUp = await client.query<{ id: string }>(
        'INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle") VALUES($1,$2,$3,\'Offered\') RETURNING "id"',
        [tutorId, upcomingStart, upcomingEnd],
      );
      const slotInProg = await client.query<{ id: string }>(
        'INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle") VALUES($1,$2,$3,\'Offered\') RETURNING "id"',
        [tutorId, inProgressStart, inProgressEnd],
      );
      await client.query('ALTER TABLE public."Booking" DISABLE TRIGGER booking_s2_row_guard');
      const bUp = await client.query<{ id: string }>(
        'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt","status") VALUES($1,$2,$3,$4,\'Booked\') RETURNING "id"',
        [customerId, slotUp.rows[0].id, upcomingStart, upcomingEnd],
      );
      const bInProg = await client.query<{ id: string }>(
        'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt","status") VALUES($1,$2,$3,$4,\'Booked\') RETURNING "id"',
        [customerId, slotInProg.rows[0].id, inProgressStart, inProgressEnd],
      );
      await client.query('ALTER TABLE public."Booking" ENABLE TRIGGER booking_s2_row_guard');
      await client.query('COMMIT');
      upcomingBookingId = bUp.rows[0].id;
      inProgressBookingId = bInProg.rows[0].id;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // 2. Another Tutor (tutorEmptyEmail) sees 0 counts and explicit empty states (no cross-Tutor leakage)
    await signIn(page, tutorEmptyEmail);
    const section = page.getByTestId('tutor-appointment-summary');
    await expect(section.getByTestId('tutor-summary-upcoming-count')).toContainText('นัดหมายที่กำลังจะมาถึง (Upcoming Booked): 0 รายการ');
    await expect(section.getByTestId('tutor-summary-upcoming-empty')).toHaveText('ยังไม่มีนัดหมายที่กำลังจะมาถึง');
    await expect(section.getByTestId('tutor-summary-in-progress-count')).toContainText('กำลังดำเนินการอยู่ (In-Progress Booked): 0 รายการ');
    await expect(section.getByTestId('tutor-summary-in-progress-empty')).toHaveText('ยังไม่มีนัดหมายที่กำลังดำเนินการอยู่');
    await expect(section.getByTestId('tutor-summary-past-count')).toContainText('0 รายการ');
    await expect(section.getByTestId('tutor-summary-empty')).toBeVisible();
    await expect(section.getByTestId('tutor-summary-cancelled-count')).toContainText('0 รายการ');
    await expect(section.getByTestId('tutor-summary-cancelled-empty')).toBeVisible();
    await expect(section).not.toContainText(upcomingBookingId);
    await expect(section).not.toContainText(inProgressBookingId);
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();

    const cancelStart = new Date(upcomingDay + 'T15:00:00.000+07:00');
    const cancelEnd = new Date(cancelStart.getTime() + 3_600_000);
    const cancelSlot = await pool.query<{ id: string }>(
      'INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle") VALUES($1,$2,$3,\'Offered\') RETURNING "id"',
      [tutorId, cancelStart, cancelEnd],
    );
    const cancelRecord = await pool.query<{ id: string }>(
      'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt","status") VALUES($1,$2,$3,$4,\'Booked\') RETURNING "id"',
      [customerId, cancelSlot.rows[0].id, cancelStart, cancelEnd],
    );
    const cancelledBookingId = cancelRecord.rows[0].id;
    await signIn(page, customerEmail);
    await cancelBooking(page, 'customer', cancelledBookingId, {});
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();

    // 3. The owner sees all four groups in one evaluated snapshot.
    await signIn(page, tutorEmail);
    const bangkokClockFmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });

    const assertPopulated = async () => {
      await expect(section.getByTestId('tutor-summary-upcoming-count')).toContainText('นัดหมายที่กำลังจะมาถึง (Upcoming Booked): 1 รายการ');
      const upItems = section.getByTestId('tutor-summary-upcoming-item');
      await expect(upItems).toHaveCount(1);
      await expect(upItems.first()).toContainText(upcomingBookingId);
      await expect(upItems.first()).toContainText('10:00');
      await expect(upItems.first()).toContainText('11:00');
      await expect(upItems.first()).toContainText('(Asia/Bangkok)');
      await expect(upItems.first()).toContainText('CUST-' + customerId.slice(0, 8));
      await expect(upItems.first().getByTestId('tutor-summary-upcoming-status-badge')).toHaveText('มีนัดหมาย (Booked)');

      await expect(section.getByTestId('tutor-summary-in-progress-count')).toContainText('กำลังดำเนินการอยู่ (In-Progress Booked): 1 รายการ');
      const inProgItems = section.getByTestId('tutor-summary-in-progress-item');
      await expect(inProgItems).toHaveCount(1);
      await expect(inProgItems.first()).toContainText(inProgressBookingId);
      await expect(inProgItems.first()).toContainText(bangkokClockFmt.format(inProgressStart));
      await expect(inProgItems.first()).toContainText(bangkokClockFmt.format(inProgressEnd));
      await expect(inProgItems.first()).toContainText('(Asia/Bangkok)');
      await expect(inProgItems.first()).toContainText('CUST-' + customerId.slice(0, 8));
      await expect(inProgItems.first().getByTestId('tutor-summary-in-progress-status-badge')).toHaveText('มีนัดหมาย (Booked)');
      await expect(inProgItems.first()).not.toContainText('Past');
      await expect(inProgItems.first()).not.toContainText('Completed');
      for (const [category, bookingId] of [['past', pastBookingId], ['cancelled', cancelledBookingId]]) {
        await expect(section.getByTestId('tutor-summary-' + category + '-count')).toContainText('1 รายการ');
        const rows = category === 'past'
          ? section.getByTestId('tutor-summary-past-item')
          : section.getByRole('list', { name: 'รายการนัดหมายที่ยกเลิกแล้ว' }).getByRole('listitem');
        await expect(rows).toHaveCount(1);
        await expect(rows.first()).toContainText(bookingId);
        await expect(rows.first()).toContainText('Asia/Bangkok');
      }
      await expect(section.getByTestId('tutor-summary-evaluated-at')).toHaveCount(1);
      await expect(section.getByRole('heading', { level: 3 })).toHaveCount(4);
      await expect(section.getByRole('list')).toHaveCount(4);
      await expect(section).not.toContainText(customerEmail);
      await expect(section).not.toContainText(customerId);
    };

    await assertPopulated();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await assertPopulated();
    expect(await section.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);

    // A failed refresh must not leave any prior count/list or evaluated time on screen.
    await page.route('**/api/v1/tutor/summary', (route) => route.fulfill({
      status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE' } },
    }));
    await section.getByRole('button', { name: 'รีเฟรชสรุป' }).focus();
    await page.keyboard.press('Enter');
    await expect(section.getByRole('alert')).toBeVisible();
    await expect(section.getByRole('list')).toHaveCount(0);
    await expect(section.getByRole('heading', { level: 3 })).toHaveCount(0);
    await expect(section.getByTestId('tutor-summary-evaluated-at')).toHaveCount(0);
    await page.unroute('**/api/v1/tutor/summary');
    await section.getByRole('button', { name: 'ลองโหลดสรุปอีกครั้ง' }).click();
    await assertPopulated();
  });
});
