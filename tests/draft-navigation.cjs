const {chromium}=require('playwright'),{setup}=require('./browser.cjs'),assert=require('node:assert/strict'),C=require('../src/core.cjs'),fs=require('node:fs'),path=require('node:path');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage();await page.addInitScript(()=>{if(!localStorage.getItem('seed-nav')){localStorage.setItem('seed-nav','yes');localStorage.setItem('gm:db_prompts_data',JSON.stringify(Array.from({length:25},(_,i)=>({id:'nav-'+i,content:i===24?'纯文本演示，没有变量。':'演示 '+i+'：请整理 {{内容}}，保留主要信息。',tags:['演示']}))));}});await setup(page);const r=page.locator('#db-prompt-helper-root'),act=a=>r.locator(`[data-action=${a}]`);await act('open').click();
 await r.locator('.prompt [data-action=use]').first().click();await act('back').click();await act('drafts').click();
 assert.equal(await r.locator('.draft-row').count(),0,'opening use without edits must not create a draft');
 console.log('PASS untouched use creates no draft');
 const count=async()=>C.project(await page.evaluate(()=>GM_listValues().filter(k=>k.startsWith('ph3_op_')).flatMap(k=>GM_getValue(k)))).draft.length;
 const library=()=>r.locator('.sidebar [data-kind=all]').click();
 const cases=[
  ['新建提示词',async()=>{await library();await act('new').click();},'content'],
  ['修改原模板',async()=>{await library();await r.locator('.prompt [data-action=edit]').first().click();},'title'],
  ['填写变量',async()=>{await library();await r.locator('.prompt [data-action=use]').first().click();},'variable-0'],
  ['临时编辑',async()=>{await library();await r.locator('.prompt').filter({hasText:'纯文本演示'}).locator('[data-action=use]').click();},'output'],
  ['新建工具',async()=>{await act('prompt-tools').click();await act('new-tool').click();},'content'],
  ['修改工具',async()=>{await act('prompt-tools').click();await act('edit-tool').first().click();},'description']
 ];
 for(const [kind,enter,field] of cases){
  const before=await count();await enter();await act('back').click();assert.equal(await r.locator('.overlay').isVisible(),false,kind+' unchanged exits directly');assert.equal(await count(),before);
  await enter();const reverted=r.locator(`[name=${field}]`),original=await reverted.inputValue();await reverted.fill(original+'临时改动');await reverted.fill(original);await act('back').click();assert.equal(await r.locator('.overlay').isVisible(),false,kind+' reverted changes exit directly');assert.equal(await count(),before);
  await enter();const input=r.locator(`[name=${field}]`);await input.fill((await input.inputValue())+' 修改演示');await page.waitForTimeout(400);
  assert.equal(await page.evaluate(()=>GM_listValues().filter(k=>k.startsWith('ph3_draft_')).length),0,'no silent cache');await act('back').click();assert.equal(await r.locator('.dialog h2').textContent(),'如果返回，你编辑的内容将丢失。');await page.keyboard.press('Escape');assert.equal(await input.count(),1);
  await act('back').click();await act('dialog-cancel').click();assert.equal(await count(),before);
  await enter();await r.locator(`[name=${field}]`).fill('保存为 '+kind);await act('back').click();await act('dialog-confirm').click();assert.equal(await count(),before+1);
  await act('drafts').click();assert.equal(await r.locator('.draft-kind').filter({hasText:new RegExp('^'+kind+'$')}).count(),1);
 }
 console.log('PASS all six editor kinds: unchanged, dirty prompt, Esc, discard and explicit save; no silent drafts');
 await library();await r.locator('.prompt [data-action=use]').first().click();await r.locator('[name=variable-0]').fill('仅保留在当前页面');const savedCount=await count();await act('collapse').click();await act('open').click();assert.equal(await r.locator('[name=variable-0]').inputValue(),'仅保留在当前页面');assert.equal(await count(),savedCount);assert.equal(await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true}))),false);
 await page.keyboard.press('Control+k');assert.equal(await r.locator('.overlay').isVisible(),true);await act('dialog-cancel').click();assert.equal(await r.locator('.search-input').evaluate(e=>e.getRootNode().activeElement===e),true);await page.keyboard.press('Control+k');assert.equal(await r.locator('.search-input').evaluate(e=>e.getRootNode().activeElement===e),true);
 await page.reload();await page.evaluate(fs.readFileSync(path.join(__dirname,'../prompt-helper.user.js'),'utf8'));await act('open').click();
 await r.locator('.search-input').fill('演示');await page.waitForTimeout(150);await r.locator('.prompt-list').evaluate(e=>e.scrollTop=250);const libraryScroll=await r.locator('.prompt-list').evaluate(e=>e.scrollTop);
 await act('drafts').click();await r.locator('.scroll').evaluate(e=>e.scrollTop=100);await act('restore-draft').first().click();await act('back').click();assert.equal(await r.locator('.draft-row').count(),6);await act('back').click();assert.equal(await r.locator('.search-input').inputValue(),'演示');await page.waitForTimeout(150);assert.ok(Math.abs(await r.locator('.prompt-list').evaluate(e=>e.scrollTop)-libraryScroll)<2);
 await act('drafts').click();await act('restore-draft').first().click();const editor=r.locator('[name=content],[name=output]').first();const saved=await editor.inputValue();await editor.fill('尚未保存的改动');await act('back').click();await act('dialog-cancel').click();await act('restore-draft').first().click();assert.equal(await editor.inputValue(),saved,'discard session preserves the previously saved draft');await act('back').click();
 await act('settings').click();await r.locator('[data-action=settings-tab][data-key=backup]').click();await act('back').click();assert.equal(await r.locator('[name=theme]').count(),1);await act('back').click();assert.equal(await r.locator('.draft-row').count(),6);
 fs.mkdirSync(path.join(__dirname,'../artifacts/navigation'),{recursive:true});await r.locator('.panel').screenshot({path:path.join(__dirname,'../artifacts/navigation/draft-types.png')});
 console.log('PASS nested draft/editor/settings back paths, search/scroll preservation, and discard keeps saved draft');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
