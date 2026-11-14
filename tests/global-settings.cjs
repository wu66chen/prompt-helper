const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),C=require('../src/core.cjs');
const dir=path.resolve(__dirname,'..'),script=fs.readFileSync(path.join(dir,'prompt-helper.user.js'),'utf8');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),pages=new Set(),errors=[];
 // A shared GM store across unrelated origins, unlike localStorage/BroadcastChannel.
 const store={ph3_sites_global:{custom:['alpha.test','beta.test','gamma.test','delta.test'].map(host=>({host,enabled:true}))},'ph3_settings_alpha.test':{theme:'dark',compact:false,collapse:'double'},'ph3_settings_beta.test':{theme:'light'},'ph3_layout_alpha.test':{anchor:{x:1300,y:900},size:{w:680,h:650},direction:'up-left'}};
 await context.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>跨网站设置验证</title><body style="background:#dce1e8">网站测试背景</body>'}));
 await context.exposeBinding('__writeGM',async({page},key,value,remove)=>{
   if(remove)delete store[key];else store[key]=value;
   await Promise.all([...pages].filter(p=>p!==page&&!p.isClosed()).map(p=>p.evaluate(({key,value,remove})=>window.__receiveGM?.(key,value,remove),{key,value,remove})));
 });
 async function create(host,width=1440,height=1000){
  const page=await context.newPage();await page.setViewportSize({width,height});page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(snapshot=>{
    const original=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){return original.call(this,{...o,mode:'open'});};
    const data=structuredClone(snapshot),listeners=new Map();
    window.GM_getValue=(k,f)=>Object.hasOwn(data,k)?structuredClone(data[k]):f;
    window.GM_listValues=()=>Object.keys(data);
    window.__receiveGM=(k,v,remove)=>{const old=data[k];if(remove)delete data[k];else data[k]=v;(listeners.get(k)||[]).forEach(fn=>fn(k,old,v,true));};
    window.GM_setValue=(k,v)=>{const old=data[k];data[k]=structuredClone(v);(listeners.get(k)||[]).forEach(fn=>fn(k,old,v,false));window.__writeGM(k,v,false);};
    window.GM_deleteValue=k=>{delete data[k];window.__writeGM(k,null,true);};
    window.GM_addValueChangeListener=(k,fn)=>listeners.set(k,[...(listeners.get(k)||[]),fn]);
    window.GM_registerMenuCommand=()=>{};window.GM_setClipboard=(_t,_f,cb)=>cb();window.GM_xmlhttpRequest=()=>{throw Error('unexpected network');};
  },JSON.parse(JSON.stringify(store)));
  await page.goto('https://'+host+'/');pages.add(page);await page.evaluate(script);return page;
 }
 const a=await create('alpha.test'),b=await create('beta.test',900,760);
 const root=p=>p.locator('#db-prompt-helper-root'),panel=p=>root(p).locator('.panel'),ball=p=>root(p).locator('.ball');
 const open=async p=>{await ball(p).click();await p.waitForTimeout(200);};
 const settings=async p=>{await root(p).locator('[data-action=settings]').click();};
 assert.equal(await root(b).getAttribute('data-theme'),'dark');assert.equal(store.ph3_settings_global.collapseModes.double,true);
 await open(a);await open(b);await settings(a);await settings(b);
 await root(a).locator('[name=theme]').selectOption('light');
 await b.waitForFunction(()=>document.querySelector('#db-prompt-helper-root').dataset.theme==='light');
 assert.equal(await root(b).locator('[name=theme]').inputValue(),'light');
 await root(b).locator('[name=compact]').check();await a.waitForFunction(()=>document.querySelector('#db-prompt-helper-root').shadowRoot.querySelector('[name=compact]').checked);
 await root(a).locator('[name=collapse][value=double]').uncheck();await b.waitForFunction(()=>!document.querySelector('#db-prompt-helper-root').shadowRoot.querySelector('[name=collapse][value=double]').checked);
 await root(a).locator('[data-action=toggle-sidebar]').click();await b.waitForFunction(()=>document.querySelector('#db-prompt-helper-root').shadowRoot.querySelector('.panel').classList.contains('sidebar-collapsed'));
 assert.equal(store.ph3_settings_global.theme,'light');assert.equal(store.ph3_settings_global.compact,true);
 console.log('PASS legacy migration and live preferences across unrelated origins');
 await root(a).locator('[data-action=collapse]').click();await root(b).locator('[data-action=collapse]').click();
 async function drag(p,locator,dx,dy){const r=await locator.boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.mouse.move(r.x+r.width/2+dx,r.y+r.height/2+dy,{steps:8});await p.mouse.up();}
 await drag(a,ball(a),-150,-120);await b.waitForTimeout(100);
 const expected=C.layoutAnchor(store.ph3_layout_global,900,760,store.ph3_settings_global.launcherSize),actual=await ball(b).boundingBox();assert.ok(Math.abs(expected.x-actual.x)<1&&Math.abs(expected.y-actual.y)<1);
 await open(b);const r=await panel(b).boundingBox();assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=900&&r.y+r.height<=760);
 const saved=JSON.stringify(store.ph3_layout_global);await b.setViewportSize({width:390,height:600});await b.waitForTimeout(150);assert.equal(JSON.stringify(store.ph3_layout_global),saved);
 const narrow=await panel(b).boundingBox();assert.ok(narrow.x+narrow.width<=390&&narrow.y+narrow.height<=600);
 await root(b).locator('[data-action=collapse]').click();assert.equal(JSON.stringify(store.ph3_layout_global),saved);
 await b.setViewportSize({width:900,height:760});await open(b);const expanded=await panel(b).boundingBox();assert.ok(Math.abs(expanded.width-r.width)<1);
 console.log('PASS relative position, viewport clamping and no feedback from resize or collapse');
 await open(a);await settings(a);await root(a).locator('[name=syncPosition]').uncheck();await b.waitForFunction(()=>GM_getValue('ph3_settings_global').syncPosition===false);
 const before=await panel(b).boundingBox();await drag(a,root(a).locator('.brand'),-60,-40);await b.waitForTimeout(80);assert.deepEqual(await panel(b).boundingBox(),before);
 assert.ok(store['ph3_layout_alpha.test']&&store['ph3_layout_beta.test']);
 const independent=await create('alpha.test');const own=store['ph3_layout_alpha.test'].anchor,restored=await ball(independent).boundingBox();assert.ok(Math.abs(own.x-restored.x)<1&&Math.abs(own.y-restored.y)<1);await independent.close();pages.delete(independent);
 await root(a).locator('[name=syncPosition]').check();await b.waitForFunction(()=>GM_getValue('ph3_settings_global').syncPosition===true);await b.waitForTimeout(80);
 const c=await create('gamma.test',1100,800);assert.equal(await root(c).getAttribute('data-theme'),'light');await open(c);assert.equal(await panel(c).evaluate(el=>el.classList.contains('compact')),true);
 const expectedC=C.layoutAnchor(store.ph3_layout_global,1100,800,store.ph3_settings_global.launcherSize);
 assert.ok(Math.abs(await ball(c).evaluate(el=>parseFloat(el.style.left))-expectedC.x)<1);
 console.log('PASS position opt-out, opt-in and newly opened site using latest settings');
 await settings(c);await panel(c).screenshot({path:path.join(dir,'artifacts/global-settings.png')});
 // Remote preferences must not replace another site's in-progress sync form.
 await root(b).locator('[data-action=settings]').click();await root(b).locator('[data-action=settings-tab][data-key=sync]').click();await root(b).locator('[name=dav-username]').fill('unsaved@example.invalid');
 await root(a).locator('[name=opaque]').check();await b.waitForTimeout(100);assert.equal(await root(b).locator('[name=dav-username]').inputValue(),'unsaved@example.invalid');
 await root(b).locator('[data-action=collapse]').click();
 await root(a).locator('[name=launcherSize]').fill('128');await root(a).locator('[name=launcherSize]').dispatchEvent('change');
 await b.waitForFunction(()=>document.querySelector('#db-prompt-helper-root').shadowRoot.querySelector('.ball').getBoundingClientRect().width===128);
 assert.equal(await root(c).locator('[name=launcherSize]').inputValue(),'128');
 const sized=await create('delta.test');assert.equal((await ball(sized).boundingBox()).width,128);await sized.close();pages.delete(sized);
 console.log('PASS launcher size live sync across unrelated origins and new sites');
 console.log('PASS remote settings preserve unfinished form input');
 await root(a).locator('[data-action=prompt-tools]').click();await root(c).locator('[data-action=prompt-tools]').click();
 await root(a).locator('[data-action=edit-tool][data-key=title]').click();await root(a).locator('[name=content]').fill('跨网站工具 {{原文}}');await root(a).locator('[data-action=save-prompt]').click();
 await c.waitForFunction(()=>!!document.querySelector('#db-prompt-helper-root').shadowRoot.querySelector('[data-action=reset-tool][data-key=title]'));
 await root(c).locator('[data-action=copy-tool][data-key=title]').click();
 assert.equal(C.project(await c.evaluate(()=>GM_listValues().filter(k=>k.startsWith('ph3_op_')).flatMap(k=>GM_getValue(k)))).tool.find(t=>t.key==='title').text,'跨网站工具 {{原文}}');
 console.log('PASS custom tool changes shared across unrelated origins');
 await root(a).locator('[data-action=settings]').click();await root(a).locator('[name=libraryLayout]').selectOption('masonry');
 await root(c).locator('[data-action=settings]').click();assert.equal(await root(c).locator('[name=libraryLayout]').inputValue(),'masonry');
 await root(c).locator('[data-action=back]').click();assert.equal(await root(c).locator('.prompt-list.masonry').count(),1);
 for(const layout of ['grid','titles']){
  await root(a).locator('[name=libraryLayout]').selectOption(layout);
  await c.waitForFunction(mode=>document.querySelector('#db-prompt-helper-root').shadowRoot.querySelector('.prompt-list').classList.contains(mode==='titles'?'titles-only':'equal-grid'),layout);
  await root(c).locator('[data-action=settings]').click();assert.equal(await root(c).locator('[name=libraryLayout]').inputValue(),layout);await root(c).locator('[data-action=back]').click();
 }
 assert.deepEqual(errors,[]);console.log('PASS library layout preference across unrelated origins');await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
