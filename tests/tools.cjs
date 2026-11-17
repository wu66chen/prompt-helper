const {chromium}=require('playwright'),{setup}=require('./browser.cjs'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dir=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1100,height:850}}),a=await context.newPage(),b=await context.newPage(),errors=[];
  for(const p of [a,b]){p.on('pageerror',e=>errors.push(e.message));await setup(p);}
  const root=p=>p.locator('#db-prompt-helper-root'),act=(p,name,key)=>root(p).locator(`[data-action="${name}"]${key?`[data-key="${key}"]`:''}`);
  const open=async p=>{await root(p).locator('.ball').click();await act(p,'prompt-tools').click();};
  const input=(p,name)=>root(p).locator(`[name="${name}"]`);
  const confirm=async p=>act(p,'dialog-confirm').click();
  await open(a);await open(b);
  await act(a,'copy-tool','refine').click();const builtin=await a.evaluate(()=>__clipboard);
  assert.ok(builtin.includes('{{输出比例}}'));assert.ok(builtin.includes('变量由用户决定'));assert.ok(builtin.includes('图片、音频和附件'));
  await act(a,'edit-tool','refine').click();await input(a,'content').fill('按 {{输出比例}} 输出，保留 {{输出比例}}。');await a.keyboard.press('Control+Enter');
  await b.waitForFunction(()=>!!document.querySelector('#db-prompt-helper-root').shadowRoot.querySelector('[data-action=reset-tool][data-key=refine]'));
  await act(b,'copy-tool','refine').click();assert.equal(await b.evaluate(()=>__clipboard),'按 {{输出比例}} 输出，保留 {{输出比例}}。');
  await act(a,'reset-tool','refine').click();await act(a,'dialog-cancel').click();assert.equal(await act(a,'reset-tool','refine').count(),1);
  await act(a,'reset-tool','refine').click();await confirm(a);await act(a,'copy-tool','refine').click();assert.equal(await a.evaluate(()=>__clipboard),builtin);
  console.log('PASS built-in edit, literal variable copy, keyboard save, live update and restore');
  await act(a,'new-tool').click();await act(a,'save-prompt').click();assert.ok((await root(a).locator('.toast').textContent()).includes('请填写'));
  const title='<img src=x onerror=alert(1)>',body='保留 {{比例}} 与 {{比例}}。\n<script>literal</script>';
  await input(a,'title').fill(title);await input(a,'description').fill('我自己的检查工具');await input(a,'content').fill(body);await act(a,'save-prompt').click();
  const card=root(a).locator('.tool-card').filter({hasText:title}),key=await card.getAttribute('data-tool');
  assert.equal(await card.locator('img,script').count(),0);await act(a,'copy-tool',key).click();assert.equal(await a.evaluate(()=>__clipboard),body);
  await act(a,'edit-tool',key).click();await input(a,'description').fill('新的说明');await act(a,'save-prompt').click();assert.ok((await card.textContent()).includes('新的说明'));
  await act(a,'delete-tool',key).click();await act(a,'dialog-cancel').click();assert.equal(await card.count(),1);
  await act(a,'delete-tool',key).click();await confirm(a);assert.equal(await card.count(),0);await root(a).locator('.toast button').click();assert.equal(await card.count(),1);
  console.log('PASS custom add/edit/delete, validation, escaped rendering and undo');
  await act(a,'edit-tool',key).click();await input(a,'content').fill('我的未提交修改 {{尺寸}}');
  await act(b,'edit-tool',key).click();await input(b,'content').fill('另一个标签页的新版');await act(b,'save-prompt').click();
  assert.equal(await input(a,'content').inputValue(),'我的未提交修改 {{尺寸}}');await act(a,'save-prompt').click();assert.ok((await root(a).locator('.toast').textContent()).includes('其他页面修改'));
  await act(a,'save-tool-copy').click();assert.equal(await root(a).locator('.tool-card').count(),5);await act(a,'copy-tool',key).click();assert.equal(await a.evaluate(()=>__clipboard),'另一个标签页的新版');
  console.log('PASS stale editor preserves local draft and saves a copy without replacing newer content');
  await act(a,'new-tool').click();await input(a,'title').fill('未完成工具');await input(a,'content').fill('草稿内容 {{参数}}');await a.keyboard.press('Escape');await confirm(a);
  await a.reload();await a.evaluate(fs.readFileSync(path.join(dir,'prompt-helper.user.js'),'utf8'));await root(a).locator('.ball').click();await act(a,'drafts').click();
  const draft=root(a).locator('.draft-row').filter({hasText:'未完成工具'});await draft.locator('[data-action=restore-draft]').click();assert.equal(await input(a,'content').inputValue(),'草稿内容 {{参数}}');await act(a,'save-prompt').click();
  assert.equal(await root(a).locator('.draft-row').count(),0);await act(a,'prompt-tools').click();assert.equal(await root(a).locator('.tool-card').count(),6);
  await act(a,'new-tool').click();await input(a,'title').fill('不会保存');await act(a,'discard-draft').click();await confirm(a);assert.equal(await root(a).locator('.tool-card').count(),6);
  console.log('PASS reload, tool draft recovery and discard return to tool list');
  fs.mkdirSync(path.join(dir,'artifacts/tools'),{recursive:true});
  for(const theme of ['light','dark']){
   await act(a,'settings').click();await input(a,'theme').selectOption(theme);await act(a,'prompt-tools').click();
   await root(a).locator('.panel').screenshot({path:path.join(dir,'artifacts/tools/list-'+theme+'.png')});
  }
  await act(a,'edit-tool','refine').click();await a.setViewportSize({width:390,height:700});
  assert.equal(await root(a).locator('.content').count(),1);
  assert.equal(await root(a).locator('.form-scroll').evaluate(e=>e.scrollWidth>e.clientWidth),false);
  await root(a).locator('.panel').screenshot({path:path.join(dir,'artifacts/tools/editor-narrow.png')});
  await a.keyboard.press('Escape');await root(a).locator('.panel').screenshot({path:path.join(dir,'artifacts/tools/list-narrow.png')});
  assert.equal(await root(a).locator('.tool-library').evaluate(e=>e.scrollWidth>e.clientWidth),false);
  assert.deepEqual(errors,[]);console.log('PASS light/dark and narrow list/editor layouts; no runtime errors');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
