const {chromium}=require('playwright');
const {setup}=require('./browser.cjs');
const C=require('../src/core.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const dir=path.resolve(__dirname,'..'),script=fs.readFileSync(path.join(dir,'prompt-helper.user.js'),'utf8');
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1,`${label}: ${a} != ${b}`);
(async()=>{
    const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2}),page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);
    const root=page.locator('#db-prompt-helper-root'),panel=root.locator('.panel');
    const settle=()=>page.evaluate(async()=>{const p=document.querySelector('#db-prompt-helper-root').shadowRoot.querySelector('.panel');await Promise.all(p.getAnimations().map(a=>a.finished));});
    async function reset(){
        await page.evaluate(()=>{GM_deleteValue('ph3_layout_global');GM_setValue('ph3_layout_127.0.0.1',{anchor:{x:944,y:744},size:{w:600,h:500},direction:'up-left'});});
        await page.reload();await page.evaluate(script);await root.locator('.ball').click();await settle();
    }
    async function drag(locator,dx,dy){const r=await locator.boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:8});await page.mouse.up();}
    for(const edge of ['n','s','w','e','nw','ne','sw','se']){
        await reset();const before=await panel.boundingBox();
        const dx=edge.includes('w')?-60:edge.includes('e')?60:0,dy=edge.includes('n')?-40:edge.includes('s')?40:0;
        const handle=root.locator(`[data-edge=${edge}]`);await drag(handle,dx,dy);
        const actual=await panel.boundingBox(),expected=C.resizeRect({x:before.x,y:before.y,w:before.width,h:before.height},edge,dx,dy,1440,1000);
        near(actual.x,expected.x,edge+' X');near(actual.y,expected.y,edge+' Y');near(actual.width,expected.w,edge+' width');near(actual.height,expected.h,edge+' height');
        await root.locator('[data-action=collapse]').click();assert.equal(await root.locator('.resize-handle:visible').count(),0);
        await root.locator('.ball').click();await settle();const reopened=await panel.boundingBox();near(reopened.x,actual.x,'reopen X');near(reopened.y,actual.y,'reopen Y');near(reopened.width,actual.width,'reopen width');near(reopened.height,actual.height,'reopen height');
        console.log('PASS native-style '+edge+' resize and anchored reopen');
    }
    await reset();await root.locator('[data-action=settings]').click();
    for(let bits=0;bits<8;bits++){
        const modes={button:!!(bits&1),outside:!!(bits&2),double:!!(bits&4)};
        for(const key of ['button','outside','double'])await root.locator(`[name=collapse][value=${key}]`).setChecked(modes[key]);
        await page.mouse.click(30,30);assert.equal(await panel.isVisible(),!modes.outside,'outside '+bits);if(modes.outside){await root.locator('.ball').click();await settle();}
        await root.locator('.brand').dblclick();assert.equal(await panel.isVisible(),!modes.double,'double '+bits);if(modes.double){await root.locator('.ball').click();await settle();}
        const close=root.locator('[data-action=collapse]');assert.equal(await close.isDisabled(),!modes.button);
        if(modes.button){await close.click();assert.equal(await panel.isVisible(),false);await root.locator('.ball').click();await settle();}
        else {await close.dispatchEvent('click');assert.equal(await panel.isVisible(),true);}
        console.log('PASS collapse checkbox combination '+bits);
    }
    await root.locator('[data-action=back]').click();await root.locator('.prompt').first().locator('[data-action=delete]').click();await page.mouse.click(30,30);assert.equal(await panel.isVisible(),true);assert.equal(await root.locator('.overlay').isVisible(),true);await root.locator('[data-action=dialog-cancel]').click();
    await drag(root.locator('[data-edge=nw]'),-20,-20);assert.equal(await panel.isVisible(),true);console.log('PASS combined gestures ignore dialog and resize');
    await page.reload();await page.evaluate(script);await root.locator('.ball').click();await settle();await root.locator('[data-action=settings]').click();assert.equal(await root.locator('[name=collapse]:checked').count(),3);console.log('PASS checkbox preferences survive reload');
    await panel.screenshot({path:path.join(dir,'artifacts/controls-settings.png')});
    await root.locator('[data-action=back]').click();await root.locator('[data-action=maximize]').hover();await root.locator('.topbar').screenshot({path:path.join(dir,'artifacts/controls-toolbar.png')});await root.locator('[data-action=maximize]').screenshot({path:path.join(dir,'artifacts/maximize-arrow.png')});await root.locator('[data-action=settings]').screenshot({path:path.join(dir,'artifacts/settings-gear.png')});
    const sizeBefore=await panel.boundingBox();await root.locator('[data-action=maximize]').click();assert.equal(await root.locator('[data-action=maximize]').getAttribute('data-symbol'),'restore');await root.locator('[data-action=maximize]').hover();await root.locator('[data-action=maximize]').screenshot({path:path.join(dir,'artifacts/restore-arrow.png')});await root.locator('[data-action=maximize]').click();const restored=await panel.boundingBox();near(sizeBefore.width,restored.width,'restore width');near(sizeBefore.height,restored.height,'restore height');console.log('PASS maximize/restore symbols and geometry');
    await page.evaluate(()=>{GM_deleteValue('ph3_settings_global');GM_setValue('ph3_settings_127.0.0.1',{collapse:'double'});});await page.reload();await page.evaluate(script);await root.locator('.ball').click();await settle();await root.locator('[data-action=settings]').click();assert.equal(await root.locator('[name=collapse][value=double]').isChecked(),true);assert.equal(await root.locator('[name=collapse][value=button]').isChecked(),true);assert.equal(await root.locator('[name=collapse][value=outside]').isChecked(),false);console.log('PASS legacy setting migration in browser');
    assert.deepEqual(errors,[]);await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
