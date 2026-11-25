import { test, expect } from '@playwright/test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
test.use({ timezoneId: 'America/Los_Angeles' });
test.afterAll(async () => {
  await pool.end();
});

test('F-S2-04 browser notifications: owner reads, marks read, rereads after reload, and foreign Customer cannot access', async ({
  page,
  context,
}) => {
  const url = new URL(process.env.DATABASE_URL ?? 'invalid:');
  expect(url.protocol).toBe('postgresql:');
  expect(url.hostname).toBe('127.0.0.1');
  expect(
    (url.port === '15449' && url.pathname === '/nuttiew_118_review') ||
      (process.env.GITHUB_ACTIONS === 'true' && url.port === '5432' && url.pathname === '/nuttiew_ci'),
  ).toBe(true);

  const account = async (role: 'Customer' | 'Tutor') =>
    (
      await pool.query<{ id: string }>(
        'INSERT INTO "User" (email,"passwordHash",role) VALUES ($1,$2,$3) RETURNING id',
        [randomUUID() + '@notif-e2e.example.test', 'fixture', role],
      )
    ).rows[0].id;

  const makeSession = async (userId: string) => {
    const token = randomBytes(32).toString('base64url');
    const sid = (
      await pool.query<{ id: string }>(
        `INSERT INTO "Session" ("userId","tokenDigest","csrfNonce","expiresAt") VALUES ($1,$2,$3,clock_timestamp()+interval '8 hours') RETURNING id`,
        [userId, createHash('sha256').update(token).digest(), randomBytes(32)],
      )
    ).rows[0].id;
    return { token, sid };
  };

  const owner = await account('Customer');
  const otherCustomer = await account('Customer');
  const tutor = await account('Tutor');
  const start = new Date(Date.now() + 4 * 60 * 60_000);
  const end = new Date(start.getTime() + 60 * 60_000);

  const slotId = (
    await pool.query<{ id: string }>(
      'INSERT INTO "Slot" ("tutorId","startsAt","endsAt") VALUES ($1,$2,$3) RETURNING id',
      [tutor, start, end],
    )
  ).rows[0].id;
  const bookingId = (
    await pool.query<{ id: string }>(
      'INSERT INTO "Booking" ("customerId","currentSlotId","startsAt","endsAt") VALUES ($1,$2,$3,$4) RETURNING id',
      [owner, slotId, start, end],
    )
  ).rows[0].id;

  const tutorSession = await makeSession(tutor);
  const ownerSession = await makeSession(owner);
  const otherSession = await makeSession(otherCustomer);
  const reason = 'ผู้สอนติดภารกิจฉุกเฉินครับ 📘';

  try {
    // Perform real Tutor cancellation via s2_mutate so Notification + Booking + Slot commit atomically.
    await pool.query("SELECT public.s2_mutate('TutorCancel',$1,$2,$3,NULL,$4)", [
      tutor,
      tutorSession.sid,
      bookingId,
      reason,
    ]);
    const notifId = (
      await pool.query<{ id: string }>('SELECT id FROM "Notification" WHERE "bookingId"=$1', [bookingId])
    ).rows[0].id;

    // 1. Owning Customer lists, opens detail, marks read, and sees notice remain readable.
    await context.addCookies([
      {
        name: 'nuttiew_session_dev',
        value: ownerSession.token,
        url: 'http://localhost:5173',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await page.goto('/');
    await page.getByTestId('nav-customer-notifications').click();

    const item = page.locator(`[data-notification-id="${notifId}"]`);
    await expect(item).toBeVisible();
    await expect(item.getByTestId('notification-read-badge')).toHaveText('ยังไม่ได้อ่าน');
    await item.getByTestId('notification-item').click();

    const detailPanel = page.getByTestId('notification-detail-panel');
    await expect(detailPanel.getByTestId('notification-detail-booking-id')).toHaveText(bookingId);
    await expect(detailPanel.getByTestId('notification-detail-reason')).toHaveText(reason);
    await expect(detailPanel).toContainText('Asia/Bangkok');

    const markBtn = detailPanel.getByTestId('mark-notification-read-btn');
    await expect(markBtn).toBeVisible();
    await markBtn.click();

    await expect(item.getByTestId('notification-read-badge')).toHaveText('อ่านแล้ว');
    await expect(markBtn).toHaveCount(0);
    await expect(detailPanel.getByTestId('notification-detail-reason')).toHaveText(reason);

    // 2. Reload persists read state and notice remains listed and re-openable.
    await page.reload();
    await page.getByTestId('nav-customer-notifications').click();
    await expect(item).toBeVisible();
    await expect(item.getByTestId('notification-read-badge')).toHaveText('อ่านแล้ว');
    await item.getByTestId('notification-item').click();
    await expect(detailPanel.getByTestId('notification-detail-reason')).toHaveText(reason);
    await expect(detailPanel.getByTestId('mark-notification-read-btn')).toHaveCount(0);

    // 3. Same reason also appears in owning Customer's cancelled Booking detail.
    await page.getByTestId('nav-my-bookings').click();
    const bookingCard = page.locator(`[data-booking-id="${bookingId}"]`);
    await bookingCard.getByTestId('view-booking-detail').click();
    await expect(page.getByTestId('detail-tutor-cancellation-reason')).toHaveText(reason);

    // 4. Unrelated Customer B sees zero notices and gets 404 without reason on direct detail read.
    await context.addCookies([
      {
        name: 'nuttiew_session_dev',
        value: otherSession.token,
        url: 'http://localhost:5173',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await page.goto('/');
    await page.getByTestId('nav-customer-notifications').click();
    await expect(page.getByTestId('notifications-empty-state')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(reason);

    const foreignRes = await page.request.get(`/api/v1/customer/notifications/${notifId}`);
    expect(foreignRes.status()).toBe(404);
    expect(await foreignRes.text()).not.toContain(reason);
  } finally {
    await pool.query('UPDATE "User" SET "isActive"=false WHERE id=ANY($1::uuid[])', [
      [owner, otherCustomer, tutor],
    ]);
  }
});
