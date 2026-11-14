const {chromium}=require('playwright'),{setup}=require('./browser.cjs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);
  const root=page.locator('#db-prompt-helper-root'),tip=root.locator('.sidebar-tooltip');await root.locator('.ball').click();
  await page.evaluate(()=>{
   const tip=document.querySelector('#db-prompt-helper-root').shadowRoot.querySelector('.sidebar-tooltip');window.__tooltipTrace={animations:0,hides:0};
   const animate=tip.animate.bind(tip);tip.animate=(...args)=>{window.__tooltipTrace.animations++;return animate(...args);};
   new MutationObserver(records=>{window.__tooltipTrace.hides+=records.filter(r=>r.attributeName==='hidden').length;}).observe(tip,{attributes:true,attributeFilter:['hidden']});
  });
  const snapshot=()=>page.evaluate(()=>({...window.__tooltipTrace}));
  for(const folded of [true,false]){
   await root.locator('[data-action=toggle-sidebar]').click();await page.waitForTimeout(220);
   const item=root.locator('[data-kind=all]'),box=await item.boundingBox(),svg=await item.locator('svg').boundingBox();
   await page.mouse.move(box.x+2,box.y+box.height/2);await page.waitForTimeout(130);
   const before=await snapshot();assert.equal(await tip.isVisible(),true);
   for(const x of [svg.x+1,svg.x+svg.width/2,svg.x+svg.width-1,box.x+box.width-3,box.x+2]){
    await page.mouse.move(x,box.y+box.height/2);assert.equal(await tip.isVisible(),true);
   }
   const after=await snapshot();console.log('Tooltip child-boundary trace:',{folded,before,after});
   assert.deepEqual(after,before,'Moving inside one navigation item must not hide or replay the tooltip animation');
   await item.focus();assert.deepEqual(await snapshot(),before,'Focus on the hovered item must not replay its animation');
   const next=root.locator('[data-kind=favorite]');await next.hover();assert.equal(await tip.innerText(),'收藏');
   assert.equal((await snapshot()).animations,before.animations+1);
   await root.locator('.brand').hover();assert.equal(await tip.isVisible(),false);
   await next.focus();assert.equal(await tip.innerText(),'收藏');assert.equal(await tip.isVisible(),true);
   await root.locator('[data-action=new]').focus();assert.equal(await tip.isVisible(),false);
   assert.equal(await root.locator('.sidebar .nav-item[title]').count(),0,'Custom tooltips must not overlap native titles');
   console.log('PASS stable tooltip in '+(folded?'collapsed':'expanded')+' sidebar');
  }
  await root.locator('[data-kind=all]').hover();await root.locator('.sidebar').dispatchEvent('scroll');assert.equal(await tip.isVisible(),false);
  await root.locator('[data-kind=favorite]').hover();await page.mouse.down();assert.equal(await tip.isVisible(),false);await page.mouse.up();
  await root.locator('[data-kind=favorite]').hover();await root.locator('[data-action=collapse]').click();assert.equal(await tip.isVisible(),false);
  await root.locator('.ball').click();await root.locator('[data-action=settings]').click();await root.locator('[name=motion]').uncheck();
  const count=(await snapshot()).animations;await root.locator('[data-kind=all]').hover();assert.equal(await tip.isVisible(),true);assert.equal((await snapshot()).animations,count);
  await root.locator('[name=motion]').check();await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('#db-prompt-helper-root').dataset.motion==='reduced');
  await root.locator('[data-kind=favorite]').hover();assert.equal(await tip.innerText(),'收藏');
  assert.deepEqual(errors,[]);console.log('PASS click/collapse cleanup, motion off and reduced motion');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
