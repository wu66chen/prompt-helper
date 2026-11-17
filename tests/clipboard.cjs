const {chromium}=require('playwright'),{setup}=require('./browser.cjs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']}),page=await context.newPage();await setup(page);await page.bringToFront();
  const root=page.locator('#db-prompt-helper-root');await root.locator('.ball').click();
  // Exercise an event-based userscript clipboard bridge against the real OS clipboard,
  // rather than a mock that only assigns __clipboard and calls success.
  await page.evaluate(()=>{window.__bridge=window.GM_setClipboard=(text,_type,callback)=>{window.__requested=text;const handler=e=>{e.clipboardData.setData('text/plain',text);e.preventDefault();window.__bridgeReached=true;};document.addEventListener('copy',handler,true);try{document.execCommand('copy');callback();}finally{document.removeEventListener('copy',handler,true);}};window.__nativeWrite=navigator.clipboard.writeText.bind(navigator.clipboard);});
  await page.evaluate(()=>navigator.clipboard.writeText('OLD CLIPBOARD'));
  const card=root.locator('.prompt').first(),expected=await card.locator('.prompt-content').textContent();
  await card.locator('[data-action=copy]').click();
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),expected,'success toast must correspond to actual clipboard text');
  console.log('PASS real clipboard receives text through an event-based GM clipboard bridge');
  const reset=()=>page.evaluate(()=>window.__nativeWrite('OLD CLIPBOARD'));
  const copied=async(expected)=>{await page.waitForFunction(()=>document.querySelector('#db-prompt-helper-root').shadowRoot.querySelector('.toast').textContent==='已复制到剪贴板');assert.equal((await page.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n'),expected);};
  await reset();await card.locator('[data-action=copy-text]').click();await copied(expected);
  await reset();await card.locator('[data-action=preview]').click();await root.locator('[data-action=dialog-confirm]').click();await copied(expected);
  await root.locator('[data-action=settings]').click();await root.locator('[name=libraryLayout]').selectOption('titles');await root.locator('[data-action=back]').click();
  await reset();await card.locator('[data-action=copy]').click();await copied(expected);
  await reset();await card.locator('[data-action=preview]').click();await root.locator('[data-action=dialog-confirm]').click();await copied(expected);
  await card.locator('[data-action=favorite]').click();await root.locator('[data-action=filter][data-kind=favorite]').click();await reset();await root.locator('.prompt [data-action=copy]').first().click();await copied(expected);
  await root.locator('.prompt [data-action=use]').first().click();await root.locator('[name=variable-0]').fill('测试原文');await root.locator('[name=variable-1]').fill('测试读者');
  const filled=await root.locator('[name=output]').inputValue();await reset();await root.locator('[data-action=copy-output]').click();await copied(filled);
  await reset();await root.locator('[name=output]').focus();await page.keyboard.press('Control+Enter');await copied(filled);
  await root.locator('[name=output]').fill('');await reset();await root.locator('[data-action=copy-output]').click();assert.equal(await root.locator('.toast').textContent(),'没有可复制的内容');assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'OLD CLIPBOARD');
  await root.locator('[data-action=settings]').click();await root.locator('[data-action=dialog-cancel]').click();await root.locator('[name=libraryLayout]').selectOption('masonry');await root.locator('[data-action=back]').click();await reset();await root.locator('.prompt [data-action=copy]').first().click();await copied(expected);
  await root.locator('[data-action=prompt-tools]').click();
  for(const key of ['refine','title','tags']){await reset();await root.locator(`[data-action=copy-tool][data-key=${key}]`).click();await copied(await page.evaluate(()=>__requested));}
  await root.locator('[data-action=new-tool]').click();await root.locator('[name=title]').fill('剪贴板验证工具');await root.locator('[name=content]').fill('完整正文 {{测试参数}}\n第二行 <literal>');await root.locator('[data-action=save-prompt]').click();
  const custom=root.locator('.tool-card').filter({hasText:'剪贴板验证工具'}).locator('[data-action=copy-tool]'),customText='完整正文 {{测试参数}}\n第二行 <literal>';
  await reset();await custom.click();await copied(customText);
  console.log('PASS body click, favorites, filled output/button/shortcut, empty output rejection, masonry and built-in/custom tools');
  for(const mode of ['throw','callback-error','silent-no-write','timeout']){
   await page.evaluate(mode=>{window.GM_setClipboard=(_text,_type,callback)=>{if(mode==='throw')throw Error('fixture failure');if(mode==='callback-error')callback(new Error('fixture callback failure'));if(mode==='silent-no-write')callback();};},mode);
   await reset();await custom.click();await copied(customText);
  }
  console.log('PASS error, error callback, no-op success and timeout use the browser clipboard fallback');
  await page.evaluate(()=>{window.GM_setClipboard=()=>{throw Error('fixture failure')};navigator.clipboard.writeText=async()=>{throw Error('fixture denied')};});
  await reset();await custom.click();await root.locator('.dialog').waitFor();assert.equal(await root.locator('.toast').textContent(),'自动复制未完成，请手动复制');
  const manual=root.locator('.dialog textarea');assert.equal(await manual.inputValue(),customText);assert.equal(await manual.evaluate(e=>e.selectionEnd-e.selectionStart),customText.length);
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'OLD CLIPBOARD');await page.keyboard.press('Control+C');assert.equal((await page.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n'),customText);await root.locator('[data-action=dialog-confirm]').click();
  console.log('PASS failure shows no success toast and selected full-text manual copy works');
  await page.evaluate(()=>{navigator.clipboard.writeText=window.__nativeWrite;window.__copyCalls=0;window.GM_setClipboard=(text,info,callback)=>{window.__copyCalls++;setTimeout(()=>window.__bridge(text,info,callback),200);};});
  await reset();await custom.evaluate(e=>{e.click();e.click();});assert.equal(await page.evaluate(()=>__copyCalls),1);await copied(customText);
  console.log('PASS overlapping copy requests are guarded; asynchronous clipboard events reach the bridge');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
