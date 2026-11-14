const {chromium}=require('playwright'),{setup}=require('./browser.cjs'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),C=require('../src/core.cjs');
const dir=path.resolve(__dirname,'..'),script=fs.readFileSync(path.join(dir,'prompt-helper.user.js'),'utf8');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const contexts=await Promise.all([1,2,3].map(()=>browser.newContext())),[a,b,c]=await Promise.all(contexts.map(ctx=>ctx.newPage()));
  await a.addInitScript(()=>{if(!localStorage.getItem('seed-tools')){localStorage.setItem('seed-tools','yes');localStorage.setItem('gm:ph3_tool_refine',JSON.stringify({title:'我的优化',description:'已修改的内置工具',text:'内置修改 {{参数}}'}));localStorage.setItem('gm:ph3_tool_custom-fixture',JSON.stringify({title:'自定义工具',description:'自定义说明',text:'检查 {{输出比例}}'}));}});
  for(const page of [a,b,c])await setup(page);
  const root=p=>p.locator('#db-prompt-helper-root'),act=(p,name,key)=>root(p).locator(`[data-action="${name}"]${key?`[data-key="${key}"]`:''}`);
  const tools=async p=>act(p,'prompt-tools').click();
  const open=async p=>{await root(p).locator('.ball').click();await tools(p);};
  const sync=async p=>{await p.evaluate(()=>GM_setValue('ph3_sync',{username:'fixture',password:'fixture-secret',folder:'PromptHelper',auto:false}));await act(p,'sync').click();await p.waitForFunction(()=>document.querySelector('#db-prompt-helper-root').dataset.syncing==='false');};
  const transfer=async(from,to)=>{const data=await from.evaluate(()=>({cloud:localStorage.getItem('mock-cloud'),etag:localStorage.getItem('mock-etag')}));await to.evaluate(({cloud,etag})=>{localStorage.setItem('mock-cloud',cloud);localStorage.setItem('mock-etag',etag);},data);};
  await open(a);await act(a,'copy-tool','refine').click();assert.equal(await a.evaluate(()=>__clipboard),'内置修改 {{参数}}');assert.equal(await root(a).locator('.tool-card').count(),4);
  await sync(a);const cloud=await a.evaluate(()=>localStorage.getItem('mock-cloud'));assert.equal(C.project(C.unpack(cloud)).tool.length,2);assert.ok(!cloud.includes('fixture-secret'));
  await transfer(a,b);await open(b);await sync(b);await tools(b);await act(b,'copy-tool','custom-fixture').click();assert.equal(await b.evaluate(()=>__clipboard),'检查 {{输出比例}}');
  console.log('PASS legacy local tools migrate and transfer to a fresh device through simulated WebDAV');
  await act(a,'settings').click();await root(a).locator('[data-action=settings-tab][data-key=backup]').click();
  const downloadPromise=a.waitForEvent('download');await act(a,'export-json').click();const download=await downloadPromise,backup=path.join(dir,'artifacts/tool-backup.json');await download.saveAs(backup);
  assert.equal(C.project(C.unpack(fs.readFileSync(backup,'utf8'))).tool.length,2);
  await open(c);await root(c).locator('.import-file').setInputFiles(backup);await act(c,'dialog-confirm').click();await tools(c);await act(c,'copy-tool','refine').click();assert.equal(await c.evaluate(()=>__clipboard),'内置修改 {{参数}}');
  console.log('PASS JSON export/import restores built-in overrides and custom tools');
  for(const [page,text] of [[b,'设备 B 的版本'],[c,'设备 C 的版本']]){await act(page,'edit-tool','custom-fixture').click();await root(page).locator('[name=content]').fill(text);await act(page,'save-prompt').click();}
  const concurrent=await c.evaluate(()=>GM_listValues().filter(k=>k.startsWith('ph3_op_')).flatMap(k=>GM_getValue(k)));
  await b.evaluate(ops=>GM_setValue('ph3_op_fixture-concurrent',ops),concurrent);await tools(b);
  assert.equal(await root(b).locator('[data-tool="custom-fixture"]').count(),2);
  await act(b,'resolve-tool','custom-fixture').first().click();await act(b,'dialog-confirm').click();assert.equal(await root(b).locator('[data-tool="custom-fixture"]').count(),1);
  console.log('PASS concurrent tool versions are visible and can be resolved explicitly');
  await act(b,'delete-tool','custom-fixture').click();await act(b,'dialog-confirm').click();await act(b,'reset-tool','refine').click();await act(b,'dialog-confirm').click();await sync(b);
  await transfer(b,a);await tools(a);await sync(a);assert.equal(await root(a).locator('[data-tool="custom-fixture"]').count(),0);await act(a,'copy-tool','refine').click();assert.ok((await a.evaluate(()=>__clipboard)).includes('通用模板'));
  await a.reload();await a.evaluate(script);await open(a);assert.equal(await root(a).locator('.tool-card').count(),3,await root(a).locator('.content').textContent());
  await root(a).locator('.import-file').setInputFiles(backup);if(await root(a).locator('.overlay').isVisible())await act(a,'dialog-confirm').click();await tools(a);assert.equal(await root(a).locator('.tool-card').count(),3);
  console.log('PASS delete/reset sync, reload migration idempotency and stale backup cannot resurrect tools');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
