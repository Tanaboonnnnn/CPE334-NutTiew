import {test,expect} from '@playwright/test';
import {Pool} from 'pg';
import argon2 from 'argon2';
import {randomBytes,createHash} from 'node:crypto';
import {config as loadEnv} from 'dotenv';
loadEnv({path:'.env',quiet:true});
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const tag=randomBytes(5).toString('hex'),email=`stale-${tag}@example.test`,password='StalePassword#2026';
let currentTestIp='';
// A shared disposable PostgreSQL database retains Auth admission buckets
// across repeated local E2E runs. Give each test its own reserved, trusted
// documentation IPv6 identity; never relax the production rate-limit policy.
test.beforeEach(async({page})=>{
 const h=randomBytes(12).toString('hex');
 currentTestIp='2001:db8:'+h.slice(0,4)+':'+h.slice(4,8)+':'+h.slice(8,12)+'::5';
 await page.setExtraHTTPHeaders({'X-Forwarded-For':currentTestIp});
});
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


test('AUTH-23 StrictMode same-instance stale 200 cannot replace newer 401',async({page})=>{
 // Log in via the context's request API before mounting React.
 // React.StrictMode dev effect setup -> cleanup -> setup generates overlapping /me GETs.
 const loggedIn=await page.request.post('/api/v1/auth/login',{headers:{Origin:'http://localhost:5173','X-Forwarded-For':currentTestIp},data:{email,password}});
 expect(loggedIn.status()).toBe(200);
 const me=await page.request.get('/api/v1/auth/me');expect(me.status()).toBe(200);
 const ref=(await me.json()).user.id.replaceAll('-','').slice(-8);
 let count=0,release!:()=>void,markDelivered!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const delivered=new Promise<void>(resolve=>{markDelivered=resolve;});
 await page.route('**/api/v1/auth/me',async route=>{
  count++;
  if(count===1){
   const old=await route.fetch();expect(old.status()).toBe(200);
   await gate;await route.fulfill({response:old});markDelivered();
  }else{
   await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:{code:'UNAUTHENTICATED',message:'Authentication required'},requestId:'newer-unauthorized'})});
  }
 });
 try{
  await page.goto('/');
  await expect.poll(()=>count,{timeout:10000}).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('button',{name:'เข้าสู่ระบบ'})).toBeVisible();
  release();await delivered;
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(page.getByText(ref,{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'เข้าสู่ระบบ'})).toBeVisible();
 }finally{release();}
});

test('AUTH-18 two browser tabs race unsafe logout on one session, then replay is rejected',async({page,context})=>{
 await page.goto('/');
 await page.getByLabel('อีเมล').fill(email);
 await page.getByLabel('รหัสผ่าน').fill(password);
 await page.getByRole('button',{name:'เข้าสู่ระบบ'}).click();
 await expect(page.getByText('เข้าสู่ระบบแล้ว')).toBeVisible();
 const second=await context.newPage();
 await second.goto('/');
 await expect(second.getByText('เข้าสู่ระบบแล้ว')).toBeVisible();
 const csrf=async(p:typeof page)=>p.evaluate(async()=>{
  const response=await fetch('/api/v1/auth/csrf',{credentials:'same-origin',cache:'no-store'});
  if(!response.ok)throw Error('Cannot get CSRF');
  return (await response.json()).csrfToken as string;
 });
 const tokenA=await csrf(page),tokenB=await csrf(second);expect(tokenA).toBe(tokenB);
 const sessionCookie=(await context.cookies('http://localhost:5173')).find(x=>x.name==='nuttiew_session_dev');
 expect(sessionCookie).toBeDefined();
 const sessionDigest=createHash('sha256').update(sessionCookie!.value).digest();
 const unsafe=(p:typeof page,token:string)=>p.evaluate(async csrfToken=>{
  const response=await fetch('/api/v1/auth/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},body:'{}'});
  return response.status;
 },token);
 const [a,b]=await Promise.all([unsafe(page,tokenA),unsafe(second,tokenB)]);
 expect([a,b].some(x=>x===204)).toBe(true);
 expect([a,b].every(x=>x===204||x===401)).toBe(true);
 expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
 await page.reload();await second.reload();
 await expect(page.getByRole('button',{name:'เข้าสู่ระบบ'})).toBeVisible();
 await expect(second.getByRole('button',{name:'เข้าสู่ระบบ'})).toBeVisible();
 const settled=await pool.query('SELECT "revokedAt" FROM "Session" WHERE "tokenDigest"=$1',[sessionDigest]);
 expect(settled.rowCount).toBe(1);
 expect(settled.rows[0].revokedAt).not.toBeNull();
 await second.close();
});

test('AUTH-15 uncertain logout 503 preserves visible identity and announces retry',async({page})=>{
 await page.goto('/');
 await page.getByLabel('อีเมล').fill(email);
 await page.getByLabel('รหัสผ่าน').fill(password);
 await page.getByRole('button',{name:'เข้าสู่ระบบ'}).click();
 await expect(page.getByText('เข้าสู่ระบบแล้ว')).toBeVisible();
 const me=await page.request.get('/api/v1/auth/me');expect(me.status()).toBe(200);
 const ref=(await me.json()).user.id.replaceAll('-','').slice(-8);
 await page.route('**/api/v1/auth/logout',async route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'SERVICE_UNAVAILABLE',message:'Service temporarily unavailable'},requestId:'forced-outage'})}));
 await page.getByRole('button',{name:'ออกจากระบบ'}).click();
 await expect(page.getByRole('alert')).toContainText('ไม่สามารถยืนยันการออกจากระบบได้');
 await expect(page.getByText(ref,{exact:true})).toBeVisible();
 expect((await page.request.get('/api/v1/auth/me')).status()).toBe(200);
});
