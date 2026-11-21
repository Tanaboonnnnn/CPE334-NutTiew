import { test, expect } from '@playwright/test';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
test.use({ timezoneId: 'America/Los_Angeles' });
test.afterAll(async () => {
  await pool.end();
});

test('F-S2-02 browser reschedule: same-time cross-Tutor move, old slot reopened, quota preserved after reload + detail open', async ({
  page,
  context,
}) => {
  const url = new URL(process.env.DATABASE_URL ?? 'invalid:');
  expect(url.hostname).toBe('127.0.0.1');
  expect(
    (url.port === '15449' && url.pathname === '/nuttiew_116_review') ||
      (process.env.GITHUB_ACTIONS === 'true' && url.port === '5432' && url.pathname === '/nuttiew_ci'),
  ).toBe(true);

  const person = async (role: string) =>
    (
      await pool.query<{ id: string }>(
        'INSERT INTO "User" (email,"passwordHash",role) VALUES ($1,$2,$3) RETURNING id',
        [randomUUID() + '@reschedule-e2e.example.test', 'fixture', role],
      )
    ).rows[0].id;

  const owner = await person('Customer');
  const tutorA = await person('Tutor');
  const tutorB = await person('Tutor');
  // Exact same-time cross-Tutor replacement (P1 regression: must appear in reschedule picker).
  const startOld = new Date(Date.now() + 5 * 60 * 60_000);
  const endOld = new Date(startOld.getTime() + 60 * 60_000);

  const oldSlot = (
    await pool.query<{ id: string }>(
      'INSERT INTO "Slot" ("tutorId","startsAt","endsAt") VALUES ($1,$2,$3) RETURNING id',
      [tutorA, startOld, endOld],
    )
  ).rows[0].id;
  const newSlot = (
    await pool.query<{ id: string }>(
      'INSERT INTO "Slot" ("tutorId","startsAt","endsAt") VALUES ($1,$2,$3) RETURNING id',
      [tutorB, startOld, endOld],
    )
  ).rows[0].id;
  const bookingId = (
    await pool.query<{ id: string }>(
      'INSERT INTO "Booking" ("customerId","currentSlotId","startsAt","endsAt") VALUES ($1,$2,$3,$4) RETURNING id',
      [owner, oldSlot, startOld, endOld],
    )
  ).rows[0].id;

  const token = randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO "Session" ("userId","tokenDigest","csrfNonce","expiresAt") VALUES ($1,$2,$3,clock_timestamp()+interval '8 hours')`,
    [owner, createHash('sha256').update(token).digest(), randomBytes(32)],
  );
  await context.addCookies([
    { name: 'nuttiew_session_dev', value: token, url: 'http://localhost:5173', httpOnly: true, sameSite: 'Lax' },
  ]);

  try {
    await page.goto('/');
    await page.getByTestId('nav-my-bookings').click();
    const card = page.locator('[data-booking-id="' + bookingId + '"]');
    const action = card.getByTestId('reschedule-booking');
    await expect(action).toBeVisible();
    await action.click();

    const dialog = page.getByRole('dialog', { name: 'เลื่อนนัด' });
    await expect(dialog.getByRole('heading')).toBeFocused();
    await expect(dialog).toContainText('Asia/Bangkok');
    await expect(dialog).toContainText('60 นาที');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(action).toBeFocused();

    await action.press('Enter');
    const destOption = dialog.locator(`[data-testid="reschedule-offer-option"][data-slot-id="${newSlot}"]`);
    await expect(destOption).toBeVisible();
    await destOption.click();

    const confirm = dialog.getByTestId('confirm-reschedule-btn');
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(dialog).toBeHidden();
    await expect(card.getByTestId('reschedule-used-note')).toBeVisible();
    await expect(card.getByTestId('reschedule-booking')).toHaveCount(0);

    // Reload persists one-reschedule quota & new Tutor; opening Booking Detail must NOT re-expose reschedule button.
    await page.reload();
    await page.getByTestId('nav-my-bookings').click();
    await expect(card.getByTestId('reschedule-used-note')).toBeVisible();
    await expect(card.getByTestId('reschedule-booking')).toHaveCount(0);

    await card.getByTestId('view-booking-detail').click();
    const detailModal = page.locator('#customer-booking-detail-modal');
    await expect(detailModal.getByTestId('detail-booking-id')).toHaveText(bookingId);
    await expect(detailModal.getByTestId('reschedule-used-note')).toBeVisible();
    await expect(detailModal.getByTestId('reschedule-booking')).toHaveCount(0);
    await detailModal.getByTestId('close-detail-btn').click();
    await expect(card.getByTestId('reschedule-used-note')).toBeVisible();
    await expect(card.getByTestId('reschedule-booking')).toHaveCount(0);

    // Same-time oldSlot is reopened on Tutor A (excluded from owner's S1 availability because owner is still booked at startOld,
    // so verify directly via DB lifecycle & occupancy + reschedule/options does not expose newSlot).
    const { rows: [oldSlotRow] } = await pool.query('SELECT lifecycle FROM "Slot" WHERE id=$1', [oldSlot]);
    expect(oldSlotRow.lifecycle).toBe('Offered');
    const { rows: oldOcc } = await pool.query(
      `SELECT id FROM "Booking" WHERE "currentSlotId"=$1 AND status='Booked'`,
      [oldSlot],
    );
    expect(oldOcc).toHaveLength(0);

    const { rows: [bRow] } = await pool.query(
      'SELECT "currentSlotId", status FROM "Booking" WHERE id=$1',
      [bookingId],
    );
    expect(bRow).toEqual({ currentSlotId: newSlot, status: 'Booked' });
  } finally {
    await pool.query('UPDATE "User" SET "isActive"=false WHERE id=ANY($1::uuid[])', [[owner, tutorA, tutorB]]);
  }
});

test('F-S2-02 browser reschedule: slow options response for Booking A cannot overwrite Booking B picker', async ({
  page,
  context,
}) => {
  const person = async (role: string) =>
    (
      await pool.query<{ id: string }>(
        'INSERT INTO "User" (email,"passwordHash",role) VALUES ($1,$2,$3) RETURNING id',
        [randomUUID() + '@reschedule-race.example.test', 'fixture', role],
      )
    ).rows[0].id;

  const owner = await person('Customer');
  const tutorA = await person('Tutor');
  const tutorB = await person('Tutor');
  const tutorC = await person('Tutor');
  const startA = new Date(Date.now() + 6 * 60 * 60_000);
  const endA = new Date(startA.getTime() + 60 * 60_000);
  const startB = new Date(Date.now() + 10 * 60 * 60_000);
  const endB = new Date(startB.getTime() + 60 * 60_000);

  const slotA = (
    await pool.query<{ id: string }>(
      'INSERT INTO "Slot" ("tutorId","startsAt","endsAt") VALUES ($1,$2,$3) RETURNING id',
      [tutorA, startA, endA],
    )
  ).rows[0].id;
  const slotB = (
    await pool.query<{ id: string }>(
      'INSERT INTO "Slot" ("tutorId","startsAt","endsAt") VALUES ($1,$2,$3) RETURNING id',
      [tutorB, startB, endB],
    )
  ).rows[0].id;
  // slotForA is eligible ONLY for Booking A (overlaps Booking A, not B);
  // slotForB is eligible ONLY for Booking B (overlaps Booking B, not A).
  const slotForA = (
    await pool.query<{ id: string }>(
      'INSERT INTO "Slot" ("tutorId","startsAt","endsAt") VALUES ($1,$2,$3) RETURNING id',
      [tutorC, startA, endA],
    )
  ).rows[0].id;
  const slotForB = (
    await pool.query<{ id: string }>(
      'INSERT INTO "Slot" ("tutorId","startsAt","endsAt") VALUES ($1,$2,$3) RETURNING id',
      [tutorC, startB, endB],
    )
  ).rows[0].id;

  const bookingA = (
    await pool.query<{ id: string }>(
      'INSERT INTO "Booking" ("customerId","currentSlotId","startsAt","endsAt") VALUES ($1,$2,$3,$4) RETURNING id',
      [owner, slotA, startA, endA],
    )
  ).rows[0].id;
  const bookingB = (
    await pool.query<{ id: string }>(
      'INSERT INTO "Booking" ("customerId","currentSlotId","startsAt","endsAt") VALUES ($1,$2,$3,$4) RETURNING id',
      [owner, slotB, startB, endB],
    )
  ).rows[0].id;

  const token = randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO "Session" ("userId","tokenDigest","csrfNonce","expiresAt") VALUES ($1,$2,$3,clock_timestamp()+interval '8 hours')`,
    [owner, createHash('sha256').update(token).digest(), randomBytes(32)],
  );
  await context.addCookies([
    { name: 'nuttiew_session_dev', value: token, url: 'http://localhost:5173', httpOnly: true, sameSite: 'Lax' },
  ]);

  let releaseSlowA!: () => void;
  const slowAGate = new Promise<void>(resolve => {
    releaseSlowA = resolve;
  });
  let slowACaptured = false;

  await page.route(`**/api/v1/customer/bookings/${bookingA}/reschedule/options`, async route => {
    slowACaptured = true;
    const response = await route.fetch();
    await slowAGate;
    try {
      await route.fulfill({ response });
    } catch {
      // Request may already be aborted by the UI race guard.
    }
  });

  try {
    await page.goto('/');
    await page.getByTestId('nav-my-bookings').click();

    const cardA = page.locator('[data-booking-id="' + bookingA + '"]');
    const cardB = page.locator('[data-booking-id="' + bookingB + '"]');
    await cardA.getByTestId('reschedule-booking').click();
    const dialog = page.getByRole('dialog', { name: 'เลื่อนนัด' });
    await expect(dialog).toBeVisible();

    // Close Booking A's dialog while its options request is still in-flight, then open Booking B.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await cardB.getByTestId('reschedule-booking').click();
    await expect(dialog).toBeVisible();

    const optionB = dialog.locator(`[data-testid="reschedule-offer-option"][data-slot-id="${slotForB}"]`);
    const optionA = dialog.locator(`[data-testid="reschedule-offer-option"][data-slot-id="${slotForA}"]`);
    await expect(optionB).toBeVisible();
    await expect(optionA).toHaveCount(0);

    // Release Booking A's slow response and verify Booking B's picker is NOT overwritten.
    expect(slowACaptured).toBe(true);
    releaseSlowA();
    await page.waitForTimeout(250);
    await expect(optionB).toBeVisible();
    await expect(optionA).toHaveCount(0);
  } finally {
    releaseSlowA();
    await pool.query('UPDATE "User" SET "isActive"=false WHERE id=ANY($1::uuid[])', [
      [owner, tutorA, tutorB, tutorC],
    ]);
  }
});
