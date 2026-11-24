import { test, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env', quiet: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const tag = randomBytes(8).toString('hex');
const tutorEmail = 'summary-t-' + tag + '@example.test';
const tutorEmptyEmail = 'summary-te-' + tag + '@example.test';
const customerEmail = 'summary-c-secret-' + tag + '@example.test';
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

test.beforeAll(async () => {
  await assertDisposableTestDatabase(pool);
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
    let failOnce = true;
    await page.route('**/api/v1/tutor/summary', async (route) => {
      if (failOnce) {
        failOnce = false;
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

    await page.getByRole('button', { name: 'ลองโหลดสรุปอีกครั้ง' }).click();
    await expect(page.getByTestId('tutor-summary-past-count')).toContainText('นัดหมายที่ผ่านมาแล้ว (Past Booked): 1 รายการ');
    await expect(page.getByTestId('tutor-summary-past-item')).toHaveCount(1);
    await expect(page.getByTestId('tutor-summary-past-item').first()).toContainText(pastBookingId);
  });
});
