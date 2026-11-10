import {test,expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';

// Browser fixtures use isolated, documented test IPv6 addresses (not public proxies).
test.beforeEach(async({page})=>{
 const h=randomBytes(12).toString('hex');
 await page.setExtraHTTPHeaders({'X-Forwarded-For':'2001:db8:'+h.slice(0,4)+':'+h.slice(4,8)+':'+h.slice(8,12)+'::3'});
});

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
   const input=document.querySelector('input')!,button=document.querySelector('form button[type=submit]')!,secondary=document.querySelector('form button.secondary')!,panel=document.querySelector('.panel')!,heading=document.querySelector('.panel h1')!;
   const ci=getComputedStyle(input),cb=getComputedStyle(button),cs=getComputedStyle(secondary),cp=getComputedStyle(panel),ch=getComputedStyle(heading),body=getComputedStyle(document.documentElement);
   return {
    inputBorder:ci.borderTopColor,
    inputBg:ci.backgroundColor,
    inputColor:ci.color,
    buttonText:cb.color,
    buttonBg:cb.backgroundColor,
    secondaryText:cs.color,
    secondaryBg:cs.backgroundColor,
    secondaryBorder:cs.borderTopColor,
    panelBg:cp.backgroundColor,
    headingColor:ch.color,
    canvasBg:body.backgroundColor
   };
  });
  expect(styles.canvasBg).toBe('rgb(247, 248, 251)');
  expect(styles.panelBg).toBe('rgb(255, 255, 255)');
  expect(styles.headingColor).toBe('rgb(32, 43, 68)');
  expect(styles.inputColor).toBe('rgb(23, 33, 55)');
  expect(styles.buttonBg).toBe('rgb(244, 119, 54)');
  expect(styles.buttonText).toBe('rgb(23, 33, 55)');
  expect(styles.secondaryBg).toBe('rgb(255, 255, 255)');
  expect(styles.secondaryText).toBe('rgb(32, 43, 68)');
  expect(styles.secondaryBorder).toBe('rgb(102, 119, 138)');
  expect(contrast(styles.inputBorder,styles.inputBg)).toBeGreaterThanOrEqual(3);
  expect(contrast(styles.inputBorder,styles.canvasBg)).toBeGreaterThanOrEqual(3);
  expect(contrast(styles.buttonText,styles.buttonBg)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(styles.secondaryText,styles.secondaryBg)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(styles.secondaryBorder,styles.panelBg)).toBeGreaterThanOrEqual(3);
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('อีเมล')).toBeFocused();
  const focus=await page.getByLabel('อีเมล').evaluate(el=>({
   width:parseFloat(getComputedStyle(el).outlineWidth),
   style:getComputedStyle(el).outlineStyle,
   color:getComputedStyle(el).outlineColor
  }));
  expect(focus.width).toBeGreaterThanOrEqual(2);
  expect(focus.style).not.toBe('none');
  expect(focus.color).toBe('rgb(170, 69, 25)');
  expect(contrast(focus.color,styles.inputBg)).toBeGreaterThanOrEqual(3);
 }
});

test('AUTH-15 wrong-password error is announced and linked to invalid input',async({page})=>{
 await page.goto('/');
 const email=`a11y-${randomBytes(7).toString('hex')}@example.test`;
 await page.getByLabel('อีเมล').fill(email);
 await page.getByLabel('รหัสผ่าน').fill('WrongPassword#2026');
 await page.getByRole('button',{name:'เข้าสู่ระบบ'}).click();
 const alert=page.getByRole('alert');
 await expect(alert).toBeVisible();
 await expect(page.getByLabel('อีเมล')).toHaveAttribute('aria-invalid','true');
 await expect(page.getByLabel('อีเมล')).toHaveAttribute('aria-describedby','auth-error');
 await expect(page.getByLabel('อีเมล')).toBeFocused();
 const alertStyles=await page.evaluate(()=>{
  const el=document.getElementById('auth-error')!;
  const cs=getComputedStyle(el);
  const input=document.getElementById('email')!;
  const ci=getComputedStyle(input);
  return {color:cs.color,bg:cs.backgroundColor,inputBorder:ci.borderTopColor,inputBg:ci.backgroundColor};
 });
 expect(alertStyles.bg).toBe('rgb(255, 243, 243)');
 expect(alertStyles.color).toBe('rgb(156, 36, 36)');
 expect(contrast(alertStyles.color,alertStyles.bg)).toBeGreaterThanOrEqual(4.5);
 expect(contrast(alertStyles.inputBorder,alertStyles.inputBg)).toBeGreaterThanOrEqual(3);
 await page.setViewportSize({width:1280,height:800});
 await page.screenshot({path:'test-results/login-error-1280.png'});
});
