const {chromium}=require('playwright'),{setup}=require('./browser.cjs'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dir=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const titles=['生成无缝面料色卡','把会议讨论整理为行动清单，完整保留负责人、期限和依赖条件','改写工作邮件','扩图与场景补全','比较多个实施方案的成本、风险和适用边界','检查变量'];
  await page.addInitScript(titles=>{if(!localStorage.getItem('grid-seed')){localStorage.setItem('grid-seed','yes');localStorage.setItem('gm:ph3_migrated','true');localStorage.setItem('gm:ph3_op_grid-seed',JSON.stringify(titles.map((title,i)=>({id:'grid-'+i,key:'grid-'+i,entity:'prompt',parents:[],device:'fixture',at:100-i,value:{title,content:('以上传的面料小样图片为唯一视觉参考，生成比例为 {{比例}} 的图像。\n').repeat(i+2),tags:i%2?['工作','常用']:['面料','扩图','面料小样'],favorite:false}}))));}},titles);
  await setup(page);const root=page.locator('#db-prompt-helper-root'),act=name=>root.locator(`[data-action=${name}]`);await root.locator('.ball').click();
  assert.equal(await root.locator('.equal-grid:not(.titles-only)').count(),1,'new installations default to equal grid');
  const setLayout=async layout=>{await act('settings').click();await root.locator('[name=libraryLayout]').selectOption(layout);await act('back').click();await page.waitForTimeout(100);};
  async function check(mode){
   await page.waitForTimeout(350);
   const rows=await root.locator('.prompt').evaluateAll(cards=>cards.map(c=>({height:c.offsetHeight,overflow:c.scrollWidth>c.clientWidth,actions:[...c.querySelectorAll('.actions>button')].map(b=>({top:b.getBoundingClientRect().top,height:b.getBoundingClientRect().height,width:b.getBoundingClientRect().width}))})));
   assert.ok(rows.every(r=>!r.overflow),mode+' cards should not overflow');
   for(const row of rows){assert.equal(row.actions.length,4);assert.ok(Math.max(...row.actions.map(a=>a.top))-Math.min(...row.actions.map(a=>a.top))<1,mode+' actions must stay in one row');assert.ok(row.actions.every(a=>a.height>=32&&Math.abs(a.height-row.actions[0].height)<1&&a.width>0),JSON.stringify(row.actions));}
   if(mode==='grid')assert.ok(Math.max(...rows.map(r=>r.height))-Math.min(...rows.map(r=>r.height))<=1,'all grid cards have equal height');
   assert.deepEqual(await root.locator('.prompt h3').allTextContents(),titles);
   assert.equal(await root.locator('.prompt-list').evaluate(e=>e.scrollWidth>e.clientWidth),false);
  }
  await check('grid');const before=await root.locator('.prompt').first().evaluate(e=>e.offsetHeight);
  await act('preview').first().click();assert.ok((await root.locator('.prompt-preview').textContent()).includes('{{比例}}'));
  await act('dialog-confirm').click();assert.ok((await page.evaluate(()=>__clipboard)).includes('生成比例为 比例'));assert.equal(await root.locator('.prompt').first().evaluate(e=>e.offsetHeight),before);
  await act('preview').first().click();await act('preview-use').click();assert.equal(await root.locator('[name=variable-0]').count(),1);await page.keyboard.press('Escape');
  fs.mkdirSync(path.join(dir,'artifacts/grid-views'),{recursive:true});
  for(const mode of ['grid','titles','masonry','list']){
   await setLayout(mode);if(mode==='titles'){assert.equal(await root.locator('.prompt-content,.prompt .tags').count(),0);await act('preview').first().click();await act('dialog-cancel').click();}
   await check(mode);await root.locator('.panel').screenshot({path:path.join(dir,'artifacts/grid-views/'+mode+'-default.png')});
   const beforeMax=await root.locator('.panel').boundingBox();await act('maximize').click();await check(mode);await act('maximize').click();
   const afterMax=await root.locator('.panel').boundingBox();assert.ok(Math.abs(beforeMax.width-afterMax.width)<1&&Math.abs(beforeMax.height-afterMax.height)<1,'maximizing and restoring preserves size');
   for(const width of [390,280]){await page.setViewportSize({width,height:760});await check(mode);}
   await page.setViewportSize({width:1440,height:1000});
  }
  for(const mode of ['grid','titles']){
   await setLayout(mode);await act('settings').click();await root.locator('[name=theme]').selectOption('dark');await root.locator('[name=compact]').check();await act('back').click();await check(mode);
   await root.locator('.panel').screenshot({path:path.join(dir,'artifacts/grid-views/'+mode+'-dark.png')});
  }
  await page.reload();await page.evaluate(fs.readFileSync(path.join(dir,'prompt-helper.user.js'),'utf8'));await root.locator('.ball').click();assert.equal(await root.locator('.titles-only').count(),1,'saved choice survives reload');
  const other=await context.newPage();await setup(other);await other.locator('#db-prompt-helper-root .ball').click();assert.equal(await other.locator('#db-prompt-helper-root .titles-only').count(),1);
  // Previously saved list/masonry preferences must not be replaced by the new default.
  for(const layout of ['list','masonry']){await setLayout(layout);await page.reload();await page.evaluate(fs.readFileSync(path.join(dir,'prompt-helper.user.js'),'utf8'));await root.locator('.ball').click();assert.equal(await page.evaluate(()=>GM_getValue('ph3_settings_global').libraryLayout),layout);}
  assert.deepEqual(errors,[]);console.log('PASS equal-grid default, full titles, title-only content, preview/copy/use, all toolbar buttons aligned in 4 modes at desktop/390/280, compact/themes and saved choices');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
