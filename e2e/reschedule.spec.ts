import { test, expect } from '@playwright/test';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
test.use({ timezoneId: 'America/Los_Angeles' });
test.afterAll(async () => {
  await pool.end();
});

test('F-S2-02 browser reschedule: cross-Tutor move, old slot reopened, second attempt blocked after reload', async ({
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
  const startOld = new Date(Date.now() + 5 * 60 * 60_000);
  const endOld = new Date(startOld.getTime() + 60 * 60_000);
  const startNew = new Date(Date.now() + 9 * 60 * 60_000);
  const endNew = new Date(startNew.getTime() + 60 * 60_000);

  const oldSlot = (
    await pool.query<{ id: string }>(
      'INSERT INTO "Slot" ("tutorId","startsAt","endsAt") VALUES ($1,$2,$3) RETURNING id',
      [tutorA, startOld, endOld],
    )
  ).rows[0].id;
  const newSlot = (
    await pool.query<{ id: string }>(
      'INSERT INTO "Slot" ("tutorId","startsAt","endsAt") VALUES ($1,$2,$3) RETURNING id',
      [tutorB, startNew, endNew],
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

    // Reload persists one-reschedule quota & new Tutor; old slot is offered again.
    await page.reload();
    await page.getByTestId('nav-my-bookings').click();
    await expect(card.getByTestId('reschedule-used-note')).toBeVisible();
    await expect(card.getByTestId('reschedule-booking')).toHaveCount(0);

    const available = await page.request.get('/api/v1/customer/availability');
    const offers = (await available.json()).data as Array<{ slotId: string }>;
    expect(offers.some(o => o.slotId === oldSlot)).toBe(true);
    expect(offers.some(o => o.slotId === newSlot)).toBe(false);

    const { rows: [bRow] } = await pool.query(
      'SELECT "currentSlotId", status FROM "Booking" WHERE id=$1',
      [bookingId],
    );
    expect(bRow).toEqual({ currentSlotId: newSlot, status: 'Booked' });
  } finally {
    await pool.query('UPDATE "User" SET "isActive"=false WHERE id=ANY($1::uuid[])', [[owner, tutorA, tutorB]]);
  }
});
