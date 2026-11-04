import { test, expect } from '@playwright/test';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const marker = randomBytes(6).toString('hex');
const tutorEmail = 'slot-browser-' + marker + '@example.test';
const customerEmail = 'slot-customer-browser-' + marker + '@example.test';
const password = 'SlotBrowserPassword#2026';
const ipHex = randomBytes(12).toString('hex');
const rateTestIp = '2001:db8:' + ipHex.slice(0, 4) + ':' + ipHex.slice(4, 8) + ':' + ipHex.slice(8, 12) + '::9';

test.beforeAll(async () => {
  const hash = await argon2.hash(password);
  await pool.query('INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3),($4,$5,$6)',
    [tutorEmail, hash, 'Tutor', customerEmail, hash, 'Customer']);
});
test.afterAll(async () => { await pool.end(); }); // disposable DB; immutable Slot forbids cleanup DELETE.

const signIn = async (page: import('@playwright/test').Page, email = tutorEmail) => {
  // E2E-only proxy trust in playwright.config.ts; do not touch production rules.
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': rateTestIp });
  await page.goto('/');
  await page.getByLabel('อีเมล').fill(email);
  await page.getByLabel('รหัสผ่าน').fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page.getByText('เข้าสู่ระบบแล้ว')).toBeVisible();
};

test.describe('F-S1-02 Tutor UI / durable own schedule', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('SLOT-15 remains usable without horizontal overflow at 320/375/768/1280px and previews midnight rollover', async ({ page }) => {
    await signIn(page);
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 840 });
      await expect(page.getByRole('heading', { name: 'ตารางเวลาติวของฉัน' })).toBeVisible();
      await expect(page.getByLabel('วันที่')).toBeVisible();
      await expect(page.getByLabel('เวลาเริ่ม')).toBeVisible();
      await expect(page.getByRole('button', { name: 'เพิ่มเวลาติว' })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow, 'Tutor screen horizontal overflow at ' + width + 'px').toBe(false);
      await page.screenshot({ path: 'test-results/tutor-' + width + '.png', fullPage: true });
    }
    const tomorrow = new Date(Date.now() + 2 * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
    await page.getByLabel('วันที่').fill(tomorrow);
    await page.getByLabel('เวลาเริ่ม').fill('23:30');
    await expect(page.getByText('00:30')).toBeVisible();
    await expect(page.getByText('สิ้นสุดในวันถัดไป')).toBeVisible();
  });

  test('SLOT-12/15 a server-side 503 never claims the Slot was created and keeps form usable', async ({ page }) => {
    await signIn(page);
    const future = new Date(Date.now() + 15 * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
    await page.getByLabel('วันที่').fill(future);
    await page.getByLabel('เวลาเริ่ม').fill('14:17');
    await page.route('**/api/v1/tutor/slots', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }) });
      } else await route.continue();
    });
    await page.getByRole('button', { name: 'เพิ่มเวลาติว' }).click();
    await expect(page.getByRole('alert')).toContainText('ยังยืนยันผลการบันทึกไม่ได้');
    await expect(page.getByRole('button', { name: 'เพิ่มเวลาติว' })).toBeEnabled();
    await expect(page.getByText('บันทึกเวลาติวสำเร็จ')).toHaveCount(0);
  });

  test('SLOT-09/14/19 creates any-minute Bangkok Slot and persists through reload in non-Bangkok browser zone', async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'ตารางเวลาติวของฉัน' })).toBeVisible();
    const bangkokDate = new Date(Date.now() + 8 * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
    await page.getByLabel('วันที่').fill(bangkokDate);
    await page.getByLabel('เวลาเริ่ม').fill('13:17');
    await expect(page.getByText('14:17')).toBeVisible();
    await page.getByRole('button', { name: 'เพิ่มเวลาติว' }).click();
    await expect(page.getByText('บันทึกเวลาติวสำเร็จ')).toBeVisible();
    await expect(page.getByText('13:17', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'ตารางเวลาติวของฉัน' })).toBeVisible();
    await expect(page.getByText('13:17', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/tutor-availability.png', fullPage: true });
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
    await expect(page.getByText('13:17', { exact: true })).toHaveCount(0);
  });

  test('SLOT-20 ignores stale own-list 200 after logout, never displays prior Tutor private slots', async ({ page }) => {
    let release: (() => void) | null = null;
    let intercepted: (() => void) | null = null;
    const interceptedSignal = new Promise<void>(resolve => { intercepted = resolve; });
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/v1/tutor/slots', async route => {
      if (route.request().method() === 'GET') {
        intercepted?.();
        await pending;
      }
      await route.continue();
    });
    await signIn(page);
    await interceptedSignal;
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
    release?.();
    await expect(page.getByRole('heading', { name: 'ตารางเวลาติวของฉัน' })).toHaveCount(0);
    await expect(page.getByText('13:17', { exact: true })).toHaveCount(0);
  });
});
