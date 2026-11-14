const {chromium}=require('playwright'),path=require('node:path'),{pathToFileURL}=require('node:url'),fs=require('node:fs');
(async()=>{
 const out=__dirname,url=pathToFileURL(path.join(out,'seal-layout.html')).href;
 const b=await chromium.launch({channel:'chrome',headless:true});
 for(const [name,theme,format,height] of [['seal-banner-light','light','banner',320],['seal-banner-dark','dark','banner',320],['social','dark','social',640]]){
  const p=await b.newPage({viewport:{width:1280,height},deviceScaleFactor:1});await p.goto(url+'?theme='+theme+'&format='+format);await p.locator('.seal').evaluate(i=>i.decode());await p.screenshot({path:path.join(out,name+'.png')});console.log(name,fs.statSync(path.join(out,name+'.png')).size);await p.close();
 }
 await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
