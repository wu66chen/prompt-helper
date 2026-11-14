const {chromium}=require('playwright'),{setup}=require('./browser.cjs'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dir=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),a=await context.newPage(),b=await context.newPage(),errors=[];
  const titles=['把项目复盘整理为清晰的行动清单','给非技术同事讲清一个复杂概念，保留所有必要背景与关键判断条件','邮件润色','比较三个方案的成本、风险、实施步骤与适用条件','一周食谱与购物清单','从长篇会议记录中提取负责人、交付时间、依赖事项，并区分已决定和待确认的问题','旅行计划','提示词变量检查'];
  await a.addInitScript(titles=>{if(!localStorage.getItem('masonry-seed')){localStorage.setItem('masonry-seed','yes');localStorage.setItem('gm:ph3_migrated','true');localStorage.setItem('gm:ph3_op_masonry-seed',JSON.stringify(titles.map((title,i)=>({id:'masonry-'+i,entity:'prompt',key:'masonry-'+i,at:100-i,device:'fixture',parents:[],value:{title,content:('这是用于检索和复制的完整正文 {{主题}}。\n').repeat(i%4+3),tags:i%2?['写作','工作']:['日常'],favorite:false}}))));}},titles);
  for(const p of [a,b]){p.on('pageerror',e=>errors.push(e.message));await setup(p);}
  await a.evaluate(()=>GM_setValue('ph3_op_masonry-tags',['日常','写作','工作'].map((name,i)=>({id:'masonry-tag-'+i,entity:'tag',key:'masonry-tag-'+i,at:0,device:'fixture',parents:[],value:{name,rank:i,group:''}}))));
  const root=p=>p.locator('#db-prompt-helper-root'),act=(p,name)=>root(p).locator(`[data-action=${name}]`);
  await root(a).locator('.ball').click();await root(b).locator('.ball').click();
  assert.equal(await root(a).locator('.prompt-list').evaluate(e=>e.classList.contains('masonry')),false);
  await act(a,'settings').click();await root(a).locator('[name=libraryLayout]').selectOption('masonry');await act(a,'back').click();
  await b.waitForFunction(()=>document.querySelector('#db-prompt-helper-root').shadowRoot.querySelector('.prompt-list').classList.contains('masonry'));
  async function check(p,minColumns=1){
   await p.bringToFront();
   await p.waitForFunction(()=>!!document.querySelector('#db-prompt-helper-root').shadowRoot.querySelector('.prompt-items')?.dataset.columns);
   await p.waitForTimeout(100);
   const result=await root(p).locator('.prompt-list').evaluate(el=>({columns:+el.querySelector('.prompt-items').dataset.columns,overflow:el.scrollWidth>el.clientWidth,cards:[...el.querySelectorAll('.prompt')].map(c=>({x:c.offsetLeft,y:c.offsetTop,w:c.offsetWidth,h:c.offsetHeight,overflow:c.scrollWidth>c.clientWidth}))}));
   assert.ok(result.columns>=minColumns,JSON.stringify(result));assert.equal(result.overflow,false);assert.ok(result.cards.every(c=>!c.overflow));assert.ok(Math.max(...result.cards.map(c=>c.w))-Math.min(...result.cards.map(c=>c.w))<=1);
   for(let i=0;i<result.cards.length;i++)for(let j=i+1;j<result.cards.length;j++){const x=result.cards[i],y=result.cards[j];assert.ok(x.x+x.w<=y.x||y.x+y.w<=x.x||x.y+x.h<=y.y||y.y+y.h<=x.y,'cards must not overlap');}
   return result;
  }
  await check(a,2);assert.deepEqual(await root(a).locator('.prompt h3').allTextContents(),titles);
  await act(a,'maximize').click();const wide=await check(a,3);
  assert.ok(new Set(wide.cards.map(c=>c.h)).size>1);const bottoms=Array(wide.columns).fill(0);for(const card of wide.cards){const column=bottoms.indexOf(Math.min(...bottoms));assert.ok(Math.abs(card.y-bottoms[column])<=1,'cards fill the shortest column');bottoms[column]+=card.h+12;}
  await root(a).locator('.prompt [data-action=expand]').first().click();await check(a,3);assert.equal(await root(a).locator('.prompt-content.expanded').count(),1);
  await root(a).locator('.prompt [data-action=expand]').first().click();await check(a,3);
  await root(a).locator('.prompt [data-action=copy]').first().click();assert.ok((await a.evaluate(()=>__clipboard)).includes('完整正文'));
  await root(a).locator('.search-input').fill('邮件');await a.waitForTimeout(180);assert.equal(await root(a).locator('.prompt').count(),1);await check(a);
  await root(a).locator('.search-input').fill('没有这个结果');await a.waitForTimeout(180);assert.equal(await root(a).locator('.empty').count(),1);assert.equal(await root(a).locator('.prompt').count(),0);
  await root(a).locator('.search-input').fill('');await a.waitForTimeout(180);await check(a,3);
  await root(a).locator('[data-action=tag-filter][data-key="工作"]').click();assert.equal(await root(a).locator('.prompt').count(),4);await check(a,3);
  await root(a).locator('[data-action=tag-filter][data-key=""]').click();assert.equal(await root(a).locator('.prompt').count(),8);
  fs.mkdirSync(path.join(dir,'artifacts/masonry'),{recursive:true});
  for(const theme of ['light','dark']){await act(a,'settings').click();await root(a).locator('[name=theme]').selectOption(theme);await act(a,'back').click();await check(a,3);await root(a).locator('.panel').screenshot({path:path.join(dir,'artifacts/masonry/'+theme+'.png')});}
  await act(a,'settings').click();await root(a).locator('[name=compact]').check();await act(a,'back').click();await check(a,3);
  await act(a,'maximize').click();await act(a,'toggle-sidebar').click();await check(a,2);
  await a.setViewportSize({width:390,height:700});assert.equal((await check(a)).columns,1);await root(a).locator('.panel').screenshot({path:path.join(dir,'artifacts/masonry/narrow.png')});
  await a.setViewportSize({width:1440,height:1000});await check(a,2);
  await a.reload();await a.evaluate(fs.readFileSync(path.join(dir,'prompt-helper.user.js'),'utf8'));await root(a).locator('.ball').click();await check(a,2);
  await act(a,'settings').click();await root(a).locator('[name=libraryLayout]').selectOption('list');await act(a,'back').click();assert.equal(await root(a).locator('.prompt-list.masonry').count(),0);assert.equal(await root(a).locator('.prompt').first().evaluate(e=>getComputedStyle(e).position),'static');
  assert.deepEqual(errors,[]);console.log('PASS default/list toggle, live preference sharing, equal widths, full titles, shortest-column flow, expand/collapse, copy/search/empty, themes, compact/sidebar/viewport changes and reload');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
