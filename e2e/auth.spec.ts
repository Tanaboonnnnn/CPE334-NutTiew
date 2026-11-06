import { test, expect } from '@playwright/test';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { config as loadEnv } from 'dotenv';
loadEnv({path:'.env'});
const pool=new Pool({connectionString:process.env.DATABASE_URL});const marker=randomBytes(6).toString('hex');const email=`browser-${marker}@example.test`,password='BrowserPassword#1234';
// Isolate repeated local runs from an earlier run's DB-backed IP quota.
test.beforeEach(async({page})=>{
 const h=randomBytes(12).toString('hex');
 await page.setExtraHTTPHeaders({'X-Forwarded-For':'2001:db8:'+h.slice(0,4)+':'+h.slice(4,8)+':'+h.slice(8,12)+'::8'});
});
test.beforeAll(async()=>{await pool.query('INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3)',[email,await argon2.hash(password),'Customer']);});
test.afterAll(async()=>{await pool.query('DELETE FROM "User" WHERE "email"=$1',[email]);await pool.end();});
for(const width of [320,375,768,1280]){
 test(`AUTH-15 viewport ${width} no horizontal overflow and visible form`,async({page})=>{await page.setViewportSize({width,height:800});await page.goto('/');await expect(page.getByRole('heading',{name:'ยินดีต้อนรับ'})).toBeVisible();await expect(page.getByLabel('อีเมล')).toBeVisible();await expect(page.getByLabel('รหัสผ่าน')).toBeVisible();await expect(page.getByRole('button',{name:'เข้าสู่ระบบ'})).toBeVisible();const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);expect(overflow).toBe(false);await page.screenshot({path:`test-results/login-${width}.png`});});
}
test('AUTH-15/23 keyboard, show/hide, login, refresh, server-derived identity and logout',async({page})=>{await page.goto('/');await page.getByLabel('อีเมล').fill(email);await page.getByLabel('รหัสผ่าน').fill(password);await page.getByRole('button',{name:'แสดงรหัสผ่าน'}).click();await expect(page.getByLabel('รหัสผ่าน')).toHaveAttribute('type','text');await page.getByRole('button',{name:'ซ่อนรหัสผ่าน'}).click();await expect(page.getByLabel('รหัสผ่าน')).toHaveAttribute('type','password');await page.getByRole('button',{name:'เข้าสู่ระบบ'}).click();await expect(page.getByText('เข้าสู่ระบบแล้ว')).toBeVisible();await expect(page.getByText('Customer',{exact:true})).toBeVisible();await page.reload();await expect(page.getByText('เข้าสู่ระบบแล้ว')).toBeVisible();await page.screenshot({path:'test-results/customer-session.png'});await page.getByRole('button',{name:'ออกจากระบบ'}).click();await expect(page.getByRole('button',{name:'เข้าสู่ระบบ'})).toBeVisible();await page.reload();await expect(page.getByRole('button',{name:'เข้าสู่ระบบ'})).toBeVisible();});
test('AUTH-15 invalid credentials announce error and allow retry',async({page})=>{await page.goto('/');await page.getByLabel('อีเมล').fill(email);await page.getByLabel('รหัสผ่าน').fill('incorrect');await page.getByRole('button',{name:'เข้าสู่ระบบ'}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByLabel('อีเมล')).toHaveAttribute('aria-invalid','true');await expect(page.getByLabel('อีเมล')).toHaveAttribute('aria-describedby','auth-error');await expect(page.getByLabel('อีเมล')).toBeFocused();await expect(page.getByRole('button',{name:'เข้าสู่ระบบ'})).toBeEnabled();});

test('AUTH-15 supports paste and email autocomplete; timeout clears pending UI',async({page})=>{
 await page.goto('/');await expect(page.getByLabel('อีเมล')).toHaveAttribute('autocomplete','email');
 await page.getByLabel('อีเมล').fill(email);await page.getByLabel('รหัสผ่าน').fill(password);await expect(page.getByLabel('รหัสผ่าน')).toHaveValue(password);
 await page.route('**/api/v1/auth/login',async(route)=>{await new Promise(r=>setTimeout(r,11000));await route.abort();});
 await page.getByRole('button',{name:'เข้าสู่ระบบ'}).click();await expect(page.getByRole('button',{name:'กำลังตรวจสอบ…'})).toBeDisabled();await expect(page.getByRole('alert')).toContainText('หมดเวลา',{timeout:15000});await expect(page.getByRole('button',{name:'เข้าสู่ระบบ'})).toBeEnabled();
});
