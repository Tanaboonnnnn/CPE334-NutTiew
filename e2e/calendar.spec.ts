import { test, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env', quiet: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const tag = randomBytes(6).toString('hex');
const email = 'calendar-e2e-' + tag + '@example.test';
const password = 'CalendarE2EPassword#2026';
let customerId = '';

test.use({ timezoneId: 'America/Los_Angeles' });

test.beforeAll(async () => {
  const hash = await argon2.hash(password);
  const result = await pool.query<{ id: string }>(
    'INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,\'Customer\') RETURNING "id"',
    [email, hash],
  );
  customerId = result.rows[0].id;
});

test.afterAll(async () => {
  if (customerId) await pool.query('UPDATE "User" SET "isActive"=false WHERE "id"=$1', [customerId]).catch(() => {});
  await pool.end();
});

async function signIn(page: Page) {
  const h = randomBytes(12).toString('hex');
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': '2001:db8:' + h.slice(0,4) + ':' + h.slice(4,8) + ':' + h.slice(8,12) + '::c' });
  await page.goto('/');
  await page.getByLabel('อีเมล').fill(email);
  await page.getByLabel('รหัสผ่าน').fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page.getByRole('heading', { name: 'เลือกช่วงเวลาติว' })).toBeVisible();
}

type Offer = { slotId: string; tutorRef: string; startsAt: string; endsAt: string };
function offer(id: string, date: string, tutor: string): Offer {
  const start = new Date(date);
  return {
    slotId: id,
    tutorRef: tutor,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 3_600_000).toISOString(),
  };
}

async function installCalendarPayload(page: Page, make: (evaluatedAt: string) => Offer[], fixedEvaluation?: string) {
  await page.route('**/api/v1/customer/availability', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const real = await route.fetch();
    expect(real.status()).toBe(200);
    const original = await real.json() as { meta: { requestId: string; evaluatedAt: string } };
    const evaluatedAt = fixedEvaluation ?? original.meta.evaluatedAt;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Cache-Control': 'no-store',
        'X-NutTiew-Session-Binding': real.headers()['x-nuttiew-session-binding'] ?? '',
      },
      body: JSON.stringify({ data: make(evaluatedAt), meta: { requestId: original.meta.requestId, evaluatedAt } }),
    });
  });
}

test.describe('Issue #44 Monthly Calendar / UX-CAL-01..10', () => {
  test('UX-CAL-01/03/09 531 offers remain compact until day/time is selected; no navigation POST', async ({ page }) => {
    test.setTimeout(90_000);
    await installCalendarPayload(page, evaluatedAt => {
      const base = Date.parse(evaluatedAt);
      const offers: Offer[] = [];
      for (let day = 1; day <= 59; day++) {
        for (let hour = 0; hour < 9; hour++) {
          const start = new Date(base + day * 86_400_000 + hour * 2 * 3_600_000);
          offers.push(offer('demo-' + day + '-' + hour, start.toISOString(), 'tutor-' + hour));
        }
      }
      return offers;
    });
    await signIn(page);
    const cal = page.getByTestId('availability-calendar');
    await expect(cal).toBeVisible();
    await expect(cal).toContainText('531 ช่วงเวลาทั้งหมด');
    await expect(page.getByTestId('calendar-time-group')).toHaveCount(6);
    await expect(page.getByTestId('availability-offer')).toHaveCount(0);
    const more = page.getByRole('button', { name: /^ดูเวลาเพิ่มเติม/ });
    await expect(more).toBeVisible();

    let posts = 0;
    page.on('request', request => {
      if (request.method() === 'POST' && request.url().includes('/api/v1/customer/bookings')) posts++;
    });
    await more.click();
    await expect(page.getByTestId('calendar-time-group')).toHaveCount(9);
    await page.getByTestId('calendar-time-group').first().click();
    await expect(page.getByTestId('availability-offer')).toHaveCount(1);
    expect(posts).toBe(0);

    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(cal).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow, 'horizontal overflow at ' + width + 'px').toBe(false);
      const measures = await page.getByTestId('calendar-day').first().boundingBox();
      expect(measures).toBeTruthy();
      expect(measures!.height).toBeGreaterThanOrEqual(44);
      expect(measures!.width).toBeGreaterThanOrEqual(width === 320 ? 36 : 44);
      await page.screenshot({ path: 'test-results/customer-calendar-' + width + '.png', fullPage: true });
    }
  });

  test('UX-CAL-02/07 Nov→Dec→Jan empty month and leap February use server reference, not browser timezone', async ({ page }) => {
    await installCalendarPayload(page, () => [
      offer('demo-nov', '2026-11-28T03:00:00.000Z', 'tutor-nov'),
      offer('demo-jan', '2027-01-05T03:00:00.000Z', 'tutor-jan'),
    ], '2026-11-10T05:00:00.000Z');
    await signIn(page);
    const cal = page.getByTestId('availability-calendar');
    await expect(cal).toHaveAttribute('data-month-key', '2026-11');
    await expect(page.locator('[data-calendar-day="2026-11-28"]')).toBeEnabled();
    await page.getByRole('button', { name: 'เดือนถัดไป' }).click();
    await expect(cal).toHaveAttribute('data-month-key', '2026-12');
    await expect(page.getByText('ยังไม่มีช่วงเวลาว่างในเดือนนี้')).toBeVisible();
    await page.getByRole('button', { name: 'เดือนถัดไป' }).click();
    await expect(cal).toHaveAttribute('data-month-key', '2027-01');
    await page.locator('[data-calendar-day="2027-01-05"]').click();
    await expect(page.getByTestId('calendar-time-group')).toHaveCount(1);
    await page.getByTestId('calendar-time-group').click();
    await expect(page.locator('[data-offer-slot-id="demo-jan"]')).toContainText('10:00');

    // A separately controlled UTC fixture tests leap-year calendar geometry.
    await page.unroute('**/api/v1/customer/availability');
    await installCalendarPayload(page, () => [
      offer('demo-leap', '2028-02-29T04:00:00.000Z', 'tutor-leap'),
      offer('demo-next', '2028-03-01T04:00:00.000Z', 'tutor-next'),
    ], '2028-02-20T05:00:00.000Z');
    await page.getByRole('button', { name: 'โหลดข้อมูลล่าสุด' }).click();
    await expect(cal).toHaveAttribute('data-month-key', '2028-02');
    await expect(page.locator('[data-calendar-day="2028-02-29"]')).toBeEnabled();
    await page.locator('[data-calendar-day="2028-02-29"]').click();
    await page.getByTestId('calendar-time-group').click();
    await expect(page.locator('[data-offer-slot-id="demo-leap"]')).toContainText('11:00');
  });

  test('UX-CAL-04/06 selection stays inline across month navigation and reads fail closed', async ({ page }) => {
    let fail = false;
    await page.route('**/api/v1/customer/availability', async route => {
      const real = await route.fetch();
      if (fail) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }) });
        return;
      }
      expect(real.status()).toBe(200);
      const original = await real.json() as { meta: { requestId: string } };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'no-store', 'X-NutTiew-Session-Binding': real.headers()['x-nuttiew-session-binding'] ?? '' },
        body: JSON.stringify({
          data: [offer('demo-first', '2026-11-18T04:00:00.000Z', 'tutor-reference')],
          meta: { requestId: original.meta.requestId, evaluatedAt: '2026-11-10T05:00:00.000Z' },
        }),
      });
    });
    await signIn(page);
    await page.locator('[data-calendar-day="2026-11-18"]').click();
    await page.getByTestId('calendar-time-group').click();
    await page.locator('[data-offer-slot-id="demo-first"]').getByRole('button', { name: 'เลือกช่วงเวลานี้' }).click();
    const summary = page.locator('#selected-offer-summary');
    await expect(summary).toContainText('ยังไม่ใช่การจอง');
    await page.getByRole('button', { name: 'เดือนถัดไป' }).click();
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('tutor-reference');

    fail = true;
    await page.getByRole('button', { name: 'โหลดข้อมูลล่าสุด' }).click();
    await expect(page.locator('#availability-error')).toBeVisible();
    await expect(page.getByTestId('availability-calendar')).toHaveCount(0);
    await expect(page.getByText('ยังไม่มีช่วงเวลาติวที่พร้อมให้เลือก')).toHaveCount(0);
  });
});
