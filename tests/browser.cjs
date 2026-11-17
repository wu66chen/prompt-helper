const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'..'),script=fs.readFileSync(path.join(dir,'prompt-helper.user.js'),'utf8');
fs.mkdirSync(path.join(dir,'artifacts'),{recursive:true});
const seed=[
    {id:'demo-1',content:'你是一位资深编辑。请将以下内容改写得清晰、自然，保留原意与细节。\n\n内容：{{原文}}\n目标读者：{{读者}}\n\n请先给出改写版本，再简要说明修改理由。',tags:['写作','润色']},
    {id:'demo-2',content:'请将这份会议记录整理成行动清单，包含任务、负责人和截止日期。\n\n会议记录：{{会议记录}}\n\n缺少的信息请标注“待确认”，不要自行补全。',tags:['工作','会议']},
    {id:'demo-3',content:'请审查以下代码，重点关注边界情况、错误处理和可维护性。\n\n{{代码}}\n\n按影响程度列出问题，并给出最小修改建议。',tags:['编程']}
];
async function setup(page){
    await page.route('http://127.0.0.1:4177/**',r=>r.fulfill({contentType:'text/html',body:'<!DOCTYPE html><html lang="zh-CN"><meta charset="utf-8"><title>提示词助手 · 本地验证</title><style>body{margin:0;background:#e9edf3;color:#838b99;font:14px "Segoe UI",sans-serif}main{max-width:700px;margin:15vh auto;padding:40px}h1{font-size:24px;font-weight:500}textarea{padding:16px;width:90%;height:70px;border:1px solid #d4dae3;background:#f8fafc;border-radius:16px;font:inherit}</style><main><h1>提示词助手 · 本地测试页面</h1><p>这里模拟 AI 网站背景，用于检查脚本的窗口、样式隔离和交互。</p><textarea placeholder="宿主网页的输入框"></textarea></main></html>'}));
    await page.addInitScript(({seed})=>{
        const original=Element.prototype.attachShadow;
        Element.prototype.attachShadow=function(options){return original.call(this,{...options,mode:'open'});}; // test-only inspection
        if(!localStorage.getItem('gm:db_prompts_data'))localStorage.setItem('gm:db_prompts_data',JSON.stringify(seed));
        const listeners=new Map(),channel=new BroadcastChannel('gm-test');
        window.GM_getValue=(k,f)=>{const s=localStorage.getItem('gm:'+k);return s===null?f:JSON.parse(s);};
        window.GM_setValue=(k,v)=>{const old=GM_getValue(k);localStorage.setItem('gm:'+k,JSON.stringify(v));(listeners.get(k)||[]).forEach(fn=>fn(k,old,v,false));channel.postMessage({k,old,v});};
        window.GM_deleteValue=k=>localStorage.removeItem('gm:'+k);
        if(!localStorage.getItem('gm:ph3_sites_global'))GM_setValue('ph3_sites_global',{custom:[{host:'127.0.0.1',enabled:true}]});
        window.GM_listValues=()=>Object.keys(localStorage).filter(k=>k.startsWith('gm:')).map(k=>k.slice(3));
        window.GM_addValueChangeListener=(k,fn)=>{listeners.set(k,[...(listeners.get(k)||[]),fn]);};
        channel.onmessage=e=>{const {k,old,v}=e.data;(listeners.get(k)||[]).forEach(fn=>fn(k,old,v,true));};
        window.GM_registerMenuCommand=()=>{};
        window.GM_setClipboard=(text,_type,callback)=>{window.__clipboard=text;callback();};
        window.__requests=[];
        window.GM_xmlhttpRequest=options=>{
            window.__requests.push({method:options.method,url:options.url,headers:options.headers});
            setTimeout(()=>{
                if(window.__networkFail){options.onerror();return;}
                if(window.__authFail){options.onload({status:401,responseText:'',responseHeaders:'',finalUrl:options.url});return;}
                let status=200,body='',headers='';
                if(options.method==='PROPFIND')status=207;
                if(options.method==='MKCOL')status=201;
                if(options.method==='GET'){
                    body=localStorage.getItem('mock-cloud')||'';status=body?200:404;headers='ETag: "'+(localStorage.getItem('mock-etag')||'0')+'"\r\n';
                }
                if(options.method==='PUT'){
                    const rev=localStorage.getItem('mock-etag')||'0',existing=localStorage.getItem('mock-cloud');
                    if((options.headers['If-None-Match']==='*'&&existing)||(options.headers['If-Match']&&options.headers['If-Match']!=='"'+rev+'"'))status=412;
                    else{localStorage.setItem('mock-cloud',options.data);localStorage.setItem('mock-etag',String(Number(rev)+1));status=201;}
                }
                options.onload({status,responseText:body,responseHeaders:headers,finalUrl:options.url});
            },20);
        };
    },{seed});
    await page.goto('http://127.0.0.1:4177/');
    await page.evaluate(script);
}
module.exports={setup};
if(require.main===module)(async()=>{
    const browser=await chromium.launch({channel:'chrome',headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const root=page.locator('#db-prompt-helper-root');
    await setup(page);await root.locator('[data-action=open]').click();
    assert.equal(await root.locator('.prompt').count(),3);console.log('PASS legacy migration');
    await root.locator('.search-input').fill('边界 编程');await page.waitForTimeout(150);assert.equal(await root.locator('.prompt').count(),1);
    await root.locator('.search-input').fill('');await page.waitForTimeout(150);
    await root.locator('.prompt').filter({hasText:'资深编辑'}).locator('[data-action=use]').click();
    await root.locator('[name=variable-0]').fill('需要润色的原文');await root.locator('[name=variable-1]').fill('团队同事');await root.locator('[data-action=copy-output]').click();
    assert.match(await page.evaluate(()=>window.__clipboard),/需要润色的原文/);assert.match(await page.evaluate(()=>window.__clipboard),/团队同事/);
    await root.locator('[data-action=back]').click();await root.locator('[data-action=dialog-cancel]').click();
    await root.locator('[data-action=new]').click();await root.locator('[name=title]').fill('新提示词');await root.locator('[name=content]').fill('为{{主题}}列出三种可行方案。');await root.locator('[name=tags]').fill('工作,规划');
    await root.locator('[data-action=collapse]').click();await root.locator('[data-action=open]').click();assert.equal(await root.locator('[name=content]').inputValue(),'为{{主题}}列出三种可行方案。');
    await root.locator('[data-action=save-prompt]').click();assert.equal(await root.locator('.prompt').count(),4);console.log('PASS full-text search, variable fill, copy and draft preservation');
    const newCard=root.locator('.prompt').filter({hasText:'新提示词'});
    await newCard.locator('[data-action=favorite]').click();await root.locator('[data-kind=favorite]').click();assert.equal(await root.locator('.prompt').count(),1);await root.locator('[data-kind=all]').click();
    await newCard.locator('[data-action=delete]').click();await root.locator('[data-action=dialog-confirm]').click();assert.equal(await root.locator('.prompt').count(),3);await root.locator('.toast button').click();assert.equal(await root.locator('.prompt').count(),4);console.log('PASS favorite, delete and undo');
    await root.locator('[data-action=groups]').click();await root.locator('[name=group-name]').fill('创作');await root.locator('[data-form=new-group] button').click();
    const writeTag=root.locator('.manage-tag').filter({hasText:'写作'});await writeTag.locator('select').selectOption({label:'创作'});
    await root.locator('[name=group-name]').fill('工作');await root.locator('[data-form=new-group] button').click();
    await root.locator('.manage-tag').filter({hasText:'会议'}).locator('select').selectOption({label:'工作'});
    await root.locator('.manage-tag').filter({hasText:'规划'}).locator('[data-action=rename-tag]').click();await root.locator('[name=new-name]').fill('计划');await root.locator('[data-action=dialog-confirm]').click();
    await root.locator('[name=tag-name]').fill('规划');await root.locator('[data-form=new-tag] button').click();
    assert.equal(await root.locator('.tag-name').filter({hasText:/^计划$/}).count(),1);assert.equal(await root.locator('.tag-name').filter({hasText:/^规划$/}).count(),1);
    await root.locator('[data-action=back]').click();console.log('PASS grouping');
    await root.locator('[data-action=settings]').click();await root.locator('[name=collapse][value=outside]').check();await page.mouse.click(40,40);assert.equal(await root.locator('.panel').isVisible(),false);
    await root.locator('[data-action=open]').click();await root.locator('[name=collapse][value=outside]').uncheck();await root.locator('[name=collapse][value=double]').check();await root.locator('.brand').dblclick();assert.equal(await root.locator('.panel').isVisible(),false);
    await root.locator('[data-action=open]').click();await root.locator('[name=collapse][value=double]').uncheck();await root.locator('[name=collapse][value=button]').check();await page.mouse.click(40,40);assert.equal(await root.locator('.panel').isVisible(),true);await root.locator('.brand').dblclick();assert.equal(await root.locator('.panel').isVisible(),true);console.log('PASS independent collapse modes');
    await root.locator('[data-action=settings-tab][data-key=sync]').click();await root.locator('[name=dav-username]').fill('test@example.invalid');await root.locator('[name=dav-password]').fill('test-only-app-password');await root.locator('[data-action=test-sync]').click();await page.waitForTimeout(100);assert.equal(await root.locator('[name=dav-username]').inputValue(),'test@example.invalid');
    await root.locator('[data-action=save-sync]').click();await root.locator('.content [data-action=sync]').click();await page.waitForTimeout(250);
    const cloud=await page.evaluate(()=>localStorage.getItem('mock-cloud'));assert.ok(cloud);assert.ok(!cloud.includes('test-only-app-password'));assert.equal(JSON.parse(cloud).format,'prompt-helper');
    await page.evaluate(()=>window.__networkFail=true);await root.locator('.content [data-action=sync]').click();await page.waitForTimeout(150);assert.match(await root.locator('.statusbar').innerText(),/无法连接/);await page.evaluate(()=>window.__networkFail=false);await root.locator('.content [data-action=sync]').click();await page.waitForTimeout(200);assert.doesNotMatch(await root.locator('.statusbar').innerText(),/无法连接/);console.log('PASS WebDAV config, simulated CAS upload, credentials excluded, offline recovery');
    await root.locator('[data-action=filter][data-kind=all]').click();
    const second=await context.newPage();await setup(second);const r2=second.locator('#db-prompt-helper-root');await r2.locator('[data-action=open]').click();await r2.locator('[data-action=new]').click();await r2.locator('[name=content]').fill('来自另一标签页的内容');await r2.locator('[data-action=save-prompt]').click();await page.waitForTimeout(150);assert.equal(await root.locator('.prompt').count(),5);console.log('PASS cross-tab update');
    await root.locator('.prompt').filter({hasText:'来自另一标签页'}).locator('[data-action=edit]').click();
    await r2.locator('.prompt').filter({hasText:'来自另一标签页'}).locator('[data-action=edit]').click();
    await root.locator('[name=content]').fill('设备 A 的同时修改');await r2.locator('[name=content]').fill('设备 B 的同时修改');
    await root.locator('[data-action=save-prompt]').click();await r2.locator('[data-action=save-prompt]').click();await page.waitForTimeout(150);
    assert.equal(await root.locator('.conflict').count(),2);
    await root.locator('.prompt').filter({hasText:'设备 A 的同时修改'}).locator('[data-action=resolve]').click();await root.locator('[data-action=dialog-confirm]').click();await r2.locator('.conflict').first().waitFor({state:'hidden',timeout:5000});assert.equal(await r2.locator('.conflict').count(),0);assert.equal(await root.locator('.prompt').count(),5);
    console.log('PASS concurrent edit conflict UI and resolution');await second.close();
    await root.locator('[data-action=settings]').click();await root.locator('[data-action=settings-tab][data-key=backup]').click();
    const downloaded=page.waitForEvent('download');await root.locator('[data-action=export-json]').click();const download=await downloaded;const exportPath=path.join(dir,'artifacts/test-backup.json');await download.saveAs(exportPath);
    const exported=fs.readFileSync(exportPath,'utf8');assert.ok(!exported.includes('test-only-app-password'));assert.ok(!exported.includes('test@example.invalid'));
    await root.locator('.import-file').setInputFiles({name:'legacy.txt',mimeType:'text/plain',buffer:Buffer.from('--- 提示词 1 ---\n[标签]：迁移\n[内容]：\n导入测试 {{变量}}\n\n=========================================')});await root.locator('[data-action=dialog-confirm]').click();await root.locator('[data-action=filter][data-kind=all]').click();assert.equal(await root.locator('.prompt').count(),6);
    assert.ok(await page.evaluate(()=>!!GM_getValue('ph3_before_import')));
    console.log('PASS JSON export excludes credentials, legacy import preserves backup');
    // Exercise actual pointer capture and geometry; a drag of the ball must not open the panel.
    await root.locator('[data-action=collapse]').click();let ballBox=await root.locator('.ball').boundingBox();await page.mouse.move(ballBox.x+24,ballBox.y+24);await page.mouse.down();await page.mouse.move(80,110,{steps:5});await page.mouse.up();assert.equal(await root.locator('.panel').isVisible(),false);await root.locator('.ball').click();
    let barBox=await root.locator('.brand').boundingBox();await page.mouse.move(barBox.x+20,barBox.y+10);await page.mouse.down();await page.mouse.move(100,100,{steps:6});await page.mouse.up();
    let handleBox=await root.locator('.resize').boundingBox();await page.mouse.move(handleBox.x+10,handleBox.y+10);await page.mouse.down();await page.mouse.move(1439,999,{steps:6});await page.mouse.up();let draggedBox=await root.locator('.panel').boundingBox();assert.ok(draggedBox.x+draggedBox.width<=1440&&draggedBox.y+draggedBox.height<=1000);
    console.log('PASS draggable ball, panel move and resize boundary');
    await page.evaluate(()=>{GM_deleteValue('ph3_settings_global');GM_deleteValue('ph3_settings_127.0.0.1');GM_setValue('db_theme_mode_127.0.0.1','dark');});await page.reload();await page.evaluate(script);await root.locator('[data-action=open]').click();assert.equal(await root.getAttribute('data-theme'),'dark');console.log('PASS per-site legacy theme survives global migration');
    await root.locator('[data-action=settings]').click();await root.locator('[data-action=settings-tab][data-key=appearance]').click();await root.locator('[name=theme]').selectOption('light');await root.locator('[data-action=back]').click();
    // Restore the intended default composition after the pointer stress test.
    await root.locator('[data-action=settings]').click();await root.locator('[data-action=reset-window]').click();await root.locator('[data-action=back]').click();
    // Hide transient feedback before capturing the final layout.
    await page.evaluate(()=>document.querySelector('#db-prompt-helper-root').shadowRoot.querySelector('.toast').hidden=true);
    await page.screenshot({path:path.join(dir,'artifacts/desktop-light.png')});
    await root.locator('[data-action=settings]').click();await root.locator('[name=theme]').selectOption('dark');await root.locator('[data-action=back]').click();await page.screenshot({path:path.join(dir,'artifacts/desktop-dark.png')});
    await root.locator('[data-action=maximize]').click();await page.setViewportSize({width:390,height:640});
    await page.waitForFunction(()=>{const r=document.querySelector('#db-prompt-helper-root').shadowRoot.querySelector('.panel').getBoundingClientRect();return r.right<=innerWidth&&r.bottom<=innerHeight;});
    const box=await root.locator('.panel').boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=391&&box.y+box.height<=641);
    await page.screenshot({path:path.join(dir,'artifacts/narrow-dark.png')});
    await root.locator('[data-action=settings]').click();await root.locator('[data-action=settings-tab][data-key=sync]').click();const contentBox=await root.locator('.content').boundingBox();assert.ok(contentBox.width<=390);
    await page.screenshot({path:path.join(dir,'artifacts/narrow-settings.png')});
    await page.setViewportSize({width:280,height:260});await page.waitForFunction(()=>{const r=document.querySelector('#db-prompt-helper-root').shadowRoot.querySelector('.panel').getBoundingClientRect();return r.right<=innerWidth&&r.bottom<=innerHeight;});const tiny=await root.locator('.panel').boundingBox();assert.ok(tiny.x+tiny.width<=281&&tiny.y+tiny.height<=261);console.log('PASS light/dark and viewport constraints 1440, 390, 280');
    assert.deepEqual(errors,[]);console.log('PASS no browser runtime errors');
    await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
