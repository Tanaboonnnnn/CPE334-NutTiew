import { test, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';
import argon2 from 'argon2';
import { randomBytes, randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import {
  expandDayTimeGroupAndLocateOffer,
  navigateToCalendarMonth,
  selectCalendarDay,
} from './availability-calendar-helper';
loadEnv({ path: '.env', quiet: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const tag = randomBytes(6).toString('hex');
const password = 'CalendarUXPassword#2026';

const tutor1Email = `cal-ux-t1-${tag}@example.test`;
const tutor2Email = `cal-ux-t2-${tag}@example.test`;
const customer1Email = `cal-ux-c1-${tag}@example.test`;
const customer2Email = `cal-ux-c2-${tag}@example.test`;

let tutorAId = '';
let tutorBId = '';
let customer1Id = '';
let customer2Id = '';

const bangkokDayKey = (offsetDays: number): string =>
  new Date(Date.now() + offsetDays * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
const bangkokInstant = (dayKey: string, hhmm: string): Date =>
  new Date(`${dayKey}T${hhmm}:00.000+07:00`);

const cleanDay1 = bangkokDayKey(18);
const cleanDay2 = bangkokDayKey(19);
let cleanDay1PrimarySlotId = '';
let cleanDay2SlotId = '';

async function createUser(email: string, role: 'Customer' | 'Tutor'): Promise<string> {
  const hash = await argon2.hash(password);
  const res = await pool.query<{ id: string }>(
    'INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3) RETURNING "id"',
    [email, hash, role],
  );
  return res.rows[0].id;
}

async function createSlot(tutorId: string, start: Date, durationMinutes = 60): Promise<string> {
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const res = await pool.query<{ id: string }>(
    'INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle") VALUES($1,$2,$3,\'Offered\') RETURNING "id"',
    [tutorId, start, end],
  );
  return res.rows[0].id;
}

async function signIn(page: Page, email = customer1Email, navigate = true) {
  const h = randomBytes(12).toString('hex');
  await page.setExtraHTTPHeaders({
    'X-Forwarded-For': `2001:db8:${h.slice(0, 4)}:${h.slice(4, 8)}:${h.slice(8, 12)}::e`,
  });
  if (navigate) await page.goto('/');
  await page.getByLabel('อีเมล').fill(email);
  await page.getByLabel('รหัสผ่าน').fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page.getByText('เข้าสู่ระบบแล้ว')).toBeVisible();
}

async function deactivateAllExampleTutorsExcept(keepIds: string[]): Promise<void> {
  await pool.query(
    `UPDATE "User" SET "isActive"=false
     WHERE "role"='Tutor' AND "isActive"=true AND "email" LIKE '%@example.test' AND NOT ("id" = ANY($1::uuid[]))`,
    [keepIds],
  );
}

test.beforeAll(async () => {
  const t1 = await createUser(tutor1Email, 'Tutor');
  const t2 = await createUser(tutor2Email, 'Tutor');
  [tutorAId, tutorBId] = [t1, t2].sort((a, b) => a.localeCompare(b));
  customer1Id = await createUser(customer1Email, 'Customer');
  customer2Id = await createUser(customer2Email, 'Customer');

  await deactivateAllExampleTutorsExcept([tutorAId, tutorBId]);

  // Clean representative schedule across 2 days, with 9 distinct time groups on cleanDay1 (>6 triggers "ดูเวลาเพิ่มเติม")
  const morningTimes = ['08:00', '09:15', '10:30', '11:45', '13:00', '14:15', '15:30', '16:45', '18:00'];
  for (let i = 0; i < morningTimes.length; i++) {
    const t = morningTimes[i];
    const slotA = await createSlot(tutorAId, bangkokInstant(cleanDay1, t), 60);
    if (i === 0) cleanDay1PrimarySlotId = slotA;
    if (i < 2) {
      await createSlot(tutorBId, bangkokInstant(cleanDay1, t), 60);
    }
  }
  cleanDay2SlotId = await createSlot(tutorAId, bangkokInstant(cleanDay2, '23:30'), 60);
});

test.afterAll(async () => {
  await pool
    .query('UPDATE "User" SET "isActive"=false WHERE "id" = ANY($1::uuid[])', [
      [tutorAId, tutorBId, customer1Id, customer2Id].filter(Boolean),
    ])
    .catch(() => {});
  await pool.end();
});

test.describe('F-S1-03 UX-CAL-01..10 Customer Availability Option A Monthly Calendar E2E', () => {
  test.use({ timezoneId: 'Asia/Bangkok' });

  test('UX-CAL-01/03 handles 520+ real DB offers cleanly with progressive <=6 time groups, show-more button, exact intervals, zero filter chips, zero extra requests and server order', async ({
    page,
  }) => {
    const denseT1 = await createUser(`cal-dense-t1-${tag}@example.test`, 'Tutor');
    const denseT2 = await createUser(`cal-dense-t2-${tag}@example.test`, 'Tutor');
    const [denseTutorA, denseTutorB] = [denseT1, denseT2].sort((a, b) => a.localeCompare(b));
    const denseAnchorDay = bangkokDayKey(10); // Earlier than cleanDay1 so calendar auto-selects it
    const baseAnchorUtc = new Date(`${denseAnchorDay}T01:00:00.000Z`); // 08:00 Asia/Bangkok

    try {
      // Seed 520 real non-overlapping slots across 26 days x 10 hours x 2 Tutors = 520 real DB offers
      // Plus 2 non-hourly dense slots on denseAnchorDay so denseAnchorDay has 12 distinct intervals (24 offers)
      await pool.query(
        `INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle")
         SELECT
           CASE WHEN gs % 2 = 0 THEN $1::uuid ELSE $2::uuid END,
           $3::timestamptz + ((gs / 2) / 10) * INTERVAL '1 day' + ((gs / 2) % 10) * INTERVAL '1 hour',
           $3::timestamptz + ((gs / 2) / 10) * INTERVAL '1 day' + (((gs / 2) % 10) + 1) * INTERVAL '1 hour',
           'Offered'
         FROM generate_series(0, 519) AS gs`,
        [denseTutorA, denseTutorB, baseAnchorUtc.toISOString()],
      );
      await createSlot(denseTutorA, bangkokInstant(denseAnchorDay, '19:15'), 60);
      await createSlot(denseTutorA, bangkokInstant(denseAnchorDay, '21:15'), 60);

      const getAvailabilityUrls: string[] = [];
      let postBookingRequests = 0;
      page.on('request', req => {
        if (req.url().includes('/api/v1/customer/availability')) {
          getAvailabilityUrls.push(req.url());
        }
        if (req.url().includes('/api/v1/customer/bookings') && req.method() === 'POST') {
          postBookingRequests++;
        }
      });

      await page.setViewportSize({ width: 1280, height: 900 });
      await signIn(page, customer1Email);

      await expect(page.getByTestId('calendar-day-grid')).toBeVisible();
      expect(getAvailabilityUrls.length).toBeGreaterThanOrEqual(1);
      for (const u of getAvailabilityUrls) {
        expect(new URL(u).search).toBe('');
      }

      // Day count badge shows total offer count (22 on denseAnchorDay), NOT unique tutor count (2)
      const denseDayTile = page.getByTestId(`calendar-day-${denseAnchorDay}`);
      await expect(denseDayTile).toHaveAttribute('aria-pressed', 'true');
      await expect(denseDayTile).toHaveAttribute('data-offer-count', '22');
      await expect(page.getByTestId('day-offer-count-badge')).toHaveText('22 ช่วงเวลา');

      // Initial collapsed groups capped at 6; 0 offer rows mounted in DOM initially; zero period chips
      await expect(page.getByTestId('time-group-item')).toHaveCount(6);
      await expect(page.getByTestId('availability-offer')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^(เช้า|บ่าย|เย็น)$/ })).toHaveCount(0);

      const moreBtn = page.getByTestId('show-more-times-btn');
      await expect(moreBtn).toBeVisible();
      await expect(moreBtn).toContainText('ดูเวลาเพิ่มเติม (อีก 6 ช่วงเวลา)');

      await page.screenshot({ path: 'test-results/after-calendar-dense-500plus-1280.png', fullPage: true });

      const requestCountBeforeNav = getAvailabilityUrls.length;
      await moreBtn.click();
      await expect(page.getByTestId('time-group-item')).toHaveCount(12);
      await expect(page.getByTestId('show-more-times-btn')).toHaveCount(0);
      expect(getAvailabilityUrls.length).toBe(requestCountBeforeNav);
      expect(postBookingRequests).toBe(0);

      // Non-hourly interval 19:15-20:15 stays exact without snapping to 19:00
      const nonHourlyGroup = page.getByTestId('time-group-item').filter({ hasText: '19:15–20:15 น.' });
      await expect(nonHourlyGroup).toContainText('60 นาที');
      await expect(nonHourlyGroup).toContainText('1 ตัวเลือก');

      // Expand first 08:00-09:00 group -> reveals both Tutors in deterministic tutorRef ASC order
      const firstGroup = page.getByTestId('time-group-item').first();
      await firstGroup.getByTestId('time-group-toggle').click();
      const groupOffers = firstGroup.getByTestId('availability-offer');
      await expect(groupOffers).toHaveCount(2);
      const refs = await groupOffers.evaluateAll(els => els.map(e => e.getAttribute('data-tutor-ref') ?? ''));
      expect(refs).toEqual([...refs].sort((a, b) => a.localeCompare(b)));

      // No fabricated rating/subject/price or private email
      const bodyText = await page.locator('body').innerText();
      expect(bodyText).not.toContain('@example.test');
      expect(bodyText).not.toContain('cal-dense-');
    } finally {
      await pool
        .query('UPDATE "User" SET "isActive"=false WHERE "id" = ANY($1::uuid[])', [[denseT1, denseT2]])
        .catch(() => {});
    }
  });

  test('UX-CAL-02/03/07 crosses Nov->Dec(empty)->Jan year boundary, leap-year Feb 29 2028, exact interval distinction and UTC/Los_Angeles Bangkok timezone invariance', async ({
    browser,
  }) => {
    const slotNovBoundary1 = randomUUID();
    const slotNovBoundary2 = randomUUID();
    const slotNovTutorA1 = randomUUID();
    const slotNovTutorB1 = randomUUID();
    const slotNovTutorA2 = randomUUID();
    const slotJanNonHourly = randomUUID();

    const rolloverPayload = {
      data: [
        // 2026-11-28 23:30 - 2026-11-29 00:30 Asia/Bangkok (16:30Z -> 17:30Z)
        {
          slotId: slotNovBoundary1,
          tutorRef: tutorAId,
          startsAt: '2026-11-28T16:30:00.000Z',
          endsAt: '2026-11-28T17:30:00.000Z',
        },
        // 2026-11-29 00:30 - 01:30 Asia/Bangkok (17:30Z -> 18:30Z)
        {
          slotId: slotNovBoundary2,
          tutorRef: tutorAId,
          startsAt: '2026-11-28T17:30:00.000Z',
          endsAt: '2026-11-28T18:30:00.000Z',
        },
        // 2026-11-30 with 3 offers across 2 Tutors and distinct exact intervals
        {
          slotId: slotNovTutorA1,
          tutorRef: tutorAId,
          startsAt: '2026-11-30T03:15:00.000Z', // 10:15-11:15 Bangkok
          endsAt: '2026-11-30T04:15:00.000Z',
        },
        {
          slotId: slotNovTutorB1,
          tutorRef: tutorBId,
          startsAt: '2026-11-30T03:15:00.000Z', // 10:15-11:15 Bangkok (same pair -> 2 options)
          endsAt: '2026-11-30T04:15:00.000Z',
        },
        {
          slotId: slotNovTutorA2,
          tutorRef: tutorAId,
          startsAt: '2026-11-30T03:15:00.000Z', // 10:15-11:45 Bangkok (different endsAt -> separate group)
          endsAt: '2026-11-30T04:45:00.000Z',
        },
        // Dec 2026 intentionally empty; next eligible is Jan 2027 (within 60d of 2026-11-28T05:00Z)
        {
          slotId: slotJanNonHourly,
          tutorRef: tutorAId,
          startsAt: '2027-01-15T02:15:00.000Z', // 09:15-10:45 Bangkok (90 min)
          endsAt: '2027-01-15T03:45:00.000Z',
        },
      ],
      meta: { requestId: 'ux-cal-02-rollover', evaluatedAt: '2026-11-28T05:00:00.000Z' },
    };

    const leapPayload = {
      data: [
        {
          slotId: randomUUID(),
          tutorRef: tutorAId,
          startsAt: '2028-02-29T03:00:00.000Z', // Leap day 10:00-11:00 Bangkok
          endsAt: '2028-02-29T04:00:00.000Z',
        },
      ],
      meta: { requestId: 'ux-cal-02-leap', evaluatedAt: '2028-02-10T05:00:00.000Z' },
    };

    for (const tz of ['UTC', 'America/Los_Angeles']) {
      const ctx = await browser.newContext({ timezoneId: tz });
      const page = await ctx.newPage();
      let payloadMode: 'rollover' | 'leap' = 'rollover';
      try {
        await page.route('**/api/v1/customer/availability', async route => {
          const real = await route.fetch();
          const binding = real.headers()['x-nuttiew-session-binding'] ?? '';
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
              'Cache-Control': 'no-store',
              'X-NutTiew-Session-Binding': binding,
            },
            body: JSON.stringify(payloadMode === 'rollover' ? rolloverPayload : leapPayload),
          });
        });

        await signIn(page, customer1Email);
        await expect(page.getByTestId('calendar-month-heading')).toHaveText('พฤศจิกายน 2026');
        await expect(page.getByTestId('calendar-prev-month')).toBeDisabled();
        await expect(page.getByTestId('calendar-next-month')).toBeEnabled();

        // Earliest date 2026-11-28 preselected; 16:30Z -> 23:30-00:30 next day; 17:30Z -> 2026-11-29 00:30-01:30
        await expect(page.getByTestId('calendar-day-2026-11-28')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByTestId('calendar-day-2026-11-29')).toHaveAttribute('data-offer-count', '1');
        // 2026-11-30 has 3 offers across 2 Tutors -> must display 3, NOT 2
        await expect(page.getByTestId('calendar-day-2026-11-30')).toHaveAttribute('data-offer-count', '3');
        // Empty day is disabled with explicit empty accessible label
        const emptyNov13 = page.getByTestId('calendar-day-2026-11-13');
        await expect(emptyNov13).toBeDisabled();
        await expect(emptyNov13).toContainText('—');
        await expect(emptyNov13).toHaveAttribute('aria-label', /ไม่มีช่วงเวลาว่าง/);

        const nov28Offer = await expandDayTimeGroupAndLocateOffer(page, '2026-11-28', slotNovBoundary1, '23:30');
        await expect(nov28Offer).toContainText('23:30');
        await expect(nov28Offer).toContainText('00:30');
        await expect(nov28Offer).toContainText('สิ้นสุดในวันถัดไป');

        // 2026-11-30 distinguishes exact (10:15-11:15) from (10:15-11:45) without merging or hour snapping
        await selectCalendarDay(page, '2026-11-30');
        await expect(page.getByTestId('time-group-item')).toHaveCount(2);
        await expect(page.getByTestId('time-group-item').nth(0)).toContainText('10:15–11:15 น.');
        await expect(page.getByTestId('time-group-item').nth(0)).toContainText('2 ตัวเลือก');
        await expect(page.getByTestId('time-group-item').nth(1)).toContainText('10:15–11:45 น.');
        await expect(page.getByTestId('time-group-item').nth(1)).toContainText('90 นาที');
        await expect(page.getByTestId('time-group-item').nth(1)).toContainText('1 ตัวเลือก');

        // Navigate Nov 2026 -> Dec 2026 (intermediate empty month, NOT global empty) -> Jan 2027
        await page.getByTestId('calendar-next-month').click();
        await expect(page.getByTestId('calendar-month-heading')).toHaveText('ธันวาคม 2026');
        await expect(page.getByTestId('calendar-day-2026-12-31')).toBeVisible();
        await expect(page.getByTestId('calendar-month-empty')).toBeVisible();
        await expect(page.getByText('ยังไม่มีช่วงเวลาติวที่พร้อมให้เลือก')).toHaveCount(0);

        await page.getByTestId('calendar-next-month').click();
        await expect(page.getByTestId('calendar-month-heading')).toHaveText('มกราคม 2027');
        await expect(page.getByTestId('calendar-next-month')).toBeDisabled();
        await expect(page.getByTestId('calendar-select-day-prompt')).toBeVisible();

        const janOffer = await expandDayTimeGroupAndLocateOffer(page, '2027-01-15', slotJanNonHourly, '09:15');
        await expect(janOffer).toContainText('09:15');
        await expect(janOffer).toContainText('10:45');
        await expect(janOffer).toContainText('90 นาที');

        // Leap-year February 2028 verification on fresh refresh
        payloadMode = 'leap';
        await page.getByRole('button', { name: 'โหลดข้อมูลล่าสุด' }).click();
        await expect(page.getByTestId('calendar-month-heading')).toHaveText('กุมภาพันธ์ 2028');
        await expect(page.getByTestId('calendar-day-2028-02-29')).toHaveAttribute('data-offer-count', '1');
        await expect(page.getByTestId('calendar-day-2028-02-29')).toBeEnabled();
        await expect(page.getByTestId('calendar-day-2028-02-29')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByTestId('selected-day-heading')).toContainText('29 ');
        await expect(page.getByTestId('selected-day-heading')).toContainText('2028');
      } finally {
        await ctx.close();
      }
    }
  });

  test('UX-CAL-04/06 preserves selection across day transitions, clears non-unknown vanished selection cleanly with staleNotice, shows day-empty distinct from global empty, keeps unknownOutcome locked across days and empty data:[], and clears calendar on 503', async ({
    page,
  }) => {
    const dedicatedBookSlotId = await createSlot(tutorAId, bangkokInstant(cleanDay1, '19:30'), 60);
    let availabilityMode: 'live' | 'omit-day1-primary' | 'day1-all-gone' | 'empty' | 'fail-503' = 'live';
    let bookingMode: 'live' | 'unknown-503' = 'live';
    let postCount = 0;

    await page.route('**/api/v1/customer/availability', async route => {
      const real = await route.fetch();
      const binding = real.headers()['x-nuttiew-session-binding'] ?? '';
      if (availabilityMode === 'fail-503') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          headers: { 'Cache-Control': 'no-store' },
          body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Temporarily unavailable' } }),
        });
        return;
      }
      if (availabilityMode === 'live') {
        await route.fulfill({ response: real });
        return;
      }
      const json = (await real.json()) as {
        data: Array<{ slotId: string; tutorRef: string; startsAt: string; endsAt: string }>;
        meta: { requestId: string; evaluatedAt: string };
      };
      if (availabilityMode === 'omit-day1-primary') {
        json.data = json.data.filter(o => o.slotId !== cleanDay1PrimarySlotId);
      } else if (availabilityMode === 'day1-all-gone') {
        json.data = json.data.filter(o => {
          const bkkDay = new Date(Date.parse(o.startsAt) + 7 * 3_600_000).toISOString().slice(0, 10);
          return bkkDay !== cleanDay1;
        });
      } else if (availabilityMode === 'empty') {
        json.data = [];
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Cache-Control': 'no-store',
          'X-NutTiew-Session-Binding': binding,
        },
        body: JSON.stringify(json),
      });
    });

    await page.route('**/api/v1/customer/bookings', async route => {
      if (route.request().method() === 'POST') {
        postCount++;
        if (bookingMode === 'unknown-503') {
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            headers: { 'Cache-Control': 'no-store' },
            body: JSON.stringify({
              error: { code: 'BOOKING_OUTCOME_UNKNOWN', message: 'Outcome unknown' },
              requestId: 'ux-cal-unknown-503',
            }),
          });
          return;
        }
      }
      await route.continue();
    });

    await signIn(page, customer2Email);

    // Selecting days/time groups NEVER dispatches POST
    const offer1 = await expandDayTimeGroupAndLocateOffer(page, cleanDay1, cleanDay1PrimarySlotId, '08:00');
    await offer1.getByRole('button', { name: 'เลือกช่วงเวลานี้' }).click();
    const summary = page.locator('#selected-offer-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(tutorAId);
    await expect(summary).toContainText('ยังไม่ใช่การจอง');
    expect(postCount).toBe(0);

    // Switching to cleanDay2 keeps selectedSlotId/summary cleanly without POST
    await selectCalendarDay(page, cleanDay2);
    await expect(page.getByTestId('selected-day-heading')).toBeVisible();
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(tutorAId);
    expect(postCount).toBe(0);

    // UX-CAL-04 / PR #45 fix verification: if refresh removes non-unknown selectedSlotId, clear it + show staleNotice
    await selectCalendarDay(page, cleanDay1);
    availabilityMode = 'omit-day1-primary';
    await page.getByRole('button', { name: 'โหลดข้อมูลล่าสุด' }).click();
    await expect(page.locator('#selected-offer-summary')).toHaveCount(0);
    await expect(page.locator('.availability-stale-notice')).toBeVisible();

    // UX-CAL-06: When cleanDay1 has 0 offers left while cleanDay2 still has offers, Step 2 shows day-empty (never global empty)
    availabilityMode = 'day1-all-gone';
    await page.getByRole('button', { name: 'โหลดข้อมูลล่าสุด' }).click();
    await expect(page.getByTestId('calendar-day-empty')).toBeVisible();
    await expect(page.getByText('ยังไม่มีช่วงเวลาว่างในวันที่เลือก')).toBeVisible();
    await expect(page.getByText('ยังไม่มีช่วงเวลาติวที่พร้อมให้เลือก')).toHaveCount(0);

    // Recover live schedule and select dedicatedBookSlotId (19:30) -> trigger 503 BOOKING_OUTCOME_UNKNOWN
    availabilityMode = 'live';
    await page.getByRole('button', { name: 'โหลดข้อมูลล่าสุด' }).click();
    const offerSec = await expandDayTimeGroupAndLocateOffer(page, cleanDay1, dedicatedBookSlotId, '19:30');
    await offerSec.getByRole('button', { name: 'เลือกช่วงเวลานี้' }).click();
    bookingMode = 'unknown-503';
    await page.locator('#selected-offer-summary').getByRole('button', { name: 'ยืนยันการจอง' }).click();

    await expect(page.getByText('รอการยืนยันผลการจองช่วงเวลาติว')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ส่งคำขอเดิมอีกครั้ง' })).toBeVisible();

    // Switch day to cleanDay2 while unknownOutcome active -> summary stays locked AND day2's select button is disabled!
    const day2Offer = await expandDayTimeGroupAndLocateOffer(page, cleanDay2, cleanDay2SlotId, '23:30');
    await expect(day2Offer.getByRole('button', { name: 'เลือกช่วงเวลานี้' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'ส่งคำขอเดิมอีกครั้ง' })).toBeVisible();

    // Even if refresh returns confirmed data: [], unresolved unknownOutcome summary stays visible!
    availabilityMode = 'empty';
    await page.getByRole('button', { name: 'โหลดข้อมูลล่าสุด' }).click();
    await expect(page.getByText('ยังไม่มีช่วงเวลาติวที่พร้อมให้เลือก')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ส่งคำขอเดิมอีกครั้ง' })).toBeVisible();

    // Retrying with live booking endpoint succeeds (201) cleanly and clears unknown lock
    bookingMode = 'live';
    await page.getByRole('button', { name: 'ส่งคำขอเดิมอีกครั้ง' }).click();
    await expect(page.getByTestId('booking-confirmed-banner')).toBeVisible();

    // Finally, 503 on availability hides calendar grid completely (fail-closed)
    availabilityMode = 'fail-503';
    await page.getByRole('button', { name: 'โหลดข้อมูลล่าสุด' }).click();
    await expect(page.locator('#availability-error')).toBeVisible();
    await expect(page.getByTestId('calendar-day-grid')).toHaveCount(0);
  });

  test('UX-CAL-08/09 verifies keyboard navigation, concise aria-live, contrast, reduced motion, 200% zoom, geometry across 320/375/768/800/801/1280 CSS px and captures AFTER screenshots', async ({
    page,
  }) => {
    await signIn(page, customer1Email);
    await expect(page.getByTestId('calendar-day-grid')).toBeVisible();

    // Check aria-live concise announcement (< 100 chars, announces selected day & offer count)
    const liveMsg = (await page.getByTestId('calendar-live-status').innerText()).trim();
    expect(liveMsg).toMatch(/^เลือกวันที่ .+ พบ \d+ ช่วงเวลา$/);

    // Keyboard navigation (Tab + Enter/Space on calendar day -> expand group -> focus ring verification)
    const day2Btn = page.getByTestId(`calendar-day-${cleanDay2}`);
    await navigateToCalendarMonth(page, cleanDay2.slice(0, 7));
    await day2Btn.focus();
    await expect(day2Btn).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(day2Btn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('calendar-live-status')).toContainText('พบ 1 ช่วงเวลา');

    // Return to cleanDay1 for rich Step 2 UI screenshot (collapsed >6 groups first at 1280)
    await selectCalendarDay(page, cleanDay1);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'test-results/after-calendar-1280.png', fullPage: true });

    // Expand 08:00 group and select cleanDay1PrimarySlotId to check Step 3 placement & responsive widths
    const primaryOffer = await expandDayTimeGroupAndLocateOffer(page, cleanDay1, cleanDay1PrimarySlotId, '08:00');
    await primaryOffer.getByRole('button', { name: 'เลือกช่วงเวลานี้' }).click();
    await expect(page.locator('#selected-offer-summary')).toBeVisible();

    const widths = [320, 375, 768, 800, 801, 1280] as const;
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByTestId('calendar-day-grid')).toBeVisible();
      await expect(page.locator('#selected-offer-summary')).toBeVisible();

      // Zero horizontal page overflow
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow, `Horizontal overflow at ${width}px`).toBe(false);

      // Layout columns match container-query design (1 col at 320/375/801; 2 col at 768/800/1280)
      const calPaneBox = await page.locator('.availability-calendar-pane').boundingBox();
      const dayPaneBox = await page.locator('.availability-day-pane').boundingBox();
      const dayCardBox = await page.locator('.availability-day-card').boundingBox();
      const summaryBox = await page.locator('#selected-offer-summary').boundingBox();
      expect(calPaneBox).not.toBeNull();
      expect(dayPaneBox).not.toBeNull();
      expect(dayCardBox).not.toBeNull();
      expect(summaryBox).not.toBeNull();

      if (width === 768 || width === 800 || width === 1280) {
        expect(dayPaneBox!.x, `Expected 2 columns side-by-side at ${width}px`).toBeGreaterThanOrEqual(
          calPaneBox!.x + calPaneBox!.width - 1,
        );
      } else {
        expect(dayPaneBox!.y, `Expected 1 vertical stack at ${width}px`).toBeGreaterThanOrEqual(
          calPaneBox!.y + calPaneBox!.height - 1,
        );
      }

      // Non-sticky Step 3 summary strictly below Step 2 card
      const summaryPos = await page.locator('#selected-offer-summary').evaluate(el => getComputedStyle(el).position);
      expect(summaryPos).toBe('static');
      expect(summaryBox!.y).toBeGreaterThanOrEqual(dayCardBox!.y + dayCardBox!.height - 1);

      // Target sizing for day buttons and non-grid interactive controls
      const dayBtnBox = await page.getByTestId(`calendar-day-${cleanDay1}`).boundingBox();
      expect(dayBtnBox!.height).toBeGreaterThanOrEqual(44);
      expect(dayBtnBox!.width).toBeGreaterThanOrEqual(width === 320 ? 36 : 44);

      for (const control of [
        page.getByRole('button', { name: 'โหลดข้อมูลล่าสุด' }),
        page.getByTestId('calendar-prev-month'),
        page.getByTestId('calendar-next-month'),
        page.getByTestId('time-group-toggle').first(),
        page.getByTestId('show-more-times-btn'),
        primaryOffer.getByRole('button'),
        page.locator('#selected-offer-summary').getByRole('button', { name: 'ยืนยันการจอง' }),
        page.locator('#selected-offer-summary').getByRole('button', { name: 'ยกเลิกการเลือก' }),
      ]) {
        const box = await control.boundingBox();
        expect(box!.height, `Control height <44 at ${width}px`).toBeGreaterThanOrEqual(44);
        expect(box!.width, `Control width <44 at ${width}px`).toBeGreaterThanOrEqual(44);
        expect(box!.x + box!.width, `Control clipped right edge at ${width}px`).toBeLessThanOrEqual(width - 8);
      }

      await page.evaluate(() => window.scrollTo(0, 0));
      const shotName = width === 1280 ? 'after-calendar-selected-1280.png' : `after-calendar-${width}.png`;
      await page.screenshot({ path: `test-results/${shotName}`, fullPage: true });
    }

    // Contrast & focus ring audit across new calendar elements
    await page.setViewportSize({ width: 1280, height: 900 });
    const calContrast = await page.evaluate(() => {
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
      const calCard = document.querySelector('.availability-calendar-card')!;
      const kicker = document.querySelector('.availability-step-kicker')!;
      const selectedDay = document.querySelector('.calendar-day-selected')!;
      const selectedCue = document.querySelector('.calendar-day-selected-cue')!;
      const emptyDay = document.querySelector('.calendar-day-empty')!;
      const confirmBtn = document.querySelector('.confirm-booking-button')!;
      const timeToggle = document.querySelector('.time-group-toggle')!;
      return {
        kickerOnCard: ratio(getComputedStyle(kicker).color, getComputedStyle(calCard).backgroundColor),
        selectedDayText: ratio(getComputedStyle(selectedDay).color, getComputedStyle(selectedDay).backgroundColor),
        selectedCueText: ratio(getComputedStyle(selectedCue).color, getComputedStyle(selectedDay).backgroundColor),
        emptyDayBorder: ratio(getComputedStyle(emptyDay).borderTopColor, getComputedStyle(calCard).backgroundColor),
        confirmText: ratio(getComputedStyle(confirmBtn).color, getComputedStyle(confirmBtn).backgroundColor),
        confirmBorder: ratio(getComputedStyle(confirmBtn).borderTopColor, getComputedStyle(calCard).backgroundColor),
        timeToggleBorder: ratio(getComputedStyle(timeToggle).borderTopColor, getComputedStyle(calCard).backgroundColor),
      };
    });
    expect(calContrast.kickerOnCard).toBeGreaterThanOrEqual(4.5);
    expect(calContrast.selectedDayText).toBeGreaterThanOrEqual(4.5);
    expect(calContrast.selectedCueText).toBeGreaterThanOrEqual(4.5);
    expect(calContrast.emptyDayBorder).toBeGreaterThanOrEqual(3);
    expect(calContrast.confirmText).toBeGreaterThanOrEqual(4.5);
    expect(calContrast.confirmBorder).toBeGreaterThanOrEqual(3);
    expect(calContrast.timeToggleBorder).toBeGreaterThanOrEqual(3);

    // Focus outline visibility on calendar day cell via real keyboard Tab
    const firstDayCell = page.getByTestId(`calendar-day-${cleanDay1}`);
    await page.keyboard.press('Tab');
    await firstDayCell.focus();
    await expect(firstDayCell).toBeFocused();
    const outline = await firstDayCell.evaluate(el => {
      const s = getComputedStyle(el);
      return {
        outlineStyle: s.outlineStyle,
        outlineColor: s.outlineColor,
        outlineWidth: s.outlineWidth,
        outlineOffset: s.outlineOffset,
      };
    });
    expect(outline).toEqual({
      outlineStyle: 'solid',
      outlineColor: 'rgb(170, 69, 25)',
      outlineWidth: '3px',
      outlineOffset: '3px',
    });

    // PR #47 accessibility fix: keyboard Enter & Space on show-more transfers focus to 1st newly revealed group toggle (index 6)
    const showMoreBtn = page.getByTestId('show-more-times-btn');
    await expect(showMoreBtn).toBeVisible();
    await showMoreBtn.focus();
    await expect(showMoreBtn).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('show-more-times-btn')).toHaveCount(0);
    await expect(page.getByTestId('time-group-item')).toHaveCount(9);

    const activeAfterEnter = await page.evaluate(() => ({
      tag: document.activeElement?.tagName ?? null,
      testId: document.activeElement?.getAttribute('data-testid') ?? null,
    }));
    expect(activeAfterEnter).toEqual({ tag: 'BUTTON', testId: 'time-group-toggle' });

    const firstRevealedToggle = page.getByTestId('time-group-toggle').nth(6);
    await expect(firstRevealedToggle).toBeFocused();
    await expect(firstRevealedToggle).toContainText('15:30');
    const revealedFocusRing = await firstRevealedToggle.evaluate(el => {
      const s = getComputedStyle(el);
      return {
        focusVisible: el.matches(':focus-visible'),
        outlineStyle: s.outlineStyle,
        outlineColor: s.outlineColor,
        outlineWidth: s.outlineWidth,
        outlineOffset: s.outlineOffset,
      };
    });
    expect(revealedFocusRing).toEqual({
      focusVisible: true,
      outlineStyle: 'solid',
      outlineColor: 'rgb(170, 69, 25)',
      outlineWidth: '3px',
      outlineOffset: '3px',
    });

    await page.keyboard.press('Tab');
    await expect(page.getByTestId('time-group-toggle').nth(7)).toBeFocused();
    await expect(page.getByTestId('time-group-toggle').nth(7)).toContainText('16:45');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('time-group-toggle').nth(8)).toBeFocused();
    await expect(page.getByTestId('time-group-toggle').nth(8)).toContainText('18:00');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('time-group-toggle').nth(8)).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('time-group-item').nth(8).locator('.offer-select-button')).toBeFocused();

    // Reset collapsed state via day switch & verify Space activation at 375px sticky mobile header
    await selectCalendarDay(page, cleanDay2);
    await selectCalendarDay(page, cleanDay1);
    await page.setViewportSize({ width: 375, height: 720 });
    await expect(showMoreBtn).toBeVisible();
    await showMoreBtn.focus();
    await expect(showMoreBtn).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByTestId('time-group-item')).toHaveCount(9);
    await expect(firstRevealedToggle).toBeFocused();
    const mobileRevealedBox = await firstRevealedToggle.boundingBox();
    expect(mobileRevealedBox).not.toBeNull();
    expect(mobileRevealedBox!.y).toBeGreaterThanOrEqual(69);
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('time-group-toggle').nth(7)).toBeFocused();

    // Reduced motion check & 200% zoom viewport check (640x450)
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const transitionDuration = await firstDayCell.evaluate(el => getComputedStyle(el).transitionDuration);
    const seconds = transitionDuration.endsWith('ms')
      ? parseFloat(transitionDuration) / 1000
      : parseFloat(transitionDuration);
    expect(seconds).toBeLessThanOrEqual(0.001);

    await page.setViewportSize({ width: 640, height: 450 });
    const zoomOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(zoomOverflow).toBe(false);
  });
});
