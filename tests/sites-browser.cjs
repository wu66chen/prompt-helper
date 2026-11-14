const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dir=path.resolve(__dirname,'..'),script=fs.readFileSync(path.join(dir,'prompt-helper.user.js'),'utf8');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1100,height:850}}),pages=new Set(),errors=[];
  const store={ph3_sync:{auto:true,username:'fixture',password:'fixture',folder:'test'}},writes=[];
  await context.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Website preferences fixture</title><body style="background:#f6f7f9">Example website</body>'}));
  await context.exposeBinding('__writeGM',async({page},key,value,remove)=>{
   writes.push(key);if(remove)delete store[key];else store[key]=value;
   await Promise.all([...pages].filter(p=>p!==page&&!p.isClosed()).map(p=>p.evaluate(({key,value,remove})=>window.__receiveGM(key,value,remove),{key,value,remove})));
  });
  async function create(host,protocol='https'){
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(snapshot=>{
    const original=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){return original.call(this,{...options,mode:'open'});};
    const data=structuredClone(snapshot),listeners=new Map();window.__menus={};window.__requests=[];
    window.GM_getValue=(key,fallback)=>Object.hasOwn(data,key)?structuredClone(data[key]):fallback;
    window.GM_listValues=()=>Object.keys(data);
    window.__receiveGM=(key,value,remove)=>{const old=data[key];if(remove)delete data[key];else data[key]=structuredClone(value);(listeners.get(key)||[]).forEach(fn=>fn(key,old,value,true));};
    window.GM_setValue=(key,value)=>{const old=data[key];data[key]=structuredClone(value);(listeners.get(key)||[]).forEach(fn=>fn(key,old,value,false));window.__writeGM(key,value,false);};
    window.GM_deleteValue=key=>{delete data[key];window.__writeGM(key,null,true);};
    window.GM_addValueChangeListener=(key,fn)=>listeners.set(key,[...(listeners.get(key)||[]),fn]);
    window.GM_registerMenuCommand=(name,fn)=>window.__menus[name]=fn;
    window.GM_setClipboard=(_text,_format,done)=>done();
    window.GM_xmlhttpRequest=options=>{window.__requests.push(options.method);options.onerror();};
   },structuredClone(store));
   await page.goto(protocol+'://'+host+'/');pages.add(page);await page.evaluate(script);return page;
  }
  const root=p=>p.locator('#db-prompt-helper-root');
  const manage=async p=>{await p.evaluate(()=>window.__menus['提示词助手：网站管理']());await root(p).locator('[name=site-host]').waitFor();};
  const reload=async p=>{const url=new URL(p.url());await p.close();pages.delete(p);return create(url.host,url.protocol.slice(0,-1));};
  const rule=(p,host,name='site-custom-enabled')=>root(p).locator(`[name="${name}"][data-host="${host}"]`);
  const add=async(p,host,subdomains=false)=>{await root(p).locator('[name=site-host]').fill(host);await root(p).locator('[name=site-include-subdomains]').setChecked(subdomains);await root(p).locator('[data-form=add-site] button[type=submit]').click();};
  let unknown=await create('unknown.test','http');
  assert.equal(await unknown.evaluate(()=>crypto.randomUUID),undefined);
  assert.equal(await root(unknown).count(),0);assert.deepEqual(writes,[]);
  assert.deepEqual(await unknown.evaluate(()=>Object.keys(__menus)),['提示词助手：网站管理']);
  // Even with automatic sync configured, an unsupported page remains inert.
  await unknown.clock.install();await unknown.clock.fastForward(11*60000);
  assert.deepEqual(await unknown.evaluate(()=>__requests),[]);assert.deepEqual(writes,[]);
  await manage(unknown);await unknown.clock.fastForward(11*60000);
  assert.deepEqual(await unknown.evaluate(()=>__requests),[]);
  await root(unknown).locator('[data-action=site-enable-current]').click();
  unknown=await reload(unknown);assert.equal(await root(unknown).count(),1);
  await manage(unknown);
  console.log('PASS unknown HTTP page stays inert, menu recovers, HTTP ID fallback works, enabling survives reload');
  // Avoid exercising unrelated network retry behavior on enabled fixtures.
  await unknown.evaluate(()=>GM_setValue('ph3_sync',{}));
  const chat=await create('chatgpt.com');await manage(chat);
  await root(unknown).locator('[name=site-host]').fill('unfinished.example');
  await root(unknown).locator('[name=site-include-subdomains]').check();
  await root(unknown).locator('[name=site-host]').focus();
  await root(chat).locator('[name=site-default][data-host="chatgpt.com"]').uncheck();
  await unknown.waitForFunction(()=>!document.querySelector('#db-prompt-helper-root').shadowRoot.querySelector('[data-host="chatgpt.com"]').checked);
  assert.equal(await root(unknown).locator('[name=site-host]').inputValue(),'unfinished.example');
  assert.equal(await root(unknown).locator('[name=site-include-subdomains]').isChecked(),true);
  assert.equal(await unknown.evaluate(()=>document.querySelector('#db-prompt-helper-root').shadowRoot.activeElement.name),'site-host');
  await chat.evaluate(()=>GM_setValue('retained-test-data',{text:'saved prompt'}));
  const before=structuredClone(store),disabled=await reload(chat);
  assert.equal(await root(disabled).count(),0);assert.deepEqual(store,before);
  await manage(disabled);await root(disabled).locator('[data-action=site-enable-current]').click();
  const restored=await reload(disabled);assert.equal(await root(restored).count(),1);
  assert.equal(store['retained-test-data'].text,'saved prompt');
  console.log('PASS default disable / recovery preserves data, rules sync across origins without losing form input');
  await add(unknown,'https://Example.TEST.:8443/chat?x=1');
  assert.equal(await rule(unknown,'example.test').isChecked(),true);
  let child=await create('sub.example.test');assert.equal(await root(child).count(),0);
  await rule(unknown,'example.test','site-custom-subdomains').check();
  child=await reload(child);assert.equal(await root(child).count(),1);
  await add(unknown,'sub.example.test');await rule(unknown,'sub.example.test').uncheck();
  child=await reload(child);assert.equal(await root(child).count(),0);
  await root(unknown).locator('[data-action=site-remove][data-host="sub.example.test"]').click();
  child=await reload(child);assert.equal(await root(child).count(),1);
  await root(unknown).locator('[data-action=site-remove][data-host="example.test"]').click();
  child=await reload(child);assert.equal(await root(child).count(),0);
  await add(unknown,'javascript:alert(1)');assert.equal(await root(unknown).locator('.toast').textContent(),'只支持 HTTP / HTTPS 网站');
  assert.equal(store.ph3_sites_global.custom.some(r=>r.host==='example.test'),false);
  console.log('PASS canonical URLs, subdomains, more specific exclusions, deletion fallback and invalid input');
  // All defaults can be switched off; recovery does not depend on any allowed site.
  await unknown.evaluate(()=>{const state=GM_getValue('ph3_sites_global');state.disabledDefaults=Array.from(document.querySelector('#db-prompt-helper-root').shadowRoot.querySelectorAll('[name=site-default]'),e=>e.dataset.host);state.custom=[];GM_setValue('ph3_sites_global',state);});
  const allOff=await create('chat.deepseek.com');assert.equal(await root(allOff).count(),0);await manage(allOff);
  await root(allOff).locator('[data-action=site-enable-current]').click();
  assert.equal(store.ph3_sites_global.custom.find(r=>r.host==='chat.deepseek.com').enabled,true);
  const active=await reload(allOff);assert.equal(await root(active).count(),1);await manage(active);
  fs.mkdirSync(path.join(dir,'artifacts'),{recursive:true});
  for(const theme of ['light','dark']){
   await root(active).locator('[data-action=settings-tab][data-key=appearance]').click();
   await root(active).locator('[name=theme]').selectOption(theme);await manage(active);
   await root(active).locator('.panel').screenshot({path:path.join(dir,'artifacts/sites-'+theme+'.png')});
  }
  await active.setViewportSize({width:390,height:700});
  await root(active).locator('.panel').screenshot({path:path.join(dir,'artifacts/sites-narrow.png')});
  assert.equal(await root(active).locator('.form-scroll').evaluate(e=>e.scrollWidth>e.clientWidth),false);
  assert.deepEqual(errors,[]);console.log('PASS all-off recovery and narrow layout; light/dark screenshots saved');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
