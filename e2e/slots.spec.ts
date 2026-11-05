import { test, expect } from '@playwright/test';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const marker = randomBytes(6).toString('hex');
const tutorEmail = 'slot-browser-' + marker + '@example.test';
const tutor2Email = 'slot-browser-t2-' + marker + '@example.test';
const customerEmail = 'slot-customer-browser-' + marker + '@example.test';
const password = 'SlotBrowserPassword#2026';
let tutor1SlotId: string;
let tutor2SlotId: string;

test.beforeAll(async () => {
  const hash = await argon2.hash(password);
  const users = await pool.query<{ id: string; email: string }>(
    'INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3),($4,$5,$6),($7,$8,$9) RETURNING "id","email"',
    [tutorEmail, hash, 'Tutor', tutor2Email, hash, 'Tutor', customerEmail, hash, 'Customer'],
  );
  const idOf = (email: string) => users.rows.find(user => user.email === email)!.id;
  // Distinct persisted fixture slots must appear in authorized Tutor own-list
  // 200 responses. Looking for a nonexistent Slot ID in DOM is not a privacy test.
  const t1Start = new Date(Date.now() + 51 * 86_400_000);
  t1Start.setUTCHours(3, 6, 0, 0); // Asia/Bangkok 10:06
  const t2Start = new Date(Date.now() + 52 * 86_400_000);
  t2Start.setUTCHours(8, 43, 0, 0); // Asia/Bangkok 15:43
  const inserted = await pool.query<{ id: string; tutorId: string }>(
    'INSERT INTO "Slot"("tutorId","startsAt","endsAt") VALUES($1,$2,$3),($4,$5,$6) RETURNING "id","tutorId"',
    [idOf(tutorEmail), t1Start, new Date(t1Start.getTime() + 3_600_000),
      idOf(tutor2Email), t2Start, new Date(t2Start.getTime() + 3_600_000)],
  );
  tutor1SlotId = inserted.rows.find(row => row.tutorId === idOf(tutorEmail))!.id;
  tutor2SlotId = inserted.rows.find(row => row.tutorId === idOf(tutor2Email))!.id;
});
test.afterAll(async () => { await pool.end(); }); // disposable DB; immutable Slot forbids cleanup DELETE.

const signIn = async (page: import('@playwright/test').Page, email = tutorEmail, navigate = true) => {
  // E2E-only proxy trust in playwright.config.ts; do not touch production rules.
  const ipHex = randomBytes(12).toString('hex');
  const rateTestIp = '2001:db8:' + ipHex.slice(0, 4) + ':' + ipHex.slice(4, 8) + ':' + ipHex.slice(8, 12) + '::9';
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': rateTestIp });
  if (navigate) await page.goto('/');
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

  test('SLOT-18 timeout after a committed POST reports uncertainty and reconciles own-list', async ({ page }) => {
    test.setTimeout(75_000); // Wait for the production 10-second AbortController timer, not an artificial 503.
    await signIn(page);
    await expect(page.getByText('10:06', { exact: true })).toBeVisible();
    const future = new Date(Date.now() + 35 * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
    await page.getByLabel('วันที่').fill(future);
    await page.getByLabel('เวลาเริ่ม').fill('14:27');
    let releaseResponse!: () => void;
    const heldResponse = new Promise<void>(resolve => { releaseResponse = resolve; });
    let committedSignal!: () => void;
    const committedPost = new Promise<void>(resolve => { committedSignal = resolve; });
    let ownListReads = 0;
    await page.route('**/api/v1/tutor/slots', async route => {
      if (route.request().method() === 'POST') {
        const authorizedResponse = await route.fetch(); // Actual server INSERT and COMMIT
        expect(authorizedResponse.status()).toBe(201);
        committedSignal();
        await heldResponse; // Withhold HTTP 201 until the browser's real 10s timeout.
        await route.fulfill({ response: authorizedResponse });
      } else {
        ownListReads++;
        await route.continue();
      }
    });
    const submittedAt = Date.now();
    try {
      await page.getByRole('button', { name: 'เพิ่มเวลาติว' }).click();
      await committedPost;
      await expect(page.getByRole('alert')).toContainText('ยังยืนยันผลการบันทึกไม่ได้', { timeout: 16_000 });
      expect(Date.now() - submittedAt).toBeGreaterThanOrEqual(9_000);
      await expect(page.getByText('14:27', { exact: true })).toBeVisible(); // Reconciled from DB, not a false 201
      await expect(page.getByRole('button', { name: 'เพิ่มเวลาติว' })).toBeEnabled();
      await expect(page.getByText('บันทึกเวลาติวสำเร็จ')).toHaveCount(0);
      expect(ownListReads).toBeGreaterThanOrEqual(1);
    } finally {
      releaseResponse();
    }
  });

  test('SLOT-18 network drop after a committed POST reports uncertainty and rereads own-list', async ({ page }) => {
    await signIn(page);
    await expect(page.getByText('10:06', { exact: true })).toBeVisible();
    const future = new Date(Date.now() + 36 * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
    await page.getByLabel('วันที่').fill(future);
    await page.getByLabel('เวลาเริ่ม').fill('14:38');
    let ownListReads = 0;
    let committedSignal!: () => void;
    const committedPost = new Promise<void>(resolve => { committedSignal = resolve; });
    await page.route('**/api/v1/tutor/slots', async route => {
      if (route.request().method() === 'POST') {
        const authorizedResponse = await route.fetch();
        expect(authorizedResponse.status()).toBe(201); // Server committed before loss.
        committedSignal();
        await route.abort('failed'); // Real browser network error, not HTTP 503.
      } else {
        ownListReads++;
        await route.continue();
      }
    });
    await page.getByRole('button', { name: 'เพิ่มเวลาติว' }).click();
    await committedPost;
    await expect(page.getByRole('alert')).toContainText('ยังยืนยันผลการบันทึกไม่ได้');
    await expect(page.getByText('14:38', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'เพิ่มเวลาติว' })).toBeEnabled();
    await expect(page.getByText('บันทึกเวลาติวสำเร็จ')).toHaveCount(0);
    expect(ownListReads).toBeGreaterThanOrEqual(1);
  });

  test('SLOT-18 prevents duplicate submission until a failed reconciliation GET is retried', async ({ page }) => {
    await signIn(page);
    await expect(page.getByText('10:06', { exact: true })).toBeVisible();
    const future = new Date(Date.now() + 37 * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
    await page.getByLabel('วันที่').fill(future);
    await page.getByLabel('เวลาเริ่ม').fill('14:49');
    let failNextList = true;
    await page.route('**/api/v1/tutor/slots', async route => {
      if (route.request().method() === 'POST') {
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        await route.abort('failed');
      } else if (failNextList) {
        failNextList = false;
        await route.abort('failed');
      } else {
        await route.continue();
      }
    });
    await page.getByRole('button', { name: 'เพิ่มเวลาติว' }).click();
    // A failed reconciliation also renders the independent list error alert.
    // Address the create error specifically: getByRole('alert') is ambiguous
    // when both correctly remain visible on fast hosted CI runners.
    await expect(page.locator('#slot-error')).toContainText('ยังยืนยันผลการบันทึกไม่ได้');
    await expect(page.getByText('ไม่สามารถโหลดรายการเวลาติวได้ กรุณาลองใหม่')).toBeVisible();
    await expect(page.getByRole('button', { name: 'เพิ่มเวลาติว' })).toBeDisabled();
    await page.getByRole('button', { name: 'โหลดอีกครั้ง' }).click();
    await expect(page.getByText('14:49', { exact: true })).toBeVisible();
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

  test('SLOT-20 holds real authorized T1 own-list HTTP 200, then releases it after switching to T2', async ({ page }) => {
    await signIn(page);
    await expect(page.getByText('10:06', { exact: true })).toBeVisible();
    let interceptNextGet = true;
    let signalCaptured!: () => void;
    const captured = new Promise<void>(resolve => { signalCaptured = resolve; });
    let releaseOld200!: () => void;
    const holdOld200 = new Promise<void>(resolve => { releaseOld200 = resolve; });
    let signalFulfilled!: () => void;
    const fulfilled = new Promise<void>(resolve => { signalFulfilled = resolve; });
    let oldT1Ids: string[] = [];
    await page.route('**/api/v1/tutor/slots', async route => {
      if (route.request().method() !== 'GET' || !interceptNextGet) {
        await route.continue();
        return;
      }
      interceptNextGet = false;
      const response = await route.fetch(); // Authorized while T1 Session still active.
      expect(response.status()).toBe(200);
      const body = await response.json() as { data: Array<{ id: string }> };
      oldT1Ids = body.data.map(slot => slot.id);
      expect(oldT1Ids).toContain(tutor1SlotId);
      expect(oldT1Ids).not.toContain(tutor2SlotId);
      signalCaptured();
      await holdOld200;
      await route.fulfill({ response }); // Deliver the captured T1 HTTP 200 after T2 signs in.
      signalFulfilled();
    });
    // A new successful POST triggers a fresh own-list GET in the same mounted
    // Tutor view. Initial StrictMode GETs can be aborted, so do not intercept them.
    const date = new Date(Date.now() + 24 * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
    await page.getByLabel('วันที่').fill(date);
    await page.getByLabel('เวลาเริ่ม').fill('12:31');
    await page.getByRole('button', { name: 'เพิ่มเวลาติว' }).click();
    await expect(page.getByText('บันทึกเวลาติวสำเร็จ')).toBeVisible();
    await captured;
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
    await signIn(page, tutor2Email, false);
    await expect(page.getByText('15:43', { exact: true })).toBeVisible();
    await expect(page.getByText('10:06', { exact: true })).toHaveCount(0);
    releaseOld200();
    await fulfilled;
    await expect(page.getByText('15:43', { exact: true })).toBeVisible();
    await expect(page.getByText('10:06', { exact: true })).toHaveCount(0);
    await expect(page.getByText('12:31', { exact: true })).toHaveCount(0);
    expect(oldT1Ids).toContain(tutor1SlotId);
  });
});
