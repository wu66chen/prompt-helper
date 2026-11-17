const test=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core.cjs');
const op=(id,entity,key,value,parents=[],at=1)=>({id,entity,key,value,parents,at,device:id});
const draft={form:{mode:'edit',draftId:'draft',key:'prompt',base:[],title:'草稿',content:'{{参数}}',tags:'',initial:'[]'},site:'example.com',at:1};
test('portable preferences merge independently, reject credentials and unsafe image data',()=>{
 const a=op('a','preference','theme',{name:'theme',data:'dark'}),b=op('b','preference','libraryLayout',{name:'libraryLayout',data:'titles'});
 assert.equal(C.project(C.merge([a],[b])).preference.length,2);assert.deepEqual(C.unpack(C.pack([a,b])),C.merge([a,b]));
 assert.throws(()=>C.pack([op('bad','preference','password',{name:'password',data:'secret'})]));
 assert.throws(()=>C.pack([op('bad','preference','launcherIcon',{name:'launcherIcon',data:'https://example.com/tracker.png'})]));
 assert.throws(()=>C.pack([op('bad','preference','launcherIcon',{name:'launcherIcon',data:'data:image/svg+xml,<svg/>'})]));
});
test('concurrent drafts survive; deletion cannot erase an unseen edit or revive an old draft',()=>{
 const base=op('base','draft','draft',draft),a=op('a','draft','draft',{...draft,form:{...draft.form,content:'A'}},['base'],2),b=op('b','draft','draft',{...draft,form:{...draft.form,content:'B'}},['base'],2);
 let history=C.merge([base,a],[base,b]);assert.equal(C.project(history).draft.length,2);
 const del=op('del','draft','draft',null,['a'],3);history=C.merge(history,[del]);assert.equal(C.project(history).draft.length,1);assert.equal(C.project(history).draft[0].form.content,'B');
 assert.equal(C.project(C.merge(history,[base,a])).draft.length,1);
 const safe=C.pack([op('safe','draft','draft',{...draft,password:'secret',form:{...draft.form,password:'secret'}})]);assert.ok(!safe.includes('secret'));
});
test('v3, v4 and v5 imports still work while v6 identifies font preferences',()=>{
 for(const version of [3,4,5])assert.deepEqual(C.unpack(JSON.stringify({format:C.FORMAT,version,operations:[]})),[]);
 assert.equal(JSON.parse(C.pack([])).version,6);
});
test('font size roundtrips only within the supported integer range',()=>{
 for(const size of [12,14,20]){
  const value=op('font-'+size,'preference','fontSize',{name:'fontSize',data:size});
  assert.equal(C.project(C.unpack(C.pack([value]))).preference[0].data,size);
 }
 for(const size of [11,21,14.5,'14',null])assert.throws(()=>C.pack([op('bad','preference','fontSize',{name:'fontSize',data:size})]));
});
test('userscript manager icon embeds the actual seal PNG',()=>{
 const fs=require('node:fs'),path=require('node:path'),script=fs.readFileSync(path.join(__dirname,'../prompt-helper.user.js'),'utf8');
 const icon=script.match(/^\/\/ @icon\s+data:image\/png;base64,(.+)$/m);assert.ok(icon);
 assert.deepEqual(Buffer.from(icon[1],'base64'),fs.readFileSync(path.join(__dirname,'../src/launcher.png')));
});
