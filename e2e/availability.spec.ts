import { test, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env', quiet: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const tag = randomBytes(6).toString('hex');
const password = 'AvailBrowserPassword#2026';

const tutor1Email = `avail-e2e-t1-${tag}@example.test`;
const tutor2Email = `avail-e2e-t2-${tag}@example.test`;
const tutor3Email = `avail-e2e-t3-${tag}@example.test`;
const customer1Email = `avail-e2e-c1-${tag}@example.test`;
const customer2Email = `avail-e2e-c2-${tag}@example.test`;

let tutorAId = '';
let tutorBId = '';
let tutorCId = '';
let customer1Id = '';
let customer2Id = '';

let slotMorningAId = '';
let slotMorningBId = '';
let slotCrossMidnightAId = '';
let slotOccupiedAId = '';
let slotC1BookedAId = '';
let slotOverlappingC1OnCId = '';
let slotAdjacentAfterBId = '';

const bangkokDayKey = (offsetDays: number): string =>
  new Date(Date.now() + offsetDays * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
const bangkokInstant = (dayKey: string, hhmm: string): Date =>
  new Date(`${dayKey}T${hhmm}:00.000+07:00`);

const day1 = bangkokDayKey(14);
const day2 = bangkokDayKey(15);

test.beforeAll(async () => {
  // Deactivate any leftover active Tutor accounts from prior interrupted runs so the customer view is deterministic
  await pool.query(`UPDATE "User" SET "isActive"=false WHERE "role"='Tutor' AND "email" LIKE 'avail-%@example.test'`);

  const hash = await argon2.hash(password);
  const t1 = await pool.query<{ id: string }>(
    'INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,\'Tutor\') RETURNING "id"',
    [tutor1Email, hash],
  );
  const t2 = await pool.query<{ id: string }>(
    'INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,\'Tutor\') RETURNING "id"',
    [tutor2Email, hash],
  );
  const t3 = await pool.query<{ id: string }>(
    'INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,\'Tutor\') RETURNING "id"',
    [tutor3Email, hash],
  );
  [tutorAId, tutorBId, tutorCId] = [t1.rows[0].id, t2.rows[0].id, t3.rows[0].id].sort((a, b) => a.localeCompare(b));

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

  const insertSlot = async (tutorId: string, start: Date) => {
    const end = new Date(start.getTime() + 3_600_000);
    const r = await pool.query<{ id: string }>(
      'INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle") VALUES($1,$2,$3,\'Offered\') RETURNING "id"',
      [tutorId, start, end],
    );
    return { id: r.rows[0].id, start, end };
  };

  // 1) Same-time morning offers at 10:15-11:15 Asia/Bangkok on day1 from Tutor B and Tutor A (AVA-01, AVA-08)
  const sMorningB = await insertSlot(tutorBId, bangkokInstant(day1, '10:15'));
  const sMorningA = await insertSlot(tutorAId, bangkokInstant(day1, '10:15'));
  slotMorningAId = sMorningA.id;
  slotMorningBId = sMorningB.id;

  // 2) Occupied slot on Tutor A at 12:00-13:00 Asia/Bangkok on day1 (booked by Customer 2) (AVA-02)
  const sOccupied = await insertSlot(tutorAId, bangkokInstant(day1, '12:00'));
  slotOccupiedAId = sOccupied.id;
  await pool.query(
    'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt","status") VALUES($1,$2,$3,$4,\'Booked\')',
    [customer2Id, sOccupied.id, sOccupied.start, sOccupied.end],
  );

  // 3) Customer 1 active booking on Tutor A at 14:00-15:00 Asia/Bangkok on day1
  const sC1Booked = await insertSlot(tutorAId, bangkokInstant(day1, '14:00'));
  slotC1BookedAId = sC1Booked.id;
  await pool.query(
    'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt","status") VALUES($1,$2,$3,$4,\'Booked\')',
    [customer1Id, sC1Booked.id, sC1Booked.start, sC1Booked.end],
  );

  // 4) Free Tutor C slot overlapping Customer 1's booking at 14:30-15:30 Asia/Bangkok on day1 (AVA-15: hidden for C1, visible for C2)
  const sOverlapC = await insertSlot(tutorCId, bangkokInstant(day1, '14:30'));
  slotOverlappingC1OnCId = sOverlapC.id;

  // 5) Free Tutor B slot adjacent to Customer 1's booking at 15:00-16:00 Asia/Bangkok on day1 (AVA-16: visible for C1)
  const sAdjacentB = await insertSlot(tutorBId, bangkokInstant(day1, '15:00'));
  slotAdjacentAfterBId = sAdjacentB.id;

  // 6) Cross-midnight offer at 23:30-00:30 Asia/Bangkok on day2 from Tutor A (AVA-04)
  const sMidnightA = await insertSlot(tutorAId, bangkokInstant(day2, '23:30'));
  slotCrossMidnightAId = sMidnightA.id;
});

test.afterAll(async () => {
  await pool
    .query('UPDATE "User" SET "isActive"=false WHERE "id" = ANY($1::uuid[])', [
      [tutorAId, tutorBId, tutorCId, customer1Id, customer2Id].filter(Boolean),
    ])
    .catch(() => {});
  await pool.end();
});

async function signIn(page: Page, email = customer1Email, navigate = true) {
  const h = randomBytes(12).toString('hex');
  await page.setExtraHTTPHeaders({
    'X-Forwarded-For': `2001:db8:${h.slice(0, 4)}:${h.slice(4, 8)}:${h.slice(8, 12)}::c`,
  });
  if (navigate) await page.goto('/');
  await page.getByLabel('อีเมล').fill(email);
  await page.getByLabel('รหัสผ่าน').fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page.getByText('เข้าสู่ระบบแล้ว')).toBeVisible();
}

test.describe('F-S1-03 Customer Availability UI / real PostgreSQL & Edge E2E (AVA-01..19)', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('AVA-01/02/04/05/08/15/16/17/18 renders Bangkok times in non-Bangkok browser, enforces bookable-only exclusions, deterministic order, opaque tutorRef and selection summary', async ({ page, browser }) => {
    await signIn(page, customer1Email);
    await expect(page.getByRole('heading', { name: 'เลือกช่วงเวลาติว' })).toBeVisible();
    await expect(page.getByText('Asia/Bangkok (UTC+07:00)')).toBeVisible();
    await expect(page.getByText(/ตรวจสอบล่าสุด:/)).toBeVisible();

    // Occupied and overlapping slots must NOT be rendered for Customer 1
    await expect(page.locator(`[data-offer-slot-id="${slotOccupiedAId}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-offer-slot-id="${slotC1BookedAId}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-offer-slot-id="${slotOverlappingC1OnCId}"]`)).toHaveCount(0);

    // Eligible slots for Customer 1 must be rendered
    const morningA = page.locator(`[data-offer-slot-id="${slotMorningAId}"]`);
    const morningB = page.locator(`[data-offer-slot-id="${slotMorningBId}"]`);
    const adjacentB = page.locator(`[data-offer-slot-id="${slotAdjacentAfterBId}"]`);
    const midnightA = page.locator(`[data-offer-slot-id="${slotCrossMidnightAId}"]`);

    await expect(morningA).toBeVisible();
    await expect(morningB).toBeVisible();
    await expect(adjacentB).toBeVisible();
    await expect(midnightA).toBeVisible();

    // Verify Bangkok times and cross-midnight badge
    await expect(morningA).toContainText('10:15');
    await expect(morningA).toContainText('11:15');
    await expect(morningA).toContainText(tutorAId);
    await expect(adjacentB).toContainText('15:00');
    await expect(adjacentB).toContainText('16:00');
    await expect(midnightA).toContainText('23:30');
    await expect(midnightA).toContainText('00:30');
    await expect(midnightA).toContainText('สิ้นสุดในวันถัดไป');

    // AVA-08: Verify deterministic order among our four Customer 1 slots:
    // morningA (day1 10:15, tutorA) -> morningB (day1 10:15, tutorB) -> adjacentB (day1 15:00, tutorB) -> midnightA (day2 23:30, tutorA)
    const renderedIds = await page.locator('[data-testid="availability-offer"]').evaluateAll(nodes =>
      nodes.map(n => n.getAttribute('data-offer-slot-id') ?? ''),
    );
    const ourOrder = renderedIds.filter(id =>
      [slotMorningAId, slotMorningBId, slotAdjacentAfterBId, slotCrossMidnightAId].includes(id),
    );
    expect(ourOrder).toEqual([slotMorningAId, slotMorningBId, slotAdjacentAfterBId, slotCrossMidnightAId]);

    // AVA-05/18: No email-derived name or private data appears in the page
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('@example.test');
    expect(bodyText).not.toContain('avail-e2e-');

    // Select an offer and verify Selected-offer summary states selection is NOT a Booking
    await morningA.getByRole('button', { name: 'เลือกช่วงเวลานี้' }).click();
    await expect(morningA.getByRole('button', { name: 'เลือกช่วงเวลานี้แล้ว' })).toHaveAttribute('aria-pressed', 'true');
    const summary = page.locator('#selected-offer-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(tutorAId);
    await expect(summary).toContainText('10:15');
    await expect(summary).toContainText('11:15');
    await expect(summary).toContainText('ยังไม่ใช่การจอง');

    // AVA-04: Verify identical Bangkok time rendering in UTC and Asia/Bangkok browser contexts
    for (const tz of ['UTC', 'Asia/Bangkok']) {
      const ctx = await browser.newContext({ timezoneId: tz });
      const tzPage = await ctx.newPage();
      try {
        await signIn(tzPage, customer2Email);
        await expect(tzPage.locator(`[data-offer-slot-id="${slotMorningAId}"]`)).toContainText('10:15');
        await expect(tzPage.locator(`[data-offer-slot-id="${slotMorningAId}"]`)).toContainText('11:15');
        await expect(tzPage.locator(`[data-offer-slot-id="${slotCrossMidnightAId}"]`)).toContainText('23:30');
        await expect(tzPage.locator(`[data-offer-slot-id="${slotCrossMidnightAId}"]`)).toContainText('00:30');
        // AVA-15/17: Customer 2 DOES see slotOverlappingC1OnCId (14:30-15:30)
        await expect(tzPage.locator(`[data-offer-slot-id="${slotOverlappingC1OnCId}"]`)).toContainText('14:30');
        await expect(tzPage.locator(`[data-offer-slot-id="${slotOverlappingC1OnCId}"]`)).toContainText('15:30');
      } finally {
        await ctx.close();
      }
    }
  });

  test('AVA-06/07 anonymous sees login screen, Tutor gets Tutor Dashboard and 403 on Customer endpoint, query params return 400', async ({ page }) => {
    const anonRes = await page.request.get('/api/v1/customer/availability');
    expect(anonRes.status()).toBe(401);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'ยินดีต้อนรับ' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'เลือกช่วงเวลาติว' })).toHaveCount(0);

    await signIn(page, tutor1Email, false);
    await expect(page.getByRole('heading', { name: 'ตารางเวลาติวของฉัน' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'เลือกช่วงเวลาติว' })).toHaveCount(0);

    const tutorCall = await page.request.get('/api/v1/customer/availability');
    expect(tutorCall.status()).toBe(403);

    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();

    await signIn(page, customer1Email, false);
    const badQuery = await page.request.get(`/api/v1/customer/availability?tutorId=${tutorAId}`);
    expect(badQuery.status()).toBe(400);
  });

  test('AVA-09/10 initial GET 503 and failed retry never claim empty; successful retry restores offers or confirmed empty state', async ({ page }) => {
    let mode: 'fail' | 'empty' | 'live' = 'fail';
    await page.route('**/api/v1/customer/availability', async route => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      if (mode === 'fail') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          headers: { 'Cache-Control': 'no-store' },
          body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' } }),
        });
      } else if (mode === 'empty') {
        const real = await route.fetch();
        expect(real.status()).toBe(200);
        const body = await real.json() as { meta: { requestId: string; evaluatedAt: string } };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: {
            'Cache-Control': 'no-store',
            'X-NutTiew-Session-Binding': real.headers()['x-nuttiew-session-binding'] ?? '',
          },
          body: JSON.stringify({ data: [], meta: body.meta }),
        });
      } else {
        await route.continue();
      }
    });

    await signIn(page, customer1Email);
    const retryBtn = page.getByRole('button', { name: 'โหลดอีกครั้ง' });
    await expect(retryBtn).toBeVisible();
    await expect(page.getByText('ไม่สามารถโหลดช่วงเวลาติวที่พร้อมให้เลือกได้ กรุณาลองใหม่')).toBeVisible();
    await expect(page.getByText('ยังไม่มีช่วงเวลาติวที่พร้อมให้เลือก')).toHaveCount(0);
    await expect(page.locator('[data-testid="availability-offer"]')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/customer-availability-error-503.png', fullPage: true });

    // Second failed retry still keeps state unknown, never empty
    await retryBtn.click();
    await expect(retryBtn).toBeVisible();
    await expect(page.getByText('ยังไม่มีช่วงเวลาติวที่พร้อมให้เลือก')).toHaveCount(0);

    // Confirmed empty 200 response shows empty state and evaluatedAt
    mode = 'empty';
    await retryBtn.click();
    await expect(page.getByText('ยังไม่มีช่วงเวลาติวที่พร้อมให้เลือก')).toBeVisible();
    await expect(page.getByText(/ตรวจสอบล่าสุด:/)).toBeVisible();
    await expect(retryBtn).toHaveCount(0);
    await page.screenshot({ path: 'test-results/customer-availability-empty-1280.png', fullPage: true });

    // Refresh to live populated offers
    mode = 'live';
    await page.getByRole('button', { name: 'โหลดข้อมูลล่าสุด' }).click();
    await expect(page.locator(`[data-offer-slot-id="${slotMorningAId}"]`)).toBeVisible();
    await expect(page.getByText('ยังไม่มีช่วงเวลาติวที่พร้อมให้เลือก')).toHaveCount(0);
  });

  test('AVA-10 malformed 200 payload (invalid offer fields or unparseable date) fails safely into read error and retry without crashing', async ({ page }) => {
    let mode: 'empty-object-offer' | 'invalid-evaluated-at' | 'valid' = 'empty-object-offer';
    await page.route('**/api/v1/customer/availability', async route => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      const real = await route.fetch();
      expect(real.status()).toBe(200);
      const binding = real.headers()['x-nuttiew-session-binding'] ?? '';
      const realBody = (await real.json()) as { meta: { requestId: string; evaluatedAt: string } };

      if (mode === 'empty-object-offer') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: {
            'Cache-Control': 'no-store',
            'X-NutTiew-Session-Binding': binding,
          },
          body: JSON.stringify({ data: [{}], meta: realBody.meta }),
        });
      } else if (mode === 'invalid-evaluated-at') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: {
            'Cache-Control': 'no-store',
            'X-NutTiew-Session-Binding': binding,
          },
          body: JSON.stringify({ data: [], meta: { requestId: 'req-1', evaluatedAt: 'invalid-date' } }),
        });
      } else {
        await route.fulfill({ response: real });
      }
    });

    await signIn(page, customer1Email);
    // Malformed offer data:[{}] must not crash React with RangeError: Invalid time value
    await expect(page.locator('#availability-error')).toBeVisible();
    await expect(page.getByText('ไม่สามารถโหลดช่วงเวลาติวที่พร้อมให้เลือกได้ กรุณาลองใหม่')).toBeVisible();
    await expect(page.locator('[data-testid="availability-offer"]')).toHaveCount(0);
    await expect(page.getByText('ยังไม่มีช่วงเวลาติวที่พร้อมให้เลือก')).toHaveCount(0);

    // Click retry with invalid evaluatedAt
    mode = 'invalid-evaluated-at';
    await page.getByRole('button', { name: 'โหลดอีกครั้ง' }).click();
    await expect(page.locator('#availability-error')).toBeVisible();
    await expect(page.getByText('ไม่สามารถโหลดช่วงเวลาติวที่พร้อมให้เลือกได้ กรุณาลองใหม่')).toBeVisible();
    await expect(page.getByText('ยังไม่มีช่วงเวลาติวที่พร้อมให้เลือก')).toHaveCount(0);

    // Click retry with valid payload -> recovers smoothly
    mode = 'valid';
    await page.getByRole('button', { name: 'โหลดอีกครั้ง' }).click();
    await expect(page.locator(`[data-offer-slot-id="${slotMorningAId}"]`)).toBeVisible();
    await expect(page.locator('#availability-error')).toHaveCount(0);
  });

  test('AVA-12 holds old Customer 200 across Logout/account switch and rejects mismatched X-NutTiew-Session-Binding', async ({ page }) => {
    await signIn(page, customer1Email);
    const offerA = page.locator(`[data-offer-slot-id="${slotMorningAId}"]`);
    await expect(offerA).toBeVisible();
    await offerA.getByRole('button', { name: 'เลือกช่วงเวลานี้' }).click();
    await expect(page.locator('#selected-offer-summary')).toBeVisible();

    let interceptRefresh = true;
    let signalCaptured!: () => void;
    const captured = new Promise<void>(resolve => { signalCaptured = resolve; });
    let releaseOld200!: () => void;
    const holdOld200 = new Promise<void>(resolve => { releaseOld200 = resolve; });
    let signalFulfilled!: () => void;
    const fulfilled = new Promise<void>(resolve => { signalFulfilled = resolve; });

    await page.route('**/api/v1/customer/availability', async route => {
      if (route.request().method() !== 'GET' || !interceptRefresh) {
        await route.continue();
        return;
      }
      interceptRefresh = false;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      signalCaptured();
      await holdOld200;
      await route.fulfill({ response });
      signalFulfilled();
    });

    await page.getByRole('button', { name: 'โหลดข้อมูลล่าสุด' }).click();
    await captured;

    // Logout while C1's authorized 200 is still held in flight
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
    await expect(page.locator('[data-testid="availability-offer"]')).toHaveCount(0);
    await expect(page.locator('#selected-offer-summary')).toHaveCount(0);

    // Release the held C1 200 after Logout — it must never repaint
    releaseOld200();
    await fulfilled;
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
    await expect(page.locator('[data-testid="availability-offer"]')).toHaveCount(0);

    await page.unroute('**/api/v1/customer/availability');

    // Now log back in as Customer 1, select an offer, then deliver a response with mismatched X-NutTiew-Session-Binding
    await signIn(page, customer1Email, false);
    await expect(page.locator(`[data-offer-slot-id="${slotMorningAId}"]`)).toBeVisible();
    await page.locator(`[data-offer-slot-id="${slotMorningAId}"]`).getByRole('button', { name: 'เลือกช่วงเวลานี้' }).click();
    await expect(page.locator('#selected-offer-summary')).toBeVisible();

    await page.route('**/api/v1/customer/availability', async route => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          'x-nuttiew-session-binding': 'mismatched-binding-value',
        },
      });
    });

    await page.getByRole('button', { name: 'โหลดข้อมูลล่าสุด' }).click();
    // Binding mismatch must immediately clear offers/selection and return to signed-out Auth
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
    await expect(page.locator('[data-testid="availability-offer"]')).toHaveCount(0);
    await expect(page.locator('#selected-offer-summary')).toHaveCount(0);
  });

  test('AVA-12 Customer logout failure stays guarded and private; retry succeeds and recheck restores genuine offers', async ({ page }) => {
    await signIn(page, customer1Email);
    await expect(page.locator(`[data-offer-slot-id="${slotMorningAId}"]`)).toBeVisible();

    // 1) Inject 503 on logout
    await page.route('**/api/v1/auth/logout', route =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'no-store' },
        body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }),
      }),
    );

    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();

    // 2) Verify private offers and verified account banner are immediately hidden, no false confirmed empty
    await expect(page.getByRole('alert')).toContainText('ไม่สามารถยืนยันการออกจากระบบได้');
    await expect(page.locator('[data-offer-slot-id]')).toHaveCount(0);
    await expect(page.getByText('เข้าสู่ระบบแล้ว')).toHaveCount(0);
    await expect(page.getByText('ยังไม่มีช่วงเวลาติวที่พร้อมให้เลือก')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'ตรวจสอบสถานะเซสชัน' })).toBeVisible();

    // 3) Recheck session: session is still live on server, recheck restores Customer availability
    const recheckBtn = page.getByRole('button', { name: 'ตรวจสอบเซสชัน' });
    const retryLogoutBtn = page.getByRole('button', { name: 'ลองออกจากระบบอีกครั้ง' });
    await expect(recheckBtn).toBeVisible();
    await expect(retryLogoutBtn).toBeVisible();

    await recheckBtn.click();
    await expect(page.locator(`[data-offer-slot-id="${slotMorningAId}"]`)).toBeVisible();
    await expect(page.getByText('เข้าสู่ระบบแล้ว')).toBeVisible();

    // 4) Now unroute logout 503 and logout cleanly
    await page.unroute('**/api/v1/auth/logout');
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
  });

  test('AVA-13/19 responsive viewports 320/375/768/1280px, keyboard selection, target sizes, WCAG contrast and shared Tutor design tokens', async ({ page }) => {
    await signIn(page, customer1Email);
    await expect(page.locator(`[data-offer-slot-id="${slotMorningAId}"]`)).toBeVisible();

    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole('heading', { name: 'เลือกช่วงเวลาติว' })).toBeVisible();
      await expect(page.locator(`[data-offer-slot-id="${slotMorningAId}"]`)).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow, `Customer availability horizontal overflow at ${width}px`).toBe(false);

      const selectBtn = page.locator(`[data-offer-slot-id="${slotMorningAId}"]`).getByRole('button');
      const box = await selectBtn.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);

      const refreshBtn = page.getByRole('button', { name: 'โหลดข้อมูลล่าสุด' });
      const refreshBox = await refreshBtn.boundingBox();
      expect(refreshBox!.height).toBeGreaterThanOrEqual(44);
      expect(refreshBox!.width).toBeGreaterThanOrEqual(44);

      await page.screenshot({ path: `test-results/customer-availability-${width}.png`, fullPage: true });
    }

    // Mobile navigation drawer check at 320px
    await page.setViewportSize({ width: 320, height: 900 });
    await page.getByRole('button', { name: 'เปิดเมนูนำทาง' }).click();
    await expect(page.getByRole('link', { name: 'เลือกช่วงเวลาติว' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'บัญชีของฉัน' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'ตารางเวลาของฉัน' })).toHaveCount(0);
    await page.getByRole('button', { name: 'ปิดเมนูนำทาง' }).click();

    // Keyboard-only selection and focus ring verification at 1280px
    await page.setViewportSize({ width: 1280, height: 900 });
    const firstOfferBtn = page.locator(`[data-offer-slot-id="${slotMorningAId}"]`).getByRole('button', { name: 'เลือกช่วงเวลานี้' });
    await page.keyboard.press('Tab');
    await firstOfferBtn.focus();
    await expect(firstOfferBtn).toBeFocused();
    const focusStyle = await firstOfferBtn.evaluate(el => {
      const s = getComputedStyle(el);
      return { outlineColor: s.outlineColor, outlineWidth: s.outlineWidth, outlineOffset: s.outlineOffset };
    });
    expect(focusStyle).toEqual({
      outlineColor: 'rgb(170, 69, 25)',
      outlineWidth: '3px',
      outlineOffset: '3px',
    });

    await page.keyboard.press('Enter');
    await expect(page.locator('#selected-offer-summary')).toBeVisible();
    await page.screenshot({ path: 'test-results/customer-availability-selected-1280.png', fullPage: true });

    // Measure WCAG 2.2 AA contrast ratios on Customer Availability
    const customerTokensAndContrast = await page.evaluate(() => {
      function channels(value: string): number[] {
        const m = value.match(/\d+(?:\.\d+)?/g);
        if (!m || m.length < 3) throw new Error('Bad color: ' + value);
        return m.slice(0, 3).map(Number);
      }
      function lum(color: string): number {
        const [r, g, b] = channels(color).map(n => {
          const c = n / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return r * 0.2126 + g * 0.7152 + b * 0.0722;
      }
      function ratio(a: string, b: string): number {
        const la = lum(a);
        const lb = lum(b);
        return Number(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)).toFixed(2));
      }
      const app = document.querySelector('.customer-app')!;
      const sidebar = document.querySelector('.customer-sidebar')!;
      const brand = document.querySelector('.sidebar-brand strong')!;
      const heading = document.querySelector('#availability-heading')!;
      const surface = document.querySelector('.availability-surface')!;
      const offerHours = document.querySelector('.offer-hours')!;
      const tutorRefText = document.querySelector('.offer-tutor-ref')!;
      const primaryBtn = document.querySelector('.offer-select-button[aria-pressed="false"]')!;
      const refreshBtn = document.querySelector('.availability-refresh-button')!;

      return {
        tokens: {
          fontFamily: getComputedStyle(app).fontFamily,
          canvasBg: getComputedStyle(app).backgroundColor,
          sidebarBg: getComputedStyle(sidebar).backgroundColor,
          surfaceBg: getComputedStyle(surface).backgroundColor,
          primaryBtnBg: getComputedStyle(primaryBtn).backgroundColor,
          primaryBtnColor: getComputedStyle(primaryBtn).color,
          primaryBtnBorder: getComputedStyle(primaryBtn).borderTopColor,
        },
        contrasts: {
          brandOnSidebar: ratio(getComputedStyle(brand).color, getComputedStyle(sidebar).backgroundColor),
          headingOnCanvas: ratio(getComputedStyle(heading).color, getComputedStyle(app).backgroundColor),
          hoursOnSurface: ratio(getComputedStyle(offerHours).color, getComputedStyle(surface).backgroundColor),
          tutorRefOnSurface: ratio(getComputedStyle(tutorRefText).color, getComputedStyle(surface).backgroundColor),
          primaryBtnText: ratio(getComputedStyle(primaryBtn).color, getComputedStyle(primaryBtn).backgroundColor),
          refreshBtnBorderOnSurface: ratio(getComputedStyle(refreshBtn).borderTopColor, getComputedStyle(surface).backgroundColor),
        },
      };
    });

    expect(customerTokensAndContrast.contrasts.brandOnSidebar).toBeGreaterThanOrEqual(4.5);
    expect(customerTokensAndContrast.contrasts.headingOnCanvas).toBeGreaterThanOrEqual(4.5);
    expect(customerTokensAndContrast.contrasts.hoursOnSurface).toBeGreaterThanOrEqual(4.5);
    expect(customerTokensAndContrast.contrasts.tutorRefOnSurface).toBeGreaterThanOrEqual(4.5);
    expect(customerTokensAndContrast.contrasts.primaryBtnText).toBeGreaterThanOrEqual(4.5);
    expect(customerTokensAndContrast.contrasts.refreshBtnBorderOnSurface).toBeGreaterThanOrEqual(3);
    console.info('CUSTOMER_AVAILABILITY_CONTRAST', JSON.stringify(customerTokensAndContrast.contrasts));

    // AVA-19: Switch to Tutor Dashboard and verify shared design tokens match Customer Availability
    await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
    await signIn(page, tutor1Email, false);
    await expect(page.getByRole('heading', { name: 'ตารางเวลาติวของฉัน' })).toBeVisible();

    const tutorTokens = await page.evaluate(() => {
      const app = document.querySelector('.tutor-app')!;
      const sidebar = document.querySelector('.tutor-sidebar')!;
      const card = document.querySelector('.dashboard-card')!;
      const cta = document.querySelector('.dashboard-add-cta')!;
      return {
        fontFamily: getComputedStyle(app).fontFamily,
        canvasBg: getComputedStyle(app).backgroundColor,
        sidebarBg: getComputedStyle(sidebar).backgroundColor,
        surfaceBg: getComputedStyle(card).backgroundColor,
        primaryBtnBg: getComputedStyle(cta).backgroundColor,
        primaryBtnColor: getComputedStyle(cta).color,
        primaryBtnBorder: getComputedStyle(cta).borderTopColor,
      };
    });

    expect(customerTokensAndContrast.tokens).toEqual(tutorTokens);
  });
});
