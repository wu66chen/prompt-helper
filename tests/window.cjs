const {chromium}=require('playwright');
const {setup}=require('./browser.cjs');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const dir=path.resolve(__dirname,'..'),script=fs.readFileSync(path.join(dir,'prompt-helper.user.js'),'utf8');
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1,`${label}: ${a} != ${b}`);
(async()=>{
    const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);
    const root=page.locator('#db-prompt-helper-root'),ball=root.locator('.ball'),panel=root.locator('.panel');
    const settle=()=>page.evaluate(async()=>{const p=document.querySelector('#db-prompt-helper-root').shadowRoot.querySelector('.panel');await Promise.all(p.getAnimations().map(a=>a.finished));});
    async function drag(locator,dx,dy){const b=await locator.boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:8});await page.mouse.up();}
    await ball.screenshot({path:path.join(dir,'artifacts/launcher.png')});
    for(const [x,y,direction] of [[1300,900,'up-left'],[20,900,'up-right'],[1300,20,'down-left'],[20,20,'down-right']]){
        const old=await ball.boundingBox();await drag(ball,x-old.x,y-old.y);assert.equal(await panel.isVisible(),false);
        const anchor=await ball.boundingBox();await ball.click();await settle();const opened=await panel.boundingBox();
        assert.equal(await panel.getAttribute('data-direction'),direction);
        near(direction.endsWith('left')?opened.x+opened.width:opened.x,direction.endsWith('left')?anchor.x+anchor.width:anchor.x,'horizontal alignment');
        near(direction.startsWith('up')?opened.y+opened.height:opened.y,direction.startsWith('up')?anchor.y+anchor.height:anchor.y,'vertical alignment');
        await page.screenshot({path:path.join(dir,'artifacts/anchor-'+direction+'.png')});
        const dx=direction.endsWith('left')?-40:40,dy=direction.startsWith('up')?-30:30;
        await drag(root.locator('.brand'),dx,dy);const moved=await panel.boundingBox();near(moved.x,opened.x+dx,'panel drag X');near(moved.y,opened.y+dy,'panel drag Y');
        await root.locator('[data-action=collapse]').click();const returned=await ball.boundingBox();near(returned.x,anchor.x+dx,'launcher follows X');near(returned.y,anchor.y+dy,'launcher follows Y');
        await ball.click();await settle();const again=await panel.boundingBox();near(again.x,moved.x,'reopen X');near(again.y,moved.y,'reopen Y');
        await root.locator('[data-action=collapse]').click();
        console.log('PASS pointer anchoring + drag roundtrip '+direction);
    }
    const prior=await ball.boundingBox();await page.reload();await page.evaluate(script);const reloaded=await ball.boundingBox();near(prior.x,reloaded.x,'reload anchor X');near(prior.y,reloaded.y,'reload anchor Y');
    await ball.click();await settle();
    await root.locator('[data-action=groups]').click();await root.locator('[name=tag-name]').fill('一个长一些的测试标签');await root.locator('[data-form=new-tag] button').click();await root.locator('[data-action=back]').click();
    const short=await root.locator('.tag-tile').filter({hasText:/^写作$/}).boundingBox(),long=await root.locator('.tag-tile').filter({hasText:/^一个长一些的测试标签$/}).boundingBox();assert.ok(long.width>short.width*2);
    const boxes=await root.locator('.tag-tile').evaluateAll(items=>items.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width};}));assert.ok(boxes.some((b,i)=>i&&Math.abs(b.y-boxes[i-1].y)<1&&b.x>boxes[i-1].x));
    await root.locator('.tag-tile').filter({hasText:/^编程$/}).click();assert.equal(await root.locator('.prompt').count(),1);await root.locator('.tag-tile').filter({hasText:/^全部标签$/}).click();
    await panel.screenshot({path:path.join(dir,'artifacts/tags-layout.png')});
    console.log('PASS intrinsic tag widths, horizontal packing and filtering');
    await root.locator('[data-action=collapse]').click();await page.setViewportSize({width:390,height:640});await page.waitForTimeout(100);
    const smallBall=await ball.boundingBox();await drag(ball,180-smallBall.x,280-smallBall.y);const narrowAnchor=await ball.boundingBox();await ball.click();await settle();const narrow=await panel.boundingBox();
    assert.equal(await panel.getAttribute('data-direction'),'down-left');near(narrow.x+narrow.width,narrowAnchor.x+narrowAnchor.width,'narrow right edges');near(narrow.y,narrowAnchor.y,'narrow top edges');assert.ok(narrow.x>=0&&narrow.x+narrow.width<=390&&narrow.y+narrow.height<=640);
    await panel.screenshot({path:path.join(dir,'artifacts/anchor-narrow.png')});console.log('PASS insufficient room shrinks toward largest available quadrant');
    await drag(root.locator('.resize'),-600,-700);const minimum=await panel.boundingBox();assert.ok(minimum.width>=narrow.width&&minimum.height>=Math.min(320,narrow.height));console.log('PASS resize past opposite corner keeps valid dimensions');
    assert.deepEqual(errors,[]);await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
