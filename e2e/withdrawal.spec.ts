import { test, expect } from '@playwright/test';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Pool } from 'pg';

const pool=new Pool({connectionString:process.env.DATABASE_URL});
test.use({timezoneId:'America/Los_Angeles'});
test.afterAll(async()=>{await pool.end();});

for(const scenario of ['committed','unknown'] as const){
  test('F-S2-05 Tutor withdraws an open Slot: '+scenario,async({page,context})=>{
    const db=new URL(process.env.DATABASE_URL??'invalid:');
    expect(db.protocol).toBe('postgresql:');
    expect(db.hostname).toBe('127.0.0.1');
    expect((db.port==='15449'&&db.pathname==='/nuttiew_119_review')||
      (process.env.GITHUB_ACTIONS==='true'&&db.port==='5432'&&db.pathname==='/nuttiew_ci')).toBe(true);
    const account=async(role:'Customer'|'Tutor')=>(await pool.query<{id:string}>(
      'INSERT INTO "User" (email,"passwordHash",role) VALUES ($1,$2,$3) RETURNING id',
      [randomUUID()+'@slot-withdraw-e2e.example.test','fixture',role])).rows[0].id;
    const tutor=await account('Tutor'), customer=await account('Customer');
    const start=new Date(Math.ceil((Date.now()+3*60*60_000)/3_600_000)*3_600_000);
    const end=new Date(start.getTime()+3_600_000);
    const slot=async(startsAt:Date,endsAt:Date)=>(await pool.query<{id:string}>(
      'INSERT INTO "Slot" ("tutorId","startsAt","endsAt") VALUES ($1,$2,$3) RETURNING id',
      [tutor,startsAt,endsAt])).rows[0].id;
    const id=await slot(start,end);
    const occupiedStart=new Date(end.getTime()+3_600_000), occupiedEnd=new Date(occupiedStart.getTime()+3_600_000);
    const occupied=await slot(occupiedStart,occupiedEnd);
    await pool.query('INSERT INTO "Booking" ("customerId","currentSlotId","startsAt","endsAt") VALUES ($1,$2,$3,$4)',
      [customer,occupied,occupiedStart,occupiedEnd]);
    const token=randomBytes(32).toString('base64url');
    await pool.query('INSERT INTO "Session" ("userId","tokenDigest","csrfNonce","expiresAt") VALUES ($1,$2,$3,clock_timestamp()+interval \'8 hours\')',
      [tutor,createHash('sha256').update(token).digest(),randomBytes(32)]);
    await context.addCookies([{name:'nuttiew_session_dev',value:token,url:'http://localhost:5173',httpOnly:true,sameSite:'Lax'}]);
    let posts=0;
    let release!:()=>void;
    const held=new Promise<void>(done=>{release=done;});
    await page.route('**/api/v1/tutor/slots/'+id+'/withdraw',async route=>{
      posts++;
      expect(route.request().postDataJSON()).toEqual({});
      if(scenario==='committed')await held;
      const actual=await route.fetch();
      expect(actual.status()).toBe(200);
      if(scenario==='unknown')await route.fulfill({status:503,json:{error:{code:'MUTATION_OUTCOME_UNKNOWN'}}});
      else await route.fulfill({response:actual});
    });
    try {
      await page.goto('/');
      const row=page.locator('#all-slots [data-slot-id="'+id+'"]');
      const other=page.locator('#all-slots [data-slot-id="'+occupied+'"]');
      await expect(other.getByTestId('withdraw-slot')).toBeDisabled();
      await expect(other).toContainText('ต้องยกเลิกนัดหมายก่อน');
      const action=row.getByTestId('withdraw-slot');
      await action.click();
      const dialog=page.getByRole('dialog',{name:'ถอนช่วงเวลาติว'});
      await expect(dialog.getByRole('heading')).toBeFocused();
      await expect(dialog).toContainText('Asia/Bangkok');
      await expect(dialog).toContainText('เก็บรายการไว้เป็นประวัติ');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(action).toBeFocused();
      await action.press('Enter');
      const confirm=dialog.getByRole('button',{name:'ยืนยันถอนช่วงเวลา'});
      await confirm.click();
      if(scenario==='committed'){
        await expect(confirm).toBeDisabled();
        await expect(dialog).toHaveAttribute('aria-busy','true');
        await expect(row.getByTestId('slot-withdrawn-badge')).toHaveCount(0);
        release();
      }else{
        await expect(dialog.getByRole('status')).toContainText('ยังยืนยันผลไม่ได้');
        await expect(confirm).toHaveCount(0);
        await dialog.getByRole('button',{name:'ตรวจสอบรายการช่วงเวลา'}).click();
      }
      await expect(dialog).toBeHidden();
      await expect(row.getByTestId('slot-withdrawn-badge')).toHaveText('ถอนช่วงเวลาแล้ว');
      await expect(row.getByTestId('withdraw-slot')).toHaveCount(0);
      await expect(page.getByRole('heading',{name:'รายการ Slot ทั้งหมด'})).toBeFocused();
      const {rows:[saved]}=await pool.query('SELECT lifecycle,"withdrawnAt" FROM "Slot" WHERE id=$1',[id]);
      expect(saved).toEqual({lifecycle:'Withdrawn',withdrawnAt:expect.any(Date)});
      expect(posts).toBe(1);
      await page.reload();
      await expect(row.getByTestId('slot-withdrawn-badge')).toBeVisible();
      expect((await page.request.get('/api/v1/tutor/slots')).ok()).toBe(true);
    }finally{
      release();
      await pool.query('UPDATE "User" SET "isActive"=false WHERE id=ANY($1::uuid[])',[[customer,tutor]]);
    }
  });
}
