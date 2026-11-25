import { test, expect } from '@playwright/test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
test.use({ timezoneId: 'America/Los_Angeles' });
test.afterAll(async () => { await pool.end(); });

for (const scenario of ['committed','unknown'] as const) {
  test('F-S2-03 Tutor cancellation: '+scenario, async ({ page, context }) => {
    const url = new URL(process.env.DATABASE_URL ?? 'invalid:');
    expect(url.protocol).toBe('postgresql:');
    expect(url.hostname).toBe('127.0.0.1');
    expect((url.port==='15449' && url.pathname==='/nuttiew_117_review') ||
      (process.env.GITHUB_ACTIONS==='true' && url.port==='5432' && url.pathname==='/nuttiew_ci')).toBe(true);
    const account = async (role:string) => (await pool.query<{id:string}>(
      'INSERT INTO "User" (email,"passwordHash",role) VALUES ($1,$2,$3) RETURNING id',
      [randomUUID()+'@tutor-cancel.example.test','fixture',role])).rows[0].id;
    const customer=await account('Customer'), tutor=await account('Tutor');
    const start=new Date(Date.now()+3*60*60_000), end=new Date(start.getTime()+60*60_000);
    const slot=(await pool.query<{id:string}>('INSERT INTO "Slot" ("tutorId","startsAt","endsAt") VALUES ($1,$2,$3) RETURNING id',[tutor,start,end])).rows[0].id;
    const booking=(await pool.query<{id:string}>('INSERT INTO "Booking" ("customerId","currentSlotId","startsAt","endsAt") VALUES ($1,$2,$3,$4) RETURNING id',[customer,slot,start,end])).rows[0].id;
    const token=randomBytes(32).toString('base64url');
    await pool.query('INSERT INTO "Session" ("userId","tokenDigest","csrfNonce","expiresAt") VALUES ($1,$2,$3,clock_timestamp()+interval \'8 hours\')',
      [tutor,createHash('sha256').update(token).digest(),randomBytes(32)]);
    await context.addCookies([{name:'nuttiew_session_dev',value:token,url:'http://localhost:5173',httpOnly:true,sameSite:'Lax'}]);
    const reason='ติดธุระช่วงเช้า 📚';
    let posts=0;
    let release!:()=>void;
    const held=new Promise<void>(done=>{release=done;});
    await page.route('**/api/v1/tutor/bookings/'+booking+'/cancel',async route=>{
      posts++;
      expect(route.request().postDataJSON()).toEqual({reason});
      if(scenario==='committed') await held;
      const result=await route.fetch();
      expect(result.status()).toBe(200);
      if(scenario==='unknown') await route.fulfill({status:503,json:{error:{code:'MUTATION_OUTCOME_UNKNOWN'}}});
      else await route.fulfill({response:result});
    });
    try {
      await page.goto('/');
      const row=page.locator('[data-booking-id="'+booking+'"]');
      const action=row.getByTestId('tutor-cancel-booking');
      await action.click();
      const dialog=page.getByRole('dialog',{name:'ยกเลิกนัดหมาย'});
      await expect(dialog.getByRole('heading')).toBeFocused();
      await expect(dialog).toContainText('Asia/Bangkok');
      await expect(dialog).toContainText('60 นาที');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(action).toBeFocused();
      await action.press('Enter');
      const reasonField=dialog.getByLabel('เหตุผลที่ยกเลิก (จำเป็น)');
      const confirm=dialog.getByRole('button',{name:'ยืนยันการยกเลิก'});
      await reasonField.fill('...');
      await confirm.click();
      await expect(dialog.getByRole('status')).toContainText('กรุณาใส่เหตุผล');
      expect(posts).toBe(0);
      await reasonField.fill('  '+reason+'  ');
      await confirm.click();
      if(scenario==='committed'){
        await expect(confirm).toBeDisabled();
        await expect(dialog).toHaveAttribute('aria-busy','true');
        await page.keyboard.press('Escape');
        await expect(dialog).toBeVisible();
        await expect(row).toBeVisible();
        release();
      }else{
        await expect(dialog.getByRole('status')).toContainText('ยังยืนยันผล');
        await expect(confirm).toHaveCount(0);
        await expect(row).toBeVisible();
        await dialog.getByRole('button',{name:'ตรวจสอบรายการนัดหมาย'}).click();
        await expect(page.getByRole('status').filter({hasText:'ไม่พบนัดหมายนี้ในตารางล่าสุด'})).toBeVisible();
      }
      await expect(dialog).toBeHidden();
      await expect(row).toHaveCount(0);
      await expect(page.getByRole('heading',{name:'รายการนัดหมายบนตารางสอนของคุณ'})).toBeFocused();
      expect(posts).toBe(1);
      const {rows:[stored]}=await pool.query('SELECT b.status,b."tutorCancellationReason",s.lifecycle,n."recipientCustomerId",n.kind FROM "Booking" b JOIN "Slot" s ON s.id=b."currentSlotId" JOIN "Notification" n ON n."bookingId"=b.id WHERE b.id=$1',[booking]);
      expect(stored).toEqual({status:'Cancelled',tutorCancellationReason:reason,lifecycle:'Withdrawn',recipientCustomerId:customer,kind:'TutorCancelled'});
      await expect(page.locator('body')).not.toContainText(reason);
      const customerToken=randomBytes(32).toString('base64url');
      await pool.query('INSERT INTO "Session" ("userId","tokenDigest","csrfNonce","expiresAt") VALUES ($1,$2,$3,clock_timestamp()+interval \'8 hours\')',
        [customer,createHash('sha256').update(customerToken).digest(),randomBytes(32)]);
      await context.addCookies([{name:'nuttiew_session_dev',value:customerToken,url:'http://localhost:5173',httpOnly:true,sameSite:'Lax'}]);
      await page.goto('/');
      await page.getByTestId('nav-my-bookings').click();
      const customerRow=page.locator('[data-booking-id="'+booking+'"]');
      await customerRow.getByRole('button',{name:'ดูรายละเอียด'}).click();
      await expect(page.getByTestId('detail-tutor-cancellation-reason')).toHaveText(reason);
    } finally {
      release();
      await pool.query('UPDATE "User" SET "isActive"=false WHERE id=ANY($1::uuid[])',[[customer,tutor]]);
    }
  });
}
