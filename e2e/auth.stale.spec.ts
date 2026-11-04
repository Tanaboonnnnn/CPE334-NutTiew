import {test,expect} from '@playwright/test';
import {Pool} from 'pg';
import argon2 from 'argon2';
import {randomBytes} from 'node:crypto';
import {config as loadEnv} from 'dotenv';
loadEnv({path:'.env',quiet:true});
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const tag=randomBytes(5).toString('hex'),email=`stale-${tag}@example.test`,password='StalePassword#2026';
test.beforeAll(async()=>{await pool.query('INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3)',[email,await argon2.hash(password),'Customer']);});
test.afterAll(async()=>{await pool.query('DELETE FROM "User" WHERE "email"=$1',[email]);await pool.end();});

test('AUTH-23 held old 200 across reload cannot restore identity after newer 401',async({page})=>{
 await page.goto('/');await page.getByLabel('อีเมล').fill(email);await page.getByLabel('รหัสผ่าน').fill(password);await page.getByRole('button',{name:'เข้าสู่ระบบ'}).click();
 await expect(page.getByText('เข้าสู่ระบบแล้ว')).toBeVisible();
 const me=await page.request.get('/api/v1/auth/me');expect(me.status()).toBe(200);const user=(await me.json()).user;
 const ref=user.id.replaceAll('-','').slice(-8);await expect(page.getByText(ref,{exact:true})).toBeVisible();
 let trapped=false;let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/v1/auth/me',async route=>{
  if(!trapped){trapped=true;const response=await route.fetch();expect(response.status()).toBe(200);await gate;await route.fulfill({response});}
  else await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:{code:'UNAUTHENTICATED',message:'Authentication required'},requestId:'forced-newer-401'})});
 });
 try{
  await page.reload();await expect.poll(()=>trapped,{timeout:10000}).toBe(true);
  await page.evaluate(()=>{window.location.hash='#newer-auth-check';});
  // React remounts by navigating to the same origin with a fresh document, while the previous /me remains blocked.
  await page.reload();await expect(page.getByRole('button',{name:'เข้าสู่ระบบ'})).toBeVisible();
  await expect(page.getByText(ref,{exact:true})).toHaveCount(0);
 }finally{release();}
 await expect(page.getByText(ref,{exact:true})).toHaveCount(0);
});
