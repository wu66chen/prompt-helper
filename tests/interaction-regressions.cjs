const {chromium}=require('playwright'),{setup}=require('./browser.cjs'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage();await setup(page);const root=page.locator('#db-prompt-helper-root'),act=a=>root.locator(`[data-action=${a}]`);await act('open').click();
 await act('groups').click();const rows=root.locator('.manage-tag'),before=await rows.locator('.tag-name').allTextContents();
 const drag=await page.evaluateHandle(()=>new DataTransfer());await rows.nth(2).dispatchEvent('dragstart',{dataTransfer:drag});const box=await rows.first().boundingBox();await rows.first().dispatchEvent('drop',{dataTransfer:drag,clientY:box.y+2});
 const after=await rows.locator('.tag-name').allTextContents();assert.equal(after[0],before[2],'dropping above a tag must insert there, not append at the bottom');
 assert.equal(await rows.first().locator('.tag-count').textContent(),'1');await rows.first().locator('[data-action=tag-down]').click();assert.equal((await rows.locator('.tag-name').allTextContents())[1],before[2]);await rows.nth(1).locator('[data-action=tag-up]').click();assert.equal((await rows.locator('.tag-name').allTextContents())[0],before[2]);
 fs.mkdirSync(path.join(__dirname,'../artifacts/profile'),{recursive:true});await root.locator('.panel').screenshot({path:path.join(__dirname,'../artifacts/profile/groups-light.png')});
 await act('back').click();await root.locator('.prompt [data-action=edit]').first().click();await act('back').click();await act('drafts').click();assert.equal(await root.locator('.draft-row').count(),0,'untouched original template must not create a draft');
 for(const name of ['content','tags']){await act('back').click();await root.locator('.prompt [data-action=edit]').first().click();const field=root.locator(`[name=${name}]`);await field.fill((await field.inputValue())+'修改');await act('back').click();assert.equal(await root.locator('.dialog h2').textContent(),'如果返回，你编辑的内容将丢失。');await act('dialog-cancel').click();await act('drafts').click();assert.equal(await root.locator('.draft-row').count(),0);}
 console.log('PASS tag drop insertion and untouched template exit');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
