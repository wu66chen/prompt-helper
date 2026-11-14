const {chromium}=require('playwright'),{setup}=require('./browser.cjs'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);
 const root=page.locator('#db-prompt-helper-root'),panel=root.locator('.panel');await root.locator('.ball').click();await page.waitForTimeout(220);
 const active=()=>root.locator('.content').evaluate(el=>el.getAnimations().map(a=>({frames:a.effect.getKeyframes(),duration:a.effect.getTiming().duration})));
 await root.locator('[data-action=settings]').dispatchEvent('click');let animations=await active();assert.ok(animations.some(a=>a.duration===150&&a.frames.some(f=>f.transform)));
 await root.locator('.content').evaluate(el=>el.getAnimations().forEach(a=>{a.pause();a.currentTime=65;}));await panel.screenshot({path:path.resolve(__dirname,'../artifacts/motion-view-midpoint.png'),animations:'allow'});
 await root.locator('[data-action=toggle-sidebar]').dispatchEvent('click');animations=await active();assert.ok(animations.some(a=>a.duration===180&&a.frames[0].transform.includes('108')));
 await root.locator('.content').evaluate(el=>el.getAnimations().forEach(a=>{a.pause();a.currentTime=70;}));await panel.screenshot({path:path.resolve(__dirname,'../artifacts/motion-sidebar-midpoint.png'),animations:'allow'});
 await page.evaluate(()=>{const s=document.querySelector('#db-prompt-helper-root').shadowRoot;for(let i=0;i<8;i++)s.querySelector('[data-action=toggle-sidebar]').click();});
 assert.ok((await active()).length<=1);const brand=await root.locator('.brand').boundingBox();await page.mouse.move(brand.x+brand.width/2,brand.y+brand.height/2);await page.mouse.down();assert.equal((await active()).length,0);await page.mouse.up();
 console.log('PASS view/sidebar motion is bounded, interruption leaves final layout');
 await root.locator('[name=motion]').uncheck();assert.equal(await root.getAttribute('data-motion'),'off');await root.locator('[data-action=back]').click();assert.equal((await active()).length,0);assert.equal(await root.locator('[data-action=new]').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
 await root.locator('[data-action=settings]').click();await root.locator('[name=motion]').check();await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('#db-prompt-helper-root').dataset.motion==='reduced');assert.equal(await root.getAttribute('data-motion'),'reduced');
 await root.locator('[data-action=back]').dispatchEvent('click');animations=await active();assert.ok(animations.length&&animations.every(a=>a.duration<=80&&!a.frames.some(f=>f.transform)));
 await root.locator('.prompt').first().locator('[data-action=delete]').click();assert.equal(await root.locator('.dialog').evaluate(el=>getComputedStyle(el).animationName),'none');await root.locator('[data-action=dialog-cancel]').click();
 await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>document.querySelector('#db-prompt-helper-root').dataset.motion==='full');assert.equal(await root.getAttribute('data-motion'),'full');await root.locator('.prompt').first().locator('[data-action=copy]').click();assert.match(await root.locator('.toast').innerText(),/已复制/);
 await root.locator('.prompt').first().locator('[data-action=delete]').click();assert.equal(await root.locator('.dialog').evaluate(el=>getComputedStyle(el).animationName),'dialog-in');await root.locator('[data-action=dialog-cancel]').click();
 console.log('PASS disabled and system reduced-motion paths; copy and dialog feedback');
 await root.locator('[data-action=settings]').click();await root.locator('[name=theme]').selectOption('dark');await page.setViewportSize({width:390,height:760});await page.waitForTimeout(220);assert.ok(await root.locator('.content').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await panel.screenshot({path:path.resolve(__dirname,'../artifacts/motion-dark-narrow.png')});
 // No entry/exit transform changes the launcher's hit box or persisted position.
 await root.locator('[data-action=collapse]').click();assert.equal(await root.locator('.ball').evaluate(el=>getComputedStyle(el).transform),'none');
 const second=await context.newPage();second.on('pageerror',e=>errors.push(e.message));await setup(second);
 await root.locator('.ball').click();await root.locator('[name=motion]').uncheck();await second.waitForFunction(()=>document.querySelector('#db-prompt-helper-root').dataset.motion==='off');
 await second.close();
 assert.deepEqual(errors,[]);console.log('PASS narrow dark layout and stable launcher hitbox');await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
