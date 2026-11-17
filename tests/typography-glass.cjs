const {chromium}=require('playwright'),{setup}=require('./browser.cjs'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await b.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);const r=page.locator('#db-prompt-helper-root'),act=a=>r.locator(`[data-action=${a}]`);await act('open').click();
 await page.evaluate(()=>{document.body.style.background='linear-gradient(115deg,#e3ab72 0%,#e3ab72 25%,#65bcb7 25%,#65bcb7 55%,#988bdb 55%,#988bdb 75%,#ddd277 75%)';document.body.style.minHeight='100vh';});
 const check=async(label)=>{await page.waitForTimeout(150);const overflow=await r.locator('.content,.scroll,.dialog:not([hidden])').evaluateAll(els=>els.filter(e=>e.getBoundingClientRect().width>0&&e.scrollWidth>e.clientWidth+2).map(e=>e.className));assert.deepEqual(overflow,[],label+' horizontal overflow');};
 fs.mkdirSync(path.join(__dirname,'../artifacts/typography'),{recursive:true});
 for(const size of [12,14,20]){
  await act('settings').click();await r.locator('[name=fontSize]').fill(String(size));await r.locator('[name=fontSize]').dispatchEvent('input');assert.equal(await page.evaluate(()=>GM_getValue('ph3_settings_global').fontSize),size);await check('settings '+size);
  assert.ok(Math.abs(await r.locator('.hint').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize))-11*size/14)<.05);
  await act('back').click();await check('library '+size);
  for(const width of [1440,390,280]){
   await page.setViewportSize({width,height:900});await check('library '+size+' '+width);
   await r.locator('.prompt [data-action=use]').first().click();await check('editor '+size+' '+width);
   const pair=await r.locator('.variable-editor').evaluate(e=>[...e.children].map(x=>getComputedStyle(x).fontSize));assert.equal(pair[0],pair[1]);await act('back').click();
  }
  await page.setViewportSize({width:1440,height:1000});
 }
 for(const theme of ['light','dark']){
  await act('settings').click();await r.locator('[name=theme]').selectOption(theme);await r.locator('[name=fontSize]').fill('14');await r.locator('[name=fontSize]').dispatchEvent('input');await act('back').click();
  const style=await r.locator('.panel').evaluate(e=>({filter:getComputedStyle(e).backdropFilter,bg:getComputedStyle(e).backgroundColor}));assert.ok(style.filter.includes('blur(20px)'));await page.waitForTimeout(150);await r.locator('.prompt-list').evaluate(e=>e.scrollTop=0);await r.locator('.panel').screenshot({path:path.join(__dirname,'../artifacts/typography/glass-'+theme+'.png')});
 }
 await act('settings').click();await r.locator('[name=fontSize]').fill('20');await r.locator('[name=fontSize]').dispatchEvent('input');
 await page.reload();await page.evaluate(fs.readFileSync(path.join(__dirname,'../prompt-helper.user.js'),'utf8'));await act('open').click();await act('settings').click();assert.equal(await r.locator('[name=fontSize]').inputValue(),'20');
 for(const width of [1440,390,280]){
  await page.setViewportSize({width,height:900});
  for(const tab of ['appearance','sync','sites','backup']){await r.locator(`[data-action=settings-tab][data-key=${tab}]`).click();await check('settings '+tab+' '+width);}
  for(const route of ['groups','prompt-tools','drafts']){
   if(!(await act(route).isVisible()))await act('nav').click();await act(route).click();await check(route+' '+width);await act('back').click();
  }
  await act('new').click();await r.locator('[name=content]').fill('大字号正文 {{尺寸}}');await act('back').click();await check('dirty dialog '+width);await act('dialog-cancel').click();
  await r.locator('.panel').screenshot({path:path.join(__dirname,'../artifacts/typography/settings-20-'+width+'.png')});
 }
 await r.locator('[data-action=settings-tab][data-key=appearance]').click();
 await r.locator('[name=opaque]').check();assert.equal(await r.locator('.panel').evaluate(e=>getComputedStyle(e).backdropFilter),'none');await act('reset-font-size').click();assert.equal(await r.locator('[name=fontSize]').inputValue(),'14');
 assert.deepEqual(errors,[]);console.log('PASS 12–20px live scale, all text/mirror sizing, narrow layouts, persisted/reset preference, light/dark glass and opaque fallback');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
