import { test, expect } from '@playwright/test';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
test.use({ timezoneId: 'America/Los_Angeles' });
test.afterAll(async () => { await pool.end(); });

for (const scenario of ['committed', 'unknown', 'cutoff'] as const) {
  test('F-S2-01 browser cancellation: ' + scenario, async ({ page, context }) => {
    const url = new URL(process.env.DATABASE_URL ?? 'invalid:');
    expect(url.hostname).toBe('127.0.0.1');
    expect((url.port === '15449' && url.pathname === '/nuttiew_115_review') ||
      (process.env.GITHUB_ACTIONS === 'true' && url.port === '5432' && url.pathname === '/nuttiew_ci')).toBe(true);
    const person = async (role: string) => (await pool.query<{id:string}>(
      'INSERT INTO "User" (email,"passwordHash",role) VALUES ($1,$2,$3) RETURNING id',
      [randomUUID()+'@cancel-e2e.example.test','fixture',role],
    )).rows[0].id;
    const owner = await person('Customer'), tutor = await person('Tutor');
    const start = new Date(Date.now()+3*60*60_000);
    const end = new Date(start.getTime()+60*60_000);
    const slot = (await pool.query<{id:string}>('INSERT INTO "Slot" ("tutorId","startsAt","endsAt") VALUES ($1,$2,$3) RETURNING id',[tutor,start,end])).rows[0].id;
    const id = (await pool.query<{id:string}>('INSERT INTO "Booking" ("customerId","currentSlotId","startsAt","endsAt") VALUES ($1,$2,$3,$4) RETURNING id',[owner,slot,start,end])).rows[0].id;
    const token = randomBytes(32).toString('base64url');
    await pool.query(`INSERT INTO "Session" ("userId","tokenDigest","csrfNonce","expiresAt") VALUES ($1,$2,$3,clock_timestamp()+interval '8 hours')`, [owner,createHash('sha256').update(token).digest(),randomBytes(32)]);
    await context.addCookies([{name:'nuttiew_session_dev',value:token,url:'http://localhost:5173',httpOnly:true,sameSite:'Lax'}]);
    const path = '**/api/v1/customer/bookings/'+id+'/cancel';
    let posts = 0;
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route(path, async route => {
      posts++;
      expect(route.request().postDataJSON()).toEqual({});
      if (scenario === 'cutoff') {
        await route.fulfill({status:422,json:{error:{code:'CANCELLATION_WINDOW_CLOSED'}}});
      } else {
        if (scenario === 'committed') await pending;
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        if (scenario === 'unknown') {
          await route.fulfill({status:503,json:{error:{code:'MUTATION_OUTCOME_UNKNOWN'}}});
        } else await route.fulfill({response});
      }
    });
    try {
      await page.goto('/');
      await page.getByTestId('nav-my-bookings').click();
      const card = page.locator('[data-booking-id="'+id+'"]');
      const action = card.getByTestId('cancel-booking');
      await action.click();
      const dialog = page.getByRole('dialog', {name:'ยกเลิกการจอง'});
      await expect(dialog.getByRole('heading')).toBeFocused();
      await expect(dialog).toContainText('Asia/Bangkok');
      await expect(dialog).toContainText('30 นาที');
      await expect(dialog.locator('input, textarea')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(action).toBeFocused();
      await action.press('Enter');
      const confirm = dialog.getByRole('button',{name:'ยืนยันการยกเลิก'});
      await confirm.press('Enter');
      if (scenario === 'committed') {
        await expect(confirm).toBeDisabled();
        await expect(dialog).toHaveAttribute('aria-busy','true');
        await page.keyboard.press('Escape');
        await expect(dialog).toBeVisible();
        await expect(card.getByTestId('customer-booking-status-badge')).toHaveText('ยืนยันแล้ว');
        release();
      } else if (scenario === 'unknown') {
        await expect(dialog.getByRole('status')).toContainText('ยังยืนยันผล');
        await expect(confirm).toHaveCount(0);
        const read = page.waitForResponse(r=>r.request().method()==='GET' && r.url().endsWith('/bookings/'+id) && r.ok());
        await dialog.getByRole('button',{name:'ตรวจสอบสถานะการจอง'}).click();
        await read;
      } else {
        await expect(dialog.getByRole('status')).toContainText('ไม่ถึง 30 นาที');
        await expect(confirm).toBeDisabled();
        await dialog.getByRole('button',{name:'ปิด',exact:true}).click();
        await expect(card.getByTestId('customer-booking-status-badge')).toHaveText('ยืนยันแล้ว');
      }
      await expect(dialog).toBeHidden();
      expect(posts).toBe(1);
      await expect(action).toHaveCount(0);
      if (scenario !== 'cutoff') {
        await expect(card.getByTestId('customer-booking-status-badge')).toHaveText('ยกเลิกแล้ว');
        const available = await page.request.get('/api/v1/customer/availability');
        expect((await available.json()).data).toEqual(expect.arrayContaining([expect.objectContaining({slotId:slot})]));
      }
      const {rows:[row]} = await pool.query('SELECT b.status,s.lifecycle,s."withdrawnAt" FROM "Booking" b JOIN "Slot" s ON s.id=b."currentSlotId" WHERE b.id=$1',[id]);
      expect(row).toEqual({status:scenario==='cutoff'?'Booked':'Cancelled',lifecycle:'Offered',withdrawnAt:null});
    } finally {
      release();
      await pool.query('UPDATE "User" SET "isActive"=false WHERE id=ANY($1::uuid[])',[[owner,tutor]]);
    }
  });
}
