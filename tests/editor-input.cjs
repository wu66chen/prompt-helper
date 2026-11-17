const {chromium}=require('playwright'),{setup}=require('./browser.cjs'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']}),page=await context.newPage();
  await page.addInitScript(()=>{for(const type of ['keydown','paste'])window.addEventListener(type,e=>{if(window.__captureWindow&&e.target.id==='db-prompt-helper-root')document.getElementById('chat-composer')?.focus();},true);});
  await setup(page);
  const root=page.locator('#db-prompt-helper-root');await root.locator('.ball').click();await root.locator('[data-action=new]').click();
  const input=root.locator('[name=content]');
  // Chat sites commonly focus their composer on typing outside recognised inputs.
  // Across Shadow DOM their event target is the host, not the inner textarea.
  await page.evaluate(()=>{const chat=document.createElement('textarea');chat.id='chat-composer';document.body.append(chat);window.__hostEvents=0;window.__installHost=(capture)=>{window.__hostAbort?.abort();const controller=window.__hostAbort=new AbortController();for(const type of ['keydown','paste'])document.addEventListener(type,e=>{if(!e.target.matches('input,textarea,[contenteditable=true]')){window.__hostEvents++;chat.focus();}}, {capture,signal:controller.signal});};});
  for(const capture of [false,true,'window']){
   await page.evaluate(c=>{window.__captureWindow=c==='window';window.__installHost(c===true);},capture);await input.fill('');await input.focus();await page.keyboard.type('abc');
   assert.equal(await input.inputValue(),'abc',`typing stays in helper with host capture=${capture}`);
   assert.equal(await page.locator('#chat-composer').inputValue(),'');
   await page.evaluate(()=>navigator.clipboard.writeText('粘贴 {{输出比例}}'));
   await page.keyboard.press('Control+V');assert.equal(await input.inputValue(),'abc粘贴 {{输出比例}}');
   assert.equal(await input.evaluate(e=>e.getRootNode().activeElement===e),true);
  }
  await page.locator('#chat-composer').evaluate(e=>e.style.cssText='position:fixed;left:0;top:0;width:100px;height:40px');
  await page.locator('#chat-composer').click();await page.keyboard.type('outside');assert.equal(await page.locator('#chat-composer').inputValue(),'outside');
  await input.focus();await page.keyboard.press('Control+Enter');assert.equal(await root.locator('.prompt').filter({hasText:'abc粘贴'}).count(),1);
  console.log('PASS typing/paste with host bubble and capture shortcuts; explicit outside focus and helper save shortcut');
  // Exercise native IME with document-level host interception; changing focus in
  // a pre-existing window listener would itself commit the browser composition.
  await page.evaluate(()=>{window.__captureWindow=false;window.__installHost(true);});
  await root.locator('[data-action=new]').click();
  const text='图片 {{输出比例}}，另一处 {{输出比例}}。\n<script>纯文本</script>\n'+('长行测试 abc 中文 😀 '.repeat(12)+'{{变量}}\n').repeat(15)+'结尾\n';
  await input.fill(text);assert.equal(await root.locator('.editor-variable').first().textContent(),'{{输出比例}}');
  assert.equal(await root.locator('.variable-mirror script').count(),0);
  assert.equal(await root.locator('.editor-variable').count(),17);
  await input.evaluate(e=>{e.scrollTop=150;e.dispatchEvent(new Event('scroll'));});
  assert.equal(await root.locator('.variable-mirror').evaluate(e=>e.scrollTop),await input.evaluate(e=>e.scrollTop));
  await input.fill('开始 ');await input.focus();await page.keyboard.press('End');
  const cdp=await context.newCDPSession(page);await cdp.send('Input.imeSetComposition',{text:'中文',selectionStart:2,selectionEnd:2});
  await input.evaluate(e=>e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:229,isComposing:true,bubbles:true,composed:true})));
  assert.equal(await input.count(),1);await cdp.send('Input.insertText',{text:'中文'});assert.equal(await input.inputValue(),'开始 中文');
  await page.keyboard.type(' {{尺寸}}');assert.equal(await root.locator('.editor-variable').textContent(),'{{尺寸}}');
  await page.keyboard.press('Control+A');await page.keyboard.press('Control+C');assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),await input.inputValue());
  await page.keyboard.press('End');await page.keyboard.type('x');await page.keyboard.press('Control+Z');assert.ok(!(await input.inputValue()).endsWith('x'));
  fs.mkdirSync(path.join(__dirname,'../artifacts/editor'),{recursive:true});
  for(const [theme,width] of [['light',1100],['dark',390]]){
   await page.evaluate(theme=>GM_setValue('ph3_settings_global',{...GM_getValue('ph3_settings_global'),theme}),theme);
   // Apply via the normal UI to exercise theme changes without replacing the draft.
   await root.locator('[data-action=settings]').click();await root.locator('[data-action=dialog-confirm]').click();await root.locator('[name=theme]').selectOption(theme);await root.locator('[data-action=drafts]').click();
   await root.locator('[data-action=restore-draft]').first().click();await page.setViewportSize({width,height:850});
   await input.fill('基于我上传的图片，输出 {{输出比例}} 的图片。\n保持区域外内容不变。\n\n数量：{{图片数量}}\n风格：{{风格}}');
   await root.locator('.panel').screenshot({path:path.join(__dirname,'../artifacts/editor/'+theme+'.png')});
   const colors=await root.locator('.editor-variable').first().evaluate(e=>({actual:getComputedStyle(e).color,expected:getComputedStyle(e.getRootNode().host).getPropertyValue('--danger').trim()}));assert.ok(colors.actual.startsWith('rgb'));
  }
  console.log('PASS complete red variable spans, escaping, scrolling, native IME/copy/undo and light/dark narrow rendering');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
