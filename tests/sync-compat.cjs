const {chromium}=require('playwright'),{setup}=require('./browser.cjs'),assert=require('node:assert/strict'),C=require('../src/core.cjs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 for(const mode of ['bare','propfind','head','wrong-file','weak','auth']){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);
  await page.evaluate(({mode,empty})=>{
   window.__compat=[];window.__uploaded=null;
   window.GM_xmlhttpRequest=options=>{
    window.__compat.push({method:options.method,match:options.headers['If-Match']});
    const version='v1-opaque';let status=200,body='',headers='';
    if(options.method==='MKCOL')status=201;
    if(options.method==='GET'){status=mode==='auth'?401:200;body=empty;headers=mode==='bare'?'ETag: '+version:mode==='weak'?'ETag: W/"weak"':'';if(options.headers['If-Match']&&options.headers['If-Match']!==version)status=412;}
    if(options.method==='PROPFIND'){
     status=207;
     const href=mode==='wrong-file'?'/dav/other.json':new URL(options.url).pathname;
     const value=mode==='weak'?'W/&quot;weak&quot;':version;
     // Include a decoy response and a failed property to prove selection is scoped.
     body=mode==='head'?'':`<d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/unrelated.json</d:href><d:propstat><d:prop><d:getetag>wrong</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response><d:response><d:href>${href}</d:href><d:propstat><d:prop><d:getetag>failed</d:getetag></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat><d:propstat><d:prop><d:getetag>${value}</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`;
    }
    if(options.method==='HEAD')headers=mode==='head'?'ETag: '+version:'';
    if(options.method==='PUT'){
     if(options.headers['If-Match']!==version)status=412;
     else {status=204;window.__uploaded=options.data;}
    }
    setTimeout(()=>options.onload({status,responseText:body,responseHeaders:headers,finalUrl:options.url}),5);
   };
   GM_setValue('ph3_sync',{username:'test@example.invalid',password:'mock-only',folder:'PromptHelper',auto:false});
  },{mode,empty:C.pack([])});
  const root=page.locator('#db-prompt-helper-root');await root.locator('.ball').click();await root.locator('[data-action=sync]').click();
  await page.waitForFunction(()=>{const m=GM_getValue('ph3_sync_meta',{});return m.lastSuccess||m.error;});
  const result=await page.evaluate(()=>({meta:GM_getValue('ph3_sync_meta'),uploaded:window.__uploaded,requests:window.__compat}));
  if(['bare','propfind','head'].includes(mode)){
   assert.ok(result.meta.lastSuccess,result.meta.error);assert.ok(C.unpack(result.uploaded).length>0);
   const put=result.requests.find(r=>r.method==='PUT');assert.equal(put.match,'v1-opaque');
   const gets=result.requests.filter(r=>r.method==='GET');assert.equal(gets.length,mode==='bare'?1:2);
   if(mode!=='bare')assert.equal(gets[1].match,'v1-opaque');
   if(mode==='propfind')assert.equal(result.requests.filter(r=>r.method==='PROPFIND').length,2);
   if(mode==='head')assert.equal(result.requests.filter(r=>r.method==='HEAD').length,2);
  }else{
   assert.match(result.meta.error,mode==='auth'?/应用密码/:/版本标记/);assert.equal(result.uploaded,null);assert.equal(result.requests.some(r=>r.method==='PUT'),false);
   if(mode==='auth')assert.equal(result.requests.some(r=>r.method==='PROPFIND'),false);
  }
  assert.deepEqual(errors,[]);console.log('PASS real userscript WebDAV adapter: '+mode);await context.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
