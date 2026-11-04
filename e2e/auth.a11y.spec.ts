import {test,expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';

const luminance=(css:string)=>{
 const channels=(css.match(/[0-9]+(?:\.[0-9]+)?/g)??[]).slice(0,3).map(Number);
 if(channels.length!==3)throw new Error('Expected computed rgb color: '+css);
 const linear=channels.map(n=>{const x=n/255;return x<=0.04045?x/12.92:Math.pow((x+0.055)/1.055,2.4);});
 return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];
};
const contrast=(a:string,b:string)=>{
 const x=luminance(a),y=luminance(b);
 return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
};

test('AUTH-15 automated 320/375/768/1280px targets, contrast and keyboard focus',async({page})=>{
 for(const width of [320,375,768,1280]){
  await page.setViewportSize({width,height:800});
  await page.goto('/');
  await expect(page.getByLabel('อีเมล')).toBeVisible();
  const targets=page.locator('input,button');
  for(let i=0;i<await targets.count();i++){
   const rect=await targets.nth(i).boundingBox();
   expect(rect, `Missing hit target at width ${width}`).not.toBeNull();
   expect(rect!.width).toBeGreaterThanOrEqual(44);
   expect(rect!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  const styles=await page.evaluate(()=>{
   const input=document.querySelector('input')!,button=document.querySelector('form button[type=submit]')!,panel=document.querySelector('.panel')!;
   const ci=getComputedStyle(input),cb=getComputedStyle(button),cp=getComputedStyle(panel),body=getComputedStyle(document.documentElement);
   return {inputBorder:ci.borderTopColor,inputBg:ci.backgroundColor,buttonText:cb.color,buttonBg:cb.backgroundColor,panelBg:cp.backgroundColor,canvasBg:body.backgroundColor};
  });
  expect(contrast(styles.inputBorder,styles.inputBg)).toBeGreaterThanOrEqual(3);
  expect(contrast(styles.inputBorder,styles.canvasBg)).toBeGreaterThanOrEqual(3);
  expect(contrast(styles.buttonText,styles.buttonBg)).toBeGreaterThanOrEqual(4.5);
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('อีเมล')).toBeFocused();
  const focus=await page.getByLabel('อีเมล').evaluate(el=>({
   width:parseFloat(getComputedStyle(el).outlineWidth),
   style:getComputedStyle(el).outlineStyle,
   color:getComputedStyle(el).outlineColor
  }));
  expect(focus.width).toBeGreaterThanOrEqual(2);
  expect(focus.style).not.toBe('none');
  expect(contrast(focus.color,styles.inputBg)).toBeGreaterThanOrEqual(3);
 }
});

test('AUTH-15 wrong-password error is announced and linked to invalid input',async({page})=>{
 await page.goto('/');
 const email=`a11y-${randomBytes(7).toString('hex')}@example.test`;
 await page.getByLabel('อีเมล').fill(email);
 await page.getByLabel('รหัสผ่าน').fill('WrongPassword#2026');
 await page.getByRole('button',{name:'เข้าสู่ระบบ'}).click();
 await expect(page.getByRole('alert')).toBeVisible();
 await expect(page.getByLabel('อีเมล')).toHaveAttribute('aria-invalid','true');
 await expect(page.getByLabel('อีเมล')).toHaveAttribute('aria-describedby','auth-error');
 await expect(page.getByLabel('อีเมล')).toBeFocused();
});
