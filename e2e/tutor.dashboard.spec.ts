import { test, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env', quiet: true });

// A dedicated disposable PG database only; no fake appointment DTOs.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const tag = randomBytes(8).toString('hex');
const tutor = 'dashboard-t-' + tag + '@example.test';
const customer = 'dashboard-c-' + tag + '@example.test';
const password = 'TutorDashboard#2026';
const day = (offset: number): string =>
  new Date(Date.now() + (offset * 86_400_000) + (7 * 3_600_000)).toISOString().slice(0, 10);
const dateTime = (dayKey: string, clock: string) => new Date(dayKey + 'T' + clock + ':00+07:00');
const exactStarts = [dateTime(day(12), '13:17'), dateTime(day(13), '13:59'),
  dateTime(day(14), '23:30'), dateTime(day(45), '02:17')];
const seedIds: string[] = [];
let tutorId = '';

test.beforeAll(async () => {
  const hash = await argon2.hash(password);
  const users = await pool.query<{ id: string; role: string }>(
    'INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3),($4,$5,$6) RETURNING "id","role"',
    [tutor, hash, 'Tutor', customer, hash, 'Customer'],
  );
  tutorId = users.rows.find(user => user.role === 'Tutor')!.id;
  for (const start of exactStarts) {
    const result = await pool.query<{ id: string }>(
      'INSERT INTO "Slot"("tutorId","startsAt","endsAt") VALUES($1,$2,$3) RETURNING "id"',
      [tutorId, start, new Date(start.getTime() + 3_600_000)],
    );
    seedIds.push(result.rows[0].id);
  }
});
test.afterAll(async () => { await pool.end(); }); // Slots deliberately immutable in S1.

async function signIn(page: Page, email = tutor) {
  const h = randomBytes(12).toString('hex');
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': '2001:db8:' + h.slice(0, 4) + ':' + h.slice(4, 8) + ':' + h.slice(8, 12) + '::6' });
  await page.goto('/');
  await page.getByLabel('อีเมล').fill(email);
  await page.getByLabel('รหัสผ่าน').fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page.getByText('เข้าสู่ระบบแล้ว')).toBeVisible();
}

/** Compare actual computed sRGB colors; control edges need >=3:1 against the surface. */
function contrastFromCss(a: string, b: string): number {
  const luminance = (css: string): number => {
    const parts = /^#[0-9a-f]{6}$/i.test(css)
      ? [1, 3, 5].map(index => parseInt(css.slice(index, index + 2), 16))
      : css.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    if (!parts || parts.length !== 3) throw new Error('Unrecognized computed color: ' + css);
    const [r, g, blue] = parts.map(v => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * blue;
  };
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

async function computedControl(page: Page, selector: string) {
  return page.locator(selector).first().evaluate(element => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      border: style.borderTopColor,
      opacity: style.opacity,
      outline: style.outlineColor,
      outlineWidth: style.outlineWidth,
    };
  });
}

test.describe('Tutor Calendar Dashboard / reviewed UX-R1…UX-R6 candidate', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('UX-R1 real Tutor shell, trusted identity and no invented product features', async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'ตารางเวลาติวของฉัน' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ปฏิทินเวลาติว' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'รายการ Slot ทั้งหมด' })).toBeVisible();
    await expect(page.getByText(tutorId.replaceAll('-', '').slice(-8), { exact: true })).toBeVisible();
    await expect(page.getByText('Asia/Bangkok (UTC+07:00)')).toBeVisible();
    await expect(page.getByText('4', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'เพิ่มช่วงเวลาติว' })).toBeVisible();
    for (const label of ['Students', 'Revenue', 'Messages', 'Reschedule', 'Conflict Detected', 'Unassigned']) {
      await expect(page.getByText(label, { exact: true })).toHaveCount(0);
    }
    for (const id of seedIds) await expect(page.locator('#all-slots [data-slot-id="' + id + '"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'เพิ่มช่วงเวลาติว' }).click();
    await expect(page.getByLabel('วันที่')).toBeFocused();
    await expect(page.getByRole('button', { name: 'ออกจากระบบ' })).toBeVisible();
  });

  test('UX-R2 minute-exact positioning, cross-midnight two-date projection and 24-hour access', async ({ page }) => {
    await signIn(page);
    const picker = page.getByLabel('เลือกวันบนปฏิทิน');
    await picker.fill(day(12));
    const first = page.locator('[data-testid="calendar-slot"][data-slot-id="' + seedIds[0] + '"]');
    await expect(first).toHaveAttribute('data-start-minute', String(13 * 60 + 17));
    await picker.fill(day(13));
    const second = page.locator('[data-testid="calendar-slot"][data-slot-id="' + seedIds[1] + '"]');
    await expect(second).toHaveAttribute('data-start-minute', String(13 * 60 + 59));
    await picker.fill(day(14));
    const late = page.locator('[data-testid="calendar-slot"][data-slot-id="' + seedIds[2] + '"][data-day="' + day(14) + '"]');
    const afterMidnight = page.locator('[data-testid="calendar-slot"][data-slot-id="' + seedIds[2] + '"][data-day="' + day(15) + '"]');
    await expect(late).toHaveAttribute('data-start-minute', String(23 * 60 + 30));
    await expect(afterMidnight).toHaveAttribute('data-start-minute', '0');
    await expect(late).toHaveAttribute('aria-label', /23:30 ถึง 00:30/);
    await expect(page.getByText('23:00', { exact: true })).toBeAttached();
    await page.locator('.calendar-scroll').evaluate(node => { node.scrollTop = node.scrollHeight; });
    await expect(late).toBeVisible();
    await expect(afterMidnight).toBeVisible();
    await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(4);
  });

  test('UX-R3 calendar navigation never sends date-filter/query and agenda is complete', async ({ page }) => {
    const seen: string[] = [];
    page.on('request', req => {
      if (req.url().includes('/api/v1/tutor/slots') && req.method() === 'GET') seen.push(req.url());
    });
    await signIn(page);
    await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(4);
    const before = seen.length;
    await page.getByRole('button', { name: 'ถัดไป 3 วัน' }).click();
    await page.getByRole('button', { name: 'ก่อนหน้า 3 วัน' }).click();
    await page.getByRole('button', { name: 'วันนี้' }).click();
    await page.getByLabel('เลือกวันบนปฏิทิน').fill(day(45));
    await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(4);
    for (const id of seedIds) await expect(page.locator('#all-slots [data-slot-id="' + id + '"]')).toHaveCount(1);
    expect(seen.length).toBe(before);
    expect(seen.every(url => !new URL(url).search)).toBe(true);
    await expect(page.getByRole('status', { name: '' }).filter({ hasText: 'ช่วงที่แสดง:' })).toContainText('1 ช่วงเวลา');
  });

  test('UX-R4 real DB-backed screenshots at 320/375/768/1280, keyboard targets and responsive agenda', async ({ page }) => {
    await signIn(page);
    await page.getByLabel('เลือกวันบนปฏิทิน').fill(day(12));
    await page.getByRole('heading', { name: 'ปฏิทินเวลาติว' }).click(); // Capture normal, unfocused date-field appearance.
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole('heading', { name: 'ตารางเวลาติวของฉัน' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'รายการ Slot ทั้งหมด' })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      expect(overflow, 'Horizontal overflow at ' + width).toBe(false);
      if (width <= 620) {
        await expect(page.getByRole('region', { name: /ปฏิทิน 24 ชั่วโมง/ })).toBeHidden();
        await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(4);
      } else {
        await expect(page.getByRole('region', { name: /ปฏิทิน 24 ชั่วโมง/ })).toBeVisible();
        const count = await page.locator('.calendar-day-heading').count();
        expect(count).toBe(width < 1061 ? 2 : 3);
        if (width === 768) {
          const picker = page.getByLabel('เลือกวันบนปฏิทิน');
          await picker.fill(day(12));
          await page.getByRole('button', { name: 'ถัดไป 2 วัน' }).click();
          await expect(picker).toHaveValue(day(14));
          await page.getByRole('button', { name: 'ก่อนหน้า 2 วัน' }).click();
          await expect(picker).toHaveValue(day(12));
        }
      }
      const mainAction = page.getByRole('button', { name: 'เพิ่มช่วงเวลาติว' });
      const rect = await mainAction.boundingBox();
      expect(rect!.height).toBeGreaterThanOrEqual(44);
      expect(rect!.width).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: 'test-results/dashboard-' + width + '.png', fullPage: true });
    }
    await page.setViewportSize({ width: 320, height: 900 });
    await page.getByRole('button', { name: 'เปิดเมนูนำทาง' }).click();
    await expect(page.getByRole('link', { name: 'บัญชีของฉัน' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ออกจากระบบ' })).toBeVisible();
    await page.getByRole('link', { name: 'บัญชีของฉัน' }).click();
    await expect(page.getByRole('button', { name: 'ออกจากระบบ' })).toBeVisible();
    await page.getByRole('button', { name: 'ปิดเมนูนำทาง' }).focus();
    await expect(page.getByRole('button', { name: 'ปิดเมนูนำทาง' })).toBeFocused();
  });

  test('UX-R4 actual computed WCAG AA contrast samples and keyboard calendar controls', async ({ page }) => {
    await signIn(page);
    await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(4);
    const ratios = await page.evaluate(() => {
      function channels(value: string): number[] {
        const matches = value.match(/\d+(?:\.\d+)?/g);
        if (!matches || matches.length < 3) throw Error('Could not read RGB: ' + value);
        return matches.slice(0, 3).map(Number);
      }
      function luminance(color: string): number {
        const [r, g, b] = channels(color).map(n => {
          const c = n / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return r * 0.2126 + g * 0.7152 + b * 0.0722;
      }
      const pairs = [
        ['sidebar_brand', '.sidebar-brand strong', '.tutor-sidebar'],
        ['sidebar_nav', '.sidebar-nav-active', '.tutor-sidebar'],
        ['primary_action', '.dashboard-add-cta', '.dashboard-add-cta'],
        ['summary_label', '.overview-label', '.overview-tile'],
        // The individual day heading is transparent; the actual painted
        // background comes from its white sticky parent, not transparent black.
        ['calendar_heading', '.calendar-day-heading strong', '.calendar-day-headings'],
        ['agenda_text', '.slot-item-hours', '.agenda-card'],
      ];
      return pairs.map(([name, textSelector, backgroundSelector]) => {
        const textElement = document.querySelector(textSelector);
        const backgroundElement = document.querySelector(backgroundSelector);
        if (!textElement || !backgroundElement) throw Error('Missing contrast sample element: ' + name);
        const foreground = luminance(getComputedStyle(textElement).color);
        const background = luminance(getComputedStyle(backgroundElement).backgroundColor);
        return { name, ratio: Number(((Math.max(foreground, background) + 0.05) /
          (Math.min(foreground, background) + 0.05)).toFixed(2)) };
      });
    });
    for (const sample of ratios) expect(sample.ratio, sample.name + ' WCAG 4.5:1').toBeGreaterThanOrEqual(4.5);
    console.info('TUTOR_DASHBOARD_COMPUTED_CONTRAST', JSON.stringify(ratios));
    const datePicker = page.getByLabel('เลือกวันบนปฏิทิน');
    const before = await datePicker.inputValue();
    const forward = page.getByRole('button', { name: 'ถัดไป 3 วัน' });
    await forward.focus();
    await expect(forward).toBeFocused();
    await page.keyboard.press('Enter');
    expect(await datePicker.inputValue()).not.toBe(before);
    await page.getByRole('button', { name: 'วันนี้' }).focus();
    await page.keyboard.press('Enter');
    await expect(datePicker).toHaveValue(day(0));
  });

  test('UX-R5 real 409 conflict is inline, fields retained and no extra Slot committed', async ({ page }) => {
    await signIn(page);
    const preCount = (await pool.query('SELECT count(*)::int as n FROM "Slot" WHERE "tutorId"=$1', [tutorId])).rows[0].n;
    await page.getByLabel('วันที่').fill(day(12));
    await page.getByLabel('เวลาเริ่ม').fill('13:59'); // Overlaps 13:17-14:17
    await page.getByRole('button', { name: 'เพิ่มเวลาติว' }).click();
    await expect(page.locator('#slot-error')).toContainText('ทับกับเวลาที่คุณเปิดไว้แล้ว');
    await expect(page.getByLabel('วันที่')).toHaveValue(day(12));
    await expect(page.getByLabel('เวลาเริ่ม')).toHaveValue('13:59');
    await expect(page.getByText('บันทึกเวลาติวสำเร็จ')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/dashboard-conflict-409.png', fullPage: true });
    const postCount = (await pool.query('SELECT count(*)::int as n FROM "Slot" WHERE "tutorId"=$1', [tutorId])).rows[0].n;
    expect(postCount).toBe(preCount);
  });

  test('UX-R5 empty Tutor account shows no invented calendar block or appointment', async ({ page }) => {
    const noSlotsEmail = 'dashboard-empty-' + randomBytes(8).toString('hex') + '@example.test';
    await pool.query('INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3)',
      [noSlotsEmail, await argon2.hash(password), 'Tutor']);
    await signIn(page, noSlotsEmail);
    await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(0);
    await expect(page.getByText('ยังไม่มีช่วงเวลาติวที่เปิดไว้')).toBeVisible();
    await expect(page.locator('[data-testid="calendar-slot"]')).toHaveCount(0);
    await expect(page.getByText('0', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'เพิ่มเวลาติว' })).toBeEnabled();
    await page.screenshot({ path: 'test-results/dashboard-empty-1280.png', fullPage: true });
  });

  test('UX-R5 initial GET failure and failed retry never claim an empty schedule; successful retry restores actual Slots', async ({ page }) => {
    let getCount = 0;
    let permitSuccessfulGet = false;
    await page.route('**/api/v1/tutor/slots', async route => {
      if (route.request().method() !== 'GET') { await route.continue(); return; }
      getCount++;
      // React StrictMode may start multiple initial GETs. Keep the server
      // unavailable until the test explicitly authorizes the successful retry.
      if (!permitSuccessfulGet) {
        await route.fulfill({
          status: 503, contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }),
        });
      } else {
        await route.continue(); // Real 200 and all persisted Slot rows from PostgreSQL.
      }
    });
    await signIn(page);
    const retry = page.getByRole('button', { name: 'โหลดอีกครั้ง' });
    await expect(retry).toBeVisible();
    await expect(page.getByText('ไม่สามารถโหลดรายการเวลาติวได้ กรุณาลองใหม่')).toBeVisible();
    await expect(page.getByText('ยังไม่มีช่วงเวลาติวที่เปิดไว้')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'รายการ Slot ทั้งหมด' })).toHaveCount(0);
    await expect(page.getByText('0', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: 'test-results/dashboard-get-error-503.png', fullPage: true });
    await retry.click(); // Second 503 must also keep the state unknown.
    await expect(retry).toBeVisible();
    await expect(page.getByText('ยังไม่มีช่วงเวลาติวที่เปิดไว้')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'รายการ Slot ทั้งหมด' })).toHaveCount(0);
    permitSuccessfulGet = true;
    await retry.click(); // Real authorized 200 with committed Slots.
    await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(4);
    for (const id of seedIds) await expect(page.locator('#all-slots [data-slot-id="' + id + '"]')).toHaveCount(1);
    await expect(page.getByText('ไม่สามารถโหลดรายการเวลาติวได้ กรุณาลองใหม่')).toHaveCount(0);
    expect(getCount).toBeGreaterThanOrEqual(3);
  });

  test('UX-R5 successful empty state is shown only after authenticated GET 200, not after initial 503 or failed retry', async ({ page }) => {
    const emptyTutor = 'dashboard-empty-retry-' + randomBytes(8).toString('hex') + '@example.test';
    await pool.query('INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3)',
      [emptyTutor, await argon2.hash(password), 'Tutor']);
    let getCount = 0;
    let permitSuccessfulGet = false;
    await page.route('**/api/v1/tutor/slots', async route => {
      if (route.request().method() !== 'GET') { await route.continue(); return; }
      getCount++;
      if (!permitSuccessfulGet) {
        await route.fulfill({
          status: 503, contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }),
        });
      } else {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        expect((await response.json() as { data: unknown[] }).data).toEqual([]);
        await route.fulfill({ response });
      }
    });
    await signIn(page, emptyTutor);
    const retry = page.getByRole('button', { name: 'โหลดอีกครั้ง' });
    await expect(retry).toBeVisible();
    await expect(page.getByText('ยังไม่มีช่วงเวลาติวที่เปิดไว้')).toHaveCount(0);
    await retry.click();
    await expect(retry).toBeVisible();
    await expect(page.getByText('ยังไม่มีช่วงเวลาติวที่เปิดไว้')).toHaveCount(0);
    permitSuccessfulGet = true;
    await retry.click();
    await expect(page.getByText('ยังไม่มีช่วงเวลาติวที่เปิดไว้')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'รายการ Slot ทั้งหมด' })).toBeVisible();
    await expect(page.getByText('0', { exact: true })).toBeVisible();
    await expect(retry).toHaveCount(0);
    expect(getCount).toBeGreaterThanOrEqual(3);
  });

  test('UX-R5-LOGOUT-01: pending CSRF hides private Tutor data and prevents new Slot POST', async ({ page }) => {
    await signIn(page);
    await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(4);
    let csrfStarted!: () => void;
    const started = new Promise<void>(resolve => { csrfStarted = resolve; });
    let releaseCsrf!: () => void;
    const held = new Promise<void>(resolve => { releaseCsrf = resolve; });
    let newSlotPosts = 0;
    page.on('request', req => {
      if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/v1/tutor/slots') newSlotPosts++;
    });
    await page.route('**/api/v1/auth/csrf', async route => {
      csrfStarted();
      await held;
      await route.continue();
    });
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await started; // Logout is still awaiting CSRF; it has not revoked the DB Session.
    await expect(page.locator('[data-slot-id]')).toHaveCount(0);
    await expect(page.getByText(tutorId.replaceAll('-', '').slice(-8))).toHaveCount(0);
    await expect(page.getByText('เข้าสู่ระบบแล้ว')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'เพิ่มเวลาติว' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'เพิ่มช่วงเวลาติว' })).toHaveCount(0);
    expect(newSlotPosts).toBe(0);
    releaseCsrf();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
    expect(newSlotPosts).toBe(0);
  });

  test('UX-R5-LOGOUT-01: a pending Create CSRF cannot become a Slot POST after Logout starts', async ({ page }) => {
    await signIn(page);
    await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(4);
    const before = (await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM "Slot" WHERE "tutorId"=$1', [tutorId],
    )).rows[0].n;
    await page.getByLabel('วันที่').fill(day(72));
    await page.getByLabel('เวลาเริ่ม').fill('12:47');
    let firstCsrf!: () => void;
    const createCsrfStarted = new Promise<void>(resolve => { firstCsrf = resolve; });
    let unblockCsrf!: () => void;
    const blocker = new Promise<void>(resolve => { unblockCsrf = resolve; });
    let csrfRequests = 0;
    let slotPostsAfterLogout = 0;
    let logoutStarted = false;
    page.on('request', request => {
      if (logoutStarted && request.method() === 'POST' &&
          new URL(request.url()).pathname === '/api/v1/tutor/slots') slotPostsAfterLogout++;
    });
    await page.route('**/api/v1/auth/csrf', async route => {
      csrfRequests++;
      if (csrfRequests === 1) firstCsrf();
      await blocker;
      await route.continue().catch(() => {}); // The old Create signal may be aborted by unmount.
    });
    await page.getByRole('button', { name: 'เพิ่มเวลาติว' }).click();
    await createCsrfStarted; // Auth CSRF response for Create is still held.
    logoutStarted = true;
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.locator('[data-slot-id]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'เพิ่มเวลาติว' })).toHaveCount(0);
    unblockCsrf();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
    const after = (await pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM "Slot" WHERE "tutorId"=$1', [tutorId],
    )).rows[0].n;
    expect(slotPostsAfterLogout).toBe(0);
    expect(after).toBe(before);
  });

  test('UX-R5-LOGOUT-02: failed Logout stays private and blocked; same-Tutor recheck + GET restores genuine Slots', async ({ page }) => {
    await signIn(page);
    await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(4);
    let newSlotPosts = 0;
    page.on('request', req => {
      if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/v1/tutor/slots') newSlotPosts++;
    });
    await page.route('**/api/v1/auth/logout', route => route.fulfill({
      status: 503, contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }),
    }));
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByRole('alert')).toContainText('ไม่สามารถยืนยันการออกจากระบบได้');
    await expect(page.locator('[data-slot-id]')).toHaveCount(0);
    await expect(page.getByText(tutorId.replaceAll('-', '').slice(-8))).toHaveCount(0);
    await expect(page.getByText('เข้าสู่ระบบแล้ว')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'เพิ่มเวลาติว' })).toHaveCount(0);
    await page.screenshot({ path: 'test-results/dashboard-logout-uncertain-503.png', fullPage: true });
    expect((await page.request.get('/api/v1/auth/me')).status()).toBe(200); // Server Session is still live, UI must not guess.
    await page.getByRole('button', { name: 'ตรวจสอบเซสชัน' }).click();
    await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(4);
    for (const id of seedIds) await expect(page.locator('#all-slots [data-slot-id="' + id + '"]')).toHaveCount(1);
    expect(newSlotPosts).toBe(0);
    await page.unroute('**/api/v1/auth/logout');
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
    await expect(page.locator('[data-slot-id]')).toHaveCount(0);
  });

  test('UX-R5-LOGOUT-02: recheck 503 keeps private UI hidden; a fresh 401 clears it', async ({ page }) => {
    await signIn(page);
    await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(4);
    await page.route('**/api/v1/auth/logout', route => route.fulfill({
      status: 503, contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }),
    }));
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByRole('button', { name: 'ตรวจสอบเซสชัน' })).toBeVisible();
    await page.route('**/api/v1/auth/me', route => route.fulfill({
      status: 503, contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }),
    }));
    await page.getByRole('button', { name: 'ตรวจสอบเซสชัน' }).click();
    await expect(page.locator('[data-slot-id]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'เพิ่มเวลาติว' })).toHaveCount(0);
    await page.unroute('**/api/v1/auth/me');
    await page.route('**/api/v1/auth/me', route => route.fulfill({
      status: 401, contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }),
    }));
    await page.getByRole('button', { name: 'ตรวจสอบเซสชัน' }).click();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
    await expect(page.locator('[data-slot-id]')).toHaveCount(0);
  });

  test('UX-R5-LOGOUT-02: same Tutor identity alone cannot restore dashboard if fresh Slot GET fails', async ({ page }) => {
    await signIn(page);
    await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(4);
    await page.route('**/api/v1/auth/logout', route => route.fulfill({
      status: 503, contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }),
    }));
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByRole('button', { name: 'ตรวจสอบเซสชัน' })).toBeVisible();
    expect((await page.request.get('/api/v1/auth/me')).status()).toBe(200);
    await page.route('**/api/v1/tutor/slots', route => route.fulfill({
      status: 503, contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }),
    }));
    await page.getByRole('button', { name: 'ตรวจสอบเซสชัน' }).click();
    await expect(page.getByRole('button', { name: 'ตรวจสอบเซสชัน' })).toBeVisible();
    await expect(page.locator('[data-slot-id]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'เพิ่มเวลาติว' })).toHaveCount(0);
    await page.unroute('**/api/v1/tutor/slots');
    await page.getByRole('button', { name: 'ตรวจสอบเซสชัน' }).click();
    await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(4);
    for (const id of seedIds) await expect(page.locator('#all-slots [data-slot-id="' + id + '"]')).toHaveCount(1);
  });

  test('UX-R5-LOGOUT-02: another identity cannot unlock prior Tutor content', async ({ page }) => {
    await signIn(page);
    await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(4);
    await page.route('**/api/v1/auth/logout', route => route.fulfill({
      status: 503, contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }),
    }));
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByRole('button', { name: 'ตรวจสอบเซสชัน' })).toBeVisible();
    await page.route('**/api/v1/auth/me', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ user: { id: '11111111-2222-4333-8444-555555555555', role: 'Tutor' } }),
    }));
    await page.getByRole('button', { name: 'ตรวจสอบเซสชัน' }).click();
    await expect(page.getByRole('alert')).toContainText('เซสชันเปลี่ยนบัญชีแล้ว');
    await expect(page.locator('[data-slot-id]')).toHaveCount(0);
    await expect(page.getByText(tutorId.replaceAll('-', '').slice(-8))).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'เพิ่มเวลาติว' })).toHaveCount(0);
  });

  test('UX-R5-LOGOUT-01: T2 login with failed /me hides T1 private data in the other tab', async ({ page, context }) => {
    const t2Email = 'dashboard-login-failed-me-' + randomBytes(8).toString('hex') + '@example.test';
    const created = await pool.query<{ id: string }>(
      'INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3) RETURNING "id"',
      [t2Email, await argon2.hash(password), 'Tutor'],
    );
    const t2Id = created.rows[0].id;
    const other = await context.newPage();
    try {
      // Open T2's login form before T1 logs in, so both tabs share the same
      // cookie without an earlier Logout event hiding T1's private view.
      await other.goto('/');
      await expect(other.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
      await signIn(page);
      await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(4);
      await expect(page.getByText(tutorId.replaceAll('-', '').slice(-8), { exact: true })).toBeVisible();

      // The real login must replace the shared HttpOnly cookie; only T2's
      // subsequent UI /auth/me is simulated as unavailable.
      await other.route('**/api/v1/auth/me', route => route.fulfill({
        status: 503, contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }),
      }));
      await other.getByLabel('อีเมล').fill(t2Email);
      await other.getByLabel('รหัสผ่าน').fill(password);
      const login = other.waitForResponse(response =>
        response.url().endsWith('/api/v1/auth/login') && response.request().method() === 'POST',
      );
      const failedMe = other.waitForResponse(response =>
        response.url().endsWith('/api/v1/auth/me') && response.request().method() === 'GET',
      );
      await other.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
      const loginResponse = await login;
      expect(loginResponse.status()).toBe(200);
      expect((await loginResponse.json() as { user: { id: string } }).user.id).toBe(t2Id);
      expect((await failedMe).status()).toBe(503);
      const actualSession = await other.request.get('/api/v1/auth/me');
      expect(actualSession.status()).toBe(200);
      expect((await actualSession.json() as { user: { id: string } }).user.id).toBe(t2Id);

      // Tab A receives no private-data GET here: hiding must be driven by the
      // cross-tab login signal even though Tab B cannot verify /auth/me.
      await expect(page.locator('[data-slot-id]')).toHaveCount(0);
      await expect(page.getByText(tutorId.replaceAll('-', '').slice(-8), { exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'ตรวจสอบเซสชัน' })).toBeVisible();
    } finally {
      await other.close();
    }
  });

  test('UX-R5-LOGOUT-02: two tabs must not render T2 Slots beneath a held T1 session recheck', async ({ page, context }) => {
    const t2Email = 'dashboard-switch-' + randomBytes(8).toString('hex') + '@example.test';
    const newUser = await pool.query<{ id: string }>(
      'INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3) RETURNING "id"',
      [t2Email, await argon2.hash(password), 'Tutor'],
    );
    const t2Id = newUser.rows[0].id;
    const t2Start = dateTime(day(81), '10:41');
    const inserted = await pool.query<{ id: string }>(
      'INSERT INTO "Slot"("tutorId","startsAt","endsAt") VALUES($1,$2,$3) RETURNING "id"',
      [t2Id, t2Start, new Date(t2Start.getTime() + 3_600_000)],
    );
    const t2SlotId = inserted.rows[0].id;

    await signIn(page);
    await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(4);
    await page.route('**/api/v1/auth/logout', route => route.fulfill({
      status: 503, contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }),
    }));
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByRole('button', { name: 'ตรวจสอบเซสชัน' })).toBeVisible();

    let releaseT1!: () => void;
    let markT1Me!: () => void;
    const heldResponse = new Promise<void>(resolve => { releaseT1 = resolve; });
    const receivedT1Me = new Promise<void>(resolve => { markT1Me = resolve; });
    let held = false;
    await page.route('**/api/v1/auth/me', async route => {
      const response = await route.fetch();
      if (!held && response.status() === 200) {
        held = true;
        const body = await response.json() as { user: { id: string } };
        expect(body.user.id).toBe(tutorId); // Genuine T1 Session captured before T2 login.
        markT1Me();
        await heldResponse; // Return T1 /me only after another tab has replaced the cookie.
      }
      await route.fulfill({ response });
    });

    const other = await context.newPage();
    try {
      await page.getByRole('button', { name: 'ตรวจสอบเซสชัน' }).click();
      await receivedT1Me;
      await other.goto('/');
      // A login from a second tab changes the real same-origin HttpOnly cookie;
      // no fake identity headers or fabricated Slot DTOs are involved.
      const loginStatus = await other.evaluate(async ({ email, password: pass }) => {
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: pass }),
        });
        return res.status;
      }, { email: t2Email, password });
      expect(loginStatus).toBe(200);
      expect((await other.request.get('/api/v1/auth/me')).status()).toBe(200);
      const t2List = await other.request.get('/api/v1/tutor/slots');
      expect(t2List.status()).toBe(200);
      expect((await t2List.json() as { data: { id: string }[] }).data.map(x => x.id)).toContain(t2SlotId);
      releaseT1();
      await expect(page.getByRole('button', { name: 'ตรวจสอบเซสชัน' })).toBeVisible();
      await expect(page.locator('[data-slot-id]')).toHaveCount(0);
      await expect(page.getByText(tutorId.replaceAll('-', '').slice(-8), { exact: true })).toHaveCount(0);
      await expect(page.locator('[data-slot-id="' + t2SlotId + '"]')).toHaveCount(0);
    } finally {
      releaseT1();
      await other.close();
    }
  });

  test('UX-R5-LOGOUT-02: cross-tab cookie replacement cannot create a Slot for the wrong Tutor', async ({ page, context }) => {
    const t2Email = 'dashboard-post-switch-' + randomBytes(8).toString('hex') + '@example.test';
    const user = await pool.query<{ id: string }>(
      'INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3) RETURNING "id"',
      [t2Email, await argon2.hash(password), 'Tutor'],
    );
    const t2Id = user.rows[0].id;
    await signIn(page);
    await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(4);
    await page.getByLabel('วันที่').fill(day(86));
    await page.getByLabel('เวลาเริ่ม').fill('11:47');
    const second = await context.newPage();
    try {
      await second.goto('/');
      const status = await second.evaluate(async ({ email, password: pass }) => {
        const response = await fetch('/api/v1/auth/login', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: pass }),
        });
        return response.status;
      }, { email: t2Email, password });
      expect(status).toBe(200);
      const post = page.waitForResponse(response =>
        response.url().includes('/api/v1/tutor/slots') && response.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'เพิ่มเวลาติว' }).click();
      expect((await post).status()).toBe(403);
      await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
      const persisted = await pool.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM "Slot" WHERE "tutorId"=$1', [t2Id],
      );
      expect(persisted.rows[0].n).toBe(0);
    } finally {
      await second.close();
    }
  });

  test('UX-R5-LOGOUT-01: Logout starting in another tab immediately hides private Tutor data', async ({ page, context }) => {
    await signIn(page);
    await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(4);
    const other = await context.newPage();
    let releaseCsrf!: () => void;
    const pending = new Promise<void>(resolve => { releaseCsrf = resolve; });
    let csrfStarted!: () => void;
    const began = new Promise<void>(resolve => { csrfStarted = resolve; });
    try {
      await other.goto('/');
      await expect(other.locator('#all-slots [data-slot-id]')).toHaveCount(4);
      await other.route('**/api/v1/auth/csrf', async route => {
        csrfStarted();
        await pending;
        await route.continue().catch(() => {});
      });
      await other.getByRole('button', { name: 'ออกจากระบบ' }).click();
      await began; // Session not revoked; the other tab must hide at Logout start.
      await expect(page.locator('[data-slot-id]')).toHaveCount(0);
      await expect(page.getByText(tutorId.replaceAll('-', '').slice(-8), { exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'ตรวจสอบเซสชัน' })).toBeVisible();
      releaseCsrf();
      await expect(other.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
      await expect(page.locator('[data-slot-id]')).toHaveCount(0);
    } finally {
      releaseCsrf();
      await other.close();
    }
  });

  test('UX-R4 non-text control boundaries satisfy 3:1 across focus, hover, disabled and error states', async ({ page }) => {
    await signIn(page);
    await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(4);
    const selectors = [
      '.slot-fields input[type="date"]',
      '.slot-fields input[type="time"]',
      '.calendar-step',
      '.calendar-today',
      '.calendar-date-picker',
    ];
    for (const selector of selectors) {
      const element = page.locator(selector).first();
      await expect(element).toBeVisible();
      const original = await computedControl(page, selector);
      expect(contrastFromCss(original.border, original.background), selector + ' border').toBeGreaterThanOrEqual(3);
      await element.hover();
      const hovered = await computedControl(page, selector);
      expect(contrastFromCss(hovered.border, hovered.background), selector + ' hover border').toBeGreaterThanOrEqual(3);
      await page.keyboard.press('Tab');
      await element.focus();
      const focused = await computedControl(page, selector);
      expect(focused.outlineWidth, selector + ' focus indicator').toBe('3px');
      expect(contrastFromCss(focused.outline, '#ffffff'), selector + ' focus versus white').toBeGreaterThanOrEqual(3);
    }
    const invalidDate = page.locator('.slot-fields input[type="date"]');
    await invalidDate.evaluate(node => node.setAttribute('aria-invalid', 'true'));
    const invalid = await computedControl(page, '.slot-fields input[type="date"]');
    expect(contrastFromCss(invalid.border, invalid.background), 'invalid date input border').toBeGreaterThanOrEqual(3);

    const step = page.locator('.calendar-step').first();
    await step.evaluate(node => { (node as HTMLButtonElement).disabled = true; });
    const disabled = await computedControl(page, '.calendar-step');
    expect(disabled.opacity, 'disabled calendar control remains distinguishable').toBe('1');
    expect(contrastFromCss(disabled.border, disabled.background)).toBeGreaterThanOrEqual(3);
  });

  test('UX-R4 retry button boundary and keyboard focus remain visible after real GET failure', async ({ page }) => {
    await page.route('**/api/v1/tutor/slots', route => route.fulfill({
      status: 503, contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }),
    }));
    await signIn(page);
    const retry = page.getByRole('button', { name: 'โหลดอีกครั้ง' });
    await expect(retry).toBeVisible();
    for (const state of ['default', 'hover', 'focus']) {
      if (state === 'hover') await retry.hover();
      if (state === 'focus') { await page.keyboard.press('Tab'); await retry.focus(); }
      const computed = await computedControl(page, '.retry-button');
      expect(contrastFromCss(computed.border, computed.background), 'retry ' + state).toBeGreaterThanOrEqual(3);
      if (state === 'focus') {
        expect(computed.outlineWidth).toBe('3px');
        expect(contrastFromCss(computed.outline, '#ffffff')).toBeGreaterThanOrEqual(3);
      }
    }
  });

  test('UX-R4 CTA uses approved dark text, visible border and focus contrast tokens', async ({ page }) => {
    await signIn(page);
    await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(4);
    const computed = await page.evaluate(() => {
      const header = document.querySelector('.dashboard-add-cta')!;
      const create = document.querySelector('.create-submit')!;
      const inspect = (element: Element) => {
        const css = getComputedStyle(element);
        return { foreground: css.color, background: css.backgroundColor, border: css.borderColor };
      };
      return { header: inspect(header), create: inspect(create) };
    });
    for (const [name, colors] of Object.entries(computed)) {
      expect(colors.foreground, name + ' dark ink').toBe('rgb(23, 33, 55)');
      expect(colors.background, name + ' orange fill').toBe('rgb(244, 119, 54)');
      expect(colors.border, name + ' boundary').toBe('rgb(217, 97, 35)');
    }
    await page.keyboard.press('Tab');
    await page.locator('.dashboard-add-cta').focus();
    await expect(page.locator('.dashboard-add-cta')).toHaveCSS('outline-color', 'rgb(170, 69, 25)');
    await expect(page.locator('.dashboard-add-cta')).toHaveCSS('outline-width', '3px');
    await expect(page.locator('.dashboard-add-cta')).toHaveCSS('outline-offset', '3px');
  });

  test('UX-R4 exact mobile, two-day and three-day breakpoint boundaries', async ({ page }) => {
    await signIn(page);
    await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(4);
    for (const [width, columns] of [[320, 0], [375, 0], [620, 0], [621, 2], [768, 2], [1060, 2], [1061, 3], [1280, 3]]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      expect(overflow, 'no horizontal overflow at ' + width).toBe(false);
      await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(4);
      if (columns === 0) await expect(page.getByRole('region', { name: /ปฏิทิน 24 ชั่วโมง/ })).toBeHidden();
      else {
        await expect(page.getByRole('region', { name: /ปฏิทิน 24 ชั่วโมง/ })).toBeVisible();
        await expect(page.locator('.calendar-day-heading')).toHaveCount(columns);
      }
    }
  });

  test('UX-R6 Customer sees original authorized Auth page, not Tutor private dashboard', async ({ page }) => {
    await signIn(page, customer);
    await expect(page.getByText('Customer', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ปฏิทินเวลาติว' })).toHaveCount(0);
    await expect(page.locator('[data-slot-id]')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'ยินดีต้อนรับ' })).toBeVisible();
  });

  test('UX-R2/R5/R6 renders newly committed arbitrary-minute Slot in calendar and full agenda', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page);
    await expect(page.locator('#all-slots [data-slot-id]')).toHaveCount(4);
    await page.getByLabel('วันที่').fill(day(60));
    await page.getByLabel('เวลาเริ่ม').fill('11:37');
    await expect(page.getByText('12:37', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'เพิ่มเวลาติว' }).click();
    await expect(page.getByText('บันทึกเวลาติวสำเร็จ')).toBeVisible();
    const persisted = await pool.query<{ id: string; startsAt: Date; endsAt: Date }>(
      'SELECT "id","startsAt","endsAt" FROM "Slot" WHERE "tutorId"=$1 AND "startsAt"=$2',
      [tutorId, dateTime(day(60), '11:37')],
    );
    expect(persisted.rows).toHaveLength(1);
    const inserted = persisted.rows[0];
    expect(inserted.endsAt.getTime() - inserted.startsAt.getTime()).toBe(3_600_000);
    await expect(page.locator('#all-slots [data-slot-id="' + inserted.id + '"]')).toHaveCount(1);
    const calendar = page.locator('[data-testid="calendar-slot"][data-slot-id="' + inserted.id + '"]');
    await expect(calendar).toHaveAttribute('data-start-minute', String(11 * 60 + 37));
    await expect(calendar).toContainText('ยังไม่มีการจอง');
    await page.screenshot({ path: 'test-results/dashboard-after-create-1280.png', fullPage: true });
    await page.reload();
    await expect(page.locator('#all-slots [data-slot-id="' + inserted.id + '"]')).toHaveCount(1);
  });
});
