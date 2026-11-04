import { test,expect } from '@playwright/test';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { config as loadEnv } from 'dotenv';
loadEnv({path:'.env',quiet:true});
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const tag=randomBytes(8).toString('hex'),password='AccountMatrixPassword#34';
const users=[
 {email:`auth-c1-${tag}@example.test`,role:'Customer'},
 {email:`auth-c2-${tag}@example.test`,role:'Customer'},
 {email:`auth-t1-${tag}@example.test`,role:'Tutor'},
 {email:`auth-t2-${tag}@example.test`,role:'Tutor'}
] as const;
const ids:string[]=[];
test.beforeAll(async()=>{const hash=await argon2.hash(password);for(const u of users){const q=await pool.query('INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3) RETURNING "id"',[u.email,hash,u.role]);ids.push(q.rows[0].id);}expect(new Set(ids.map(x=>x.replaceAll('-','').slice(-8))).size).toBe(4);});
test.afterAll(async()=>{await pool.query('DELETE FROM "User" WHERE "email"=ANY($1)',[users.map(x=>x.email)]);await pool.end();});
test('AUTH-01/23 C1 C2 T1 T2 browser switching, reloading and no stale visible identity',async({page})=>{
 await page.goto('/');
 for(let i=0;i<users.length;i++){
  await page.getByLabel('อีเมล').fill(users[i].email);
  await page.getByLabel('รหัสผ่าน').fill(password);
  await page.getByRole('button',{name:'เข้าสู่ระบบ'}).click();
  await expect(page.getByText('เข้าสู่ระบบแล้ว')).toBeVisible();
  const ref=ids[i].replaceAll('-','').slice(-8);
  await expect(page.getByText(ref,{exact:true})).toBeVisible();
  await expect(page.getByText(users[i].role,{exact:true})).toBeVisible();
  for(let old=0;old<i;old++)await expect(page.getByText(ids[old].replaceAll('-','').slice(-8),{exact:true})).toHaveCount(0);
  const server=await page.request.get('/api/v1/auth/me');expect(server.status()).toBe(200);
  expect((await server.json()).user).toEqual({id:ids[i],role:users[i].role});
  await page.reload();await expect(page.getByText(ref,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'ออกจากระบบ'}).click();
  await expect(page.getByRole('button',{name:'เข้าสู่ระบบ'})).toBeVisible();
  await expect(page.getByText(ref,{exact:true})).toHaveCount(0);
  await page.reload();await expect(page.getByRole('button',{name:'เข้าสู่ระบบ'})).toBeVisible();
 }
});
test('AUTH-23 delayed unauthorized /me after logout leaves no previous identity',async({page})=>{
 await page.goto('/');await page.getByLabel('อีเมล').fill(users[0].email);await page.getByLabel('รหัสผ่าน').fill(password);await page.getByRole('button',{name:'เข้าสู่ระบบ'}).click();
 const ref=ids[0].replaceAll('-','').slice(-8);await expect(page.getByText(ref,{exact:true})).toBeVisible();
 const token=await page.request.get('/api/v1/auth/csrf');expect(token.status()).toBe(200);
 const csrf=(await token.json()).csrfToken;
 const done=await page.request.post('/api/v1/auth/logout',{headers:{Origin:'http://localhost:5173','X-CSRF-Token':csrf}});expect(done.status()).toBe(204);

 await page.route('**/api/v1/auth/me',async(route)=>{await new Promise(resolve=>setTimeout(resolve,300));await route.continue();});
 await page.reload();
 // Verify that a delayed /me response from the revoked session remains unauthenticated.

 // This verifies delayed unauthenticated reload handling, not the distinct old-success
 // versus newer-401 race, which remains a separate pending test.
 await expect(page.getByRole('button',{name:'เข้าสู่ระบบ'})).toBeVisible();await expect(page.getByText(ref,{exact:true})).toHaveCount(0);
 const fresh=await page.request.get('/api/v1/auth/me');expect(fresh.status()).toBe(401);
});
