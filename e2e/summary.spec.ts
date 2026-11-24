import { test, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env', quiet: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const tag = randomBytes(8).toString('hex');
const tutorEmail = 'summary-t-' + tag + '@example.test';
const customerEmail = 'summary-c-secret-' + tag + '@example.test';
const password = 'SummaryE2E#2026';

let tutorId = '';
let customerId = '';
let pastBookingId = '';

// Yesterday 14:00-15:00 Asia/Bangkok (07:00-08:00 UTC)
const yesterdayBangkok = new Date(Date.now() - 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
const pastStart = new Date(yesterdayBangkok + 'T14:00:00.000+07:00');
const pastEnd = new Date(pastStart.getTime() + 3_600_000);

test.beforeAll(async () => {
  const hash = await argon2.hash(password);
  const users = await pool.query<{ id: string; role: string }>(
    'INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3),($4,$5,$6) RETURNING "id","role"',
    [tutorEmail, hash, 'Tutor', customerEmail, hash, 'Customer'],
  );
  tutorId = users.rows.find(u => u.role === 'Tutor')!.id;
  customerId = users.rows.find(u => u.role === 'Customer')!.id;

  const slot = await pool.query<{ id: string }>(
    'INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle") VALUES($1,$2,$3,\'Offered\') RETURNING "id"',
    [tutorId, pastStart, pastEnd],
  );
  const booking = await pool.query<{ id: string }>(
    'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt","status") VALUES($1,$2,$3,$4,\'Booked\') RETURNING "id"',
    [customerId, slot.rows[0].id, pastStart, pastEnd],
  );
  pastBookingId = booking.rows[0].id;
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
});
