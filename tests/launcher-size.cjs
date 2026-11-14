const {chromium}=require('playwright'),{setup}=require('./browser.cjs'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await setup(page);
 const root=page.locator('#db-prompt-helper-root'),ball=root.locator('.ball'),panel=root.locator('.panel');
 const openSettings=async()=>{await ball.click();await root.locator('[data-action=settings]').click();};
 const settle=()=>panel.evaluate(async p=>{await Promise.all(p.getAnimations().map(a=>a.finished));});
 await openSettings();await settle();const range=root.locator('[name=launcherSize]');
 assert.equal(await range.inputValue(),'72');
 const rect=await panel.boundingBox();
 await range.evaluate(el=>{el.value='128';el.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await root.locator('.launcher-preview img').evaluate(i=>i.getBoundingClientRect().width),128);
 assert.equal(await page.evaluate(()=>GM_getValue('ph3_settings_global').launcherSize),72);
 await range.dispatchEvent('change');assert.deepEqual(await panel.boundingBox(),rect);
 await range.focus();await page.keyboard.press('ArrowLeft');assert.equal(await range.inputValue(),'124');
 assert.equal(await page.evaluate(()=>GM_getValue('ph3_settings_global').launcherSize),124);
 await root.locator('[data-action=reset-launcher-size]').click();assert.equal(await range.inputValue(),'72');
 const out=path.resolve(__dirname,'../artifacts/launcher-size');fs.mkdirSync(out,{recursive:true});
 for(const mode of ['light','dark']){await root.locator('[name=theme]').selectOption(mode);await range.fill('96');await range.dispatchEvent('change');await root.locator('.scroll').evaluate(e=>e.scrollTop=0);await panel.screenshot({path:path.join(out,'settings-'+mode+'.png')});}
 for(const size of [48,72,128]){
   await range.fill(String(size));await range.dispatchEvent('change');await root.locator('[data-action=collapse]').click();await ball.evaluate(async b=>{await Promise.all(b.getAnimations({subtree:true}).map(a=>a.finished));});
   assert.equal((await ball.boundingBox()).width,size);assert.equal(await ball.locator('img').evaluate(i=>i.getBoundingClientRect().width),size);
   for(const [x,y] of [[15,15],[1050,15],[15,740],[1050,740]]){
     const b=await ball.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(x+size/2,y+size/2,{steps:5});await page.mouse.up();
     const anchor=await ball.boundingBox();assert.equal(await panel.isVisible(),false);await ball.click();await settle();
     const r=await panel.boundingBox(),direction=await panel.getAttribute('data-direction');
     assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=1200&&r.y+r.height<=900);
     assert.ok(Math.abs((direction.endsWith('left')?r.x+r.width:r.x)-(direction.endsWith('left')?anchor.x+size:anchor.x))<1);
     assert.ok(Math.abs((direction.startsWith('up')?r.y+r.height:r.y)-(direction.startsWith('up')?anchor.y+size:anchor.y))<1);
     await root.locator('[data-action=collapse]').click();await ball.evaluate(async b=>{await Promise.all(b.getAnimations({subtree:true}).map(a=>a.finished));});
   }
   await openSettings();
 }
 await root.locator('[data-action=collapse]').click();await ball.evaluate(async b=>{await Promise.all(b.getAnimations({subtree:true}).map(a=>a.finished));});await page.reload();await page.evaluate(fs.readFileSync(path.resolve(__dirname,'../prompt-helper.user.js'),'utf8'));assert.equal((await ball.boundingBox()).width,128);
 await page.setViewportSize({width:80,height:60});await page.waitForTimeout(100);const tiny=await ball.boundingBox();assert.ok(tiny.x>=0&&tiny.y>=0&&tiny.x+tiny.width<=80&&tiny.y+tiny.height<=60);
 assert.deepEqual(errors,[]);console.log('PASS live preview, save, keyboard, reset, light/dark, 3 sizes × 4 corners, reload, tiny viewport');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
