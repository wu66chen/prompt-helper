const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.cjs');
const op=id=>({id,entity:'group',key:id,parents:[],device:'test',at:1,value:{name:id,rank:0}});

test('Jianguoyun bare ETag is opt-in and transmitted verbatim on conditional PUT',async()=>{
 const raw='c3expXAHSVpSwevAnmJDJA';let sent=false;
 assert.equal(C.etag('ETag: '+raw),null);
 await C.syncCAS({allowBareETag:true,readLocal:()=>[op('local')],ingest:()=>{},request:async(method,data,headers)=>{
   if(method==='GET')return {status:200,responseText:C.pack([]),responseHeaders:'ETag: '+raw+'\r\n'};
   sent=true;assert.equal(headers['If-Match'],raw);return {status:204};
 }});assert.equal(sent,true);
});

test('missing GET ETag uses metadata but rereads matching contents before uploading',async()=>{
 let local=[op('local')],remote=[],gets=0,reads=0,uploaded;
 await C.syncCAS({allowBareETag:true,readLocal:()=>local,ingest:r=>local=C.merge(local,r),readRevision:async()=>{reads++;remote=[op('newer')];return 'version-2';},request:async(method,data,headers)=>{
  if(method==='GET'){gets++;if(gets===2)assert.equal(headers['If-Match'],'version-2');return {status:200,responseText:C.pack(remote),responseHeaders:''};}
  assert.equal(headers['If-Match'],'version-2');uploaded=C.unpack(data);return {status:204};
 }});
 assert.equal(gets,2);assert.equal(reads,2);assert.deepEqual(C.project(uploaded).group.map(g=>g.name).sort(),['local','newer']);
});

test('metadata changes while rereading: retry instead of pairing an old body with a new version',async()=>{
 let local=[op('local')],remote=[],rev=1,reads=0,gets=0,puts=0;
 await C.syncCAS({allowBareETag:true,readLocal:()=>local,ingest:r=>local=C.merge(local,r),readRevision:async()=>{reads++;if(reads===2){rev=2;remote=[op('concurrent')];}return 'v'+rev;},request:async(method,data,headers)=>{
  if(method==='GET'){gets++;return {status:200,responseText:C.pack(remote),responseHeaders:''};}
  puts++;assert.equal(headers['If-Match'],'v2');assert.equal(C.project(C.unpack(data)).group.length,2);return {status:204};
 }});assert.equal(puts,1);assert.equal(gets,4);
});

test('weak, missing, duplicate and malformed ETags never become unconditional writes',async()=>{
 for(const header of ['', 'ETag: W/"weak"', 'ETag: *','ETag: a,b','ETag: "a"\r\nETag: "b"','ETag: \r\nServer: example']){
  let put=false;
  await assert.rejects(C.syncCAS({allowBareETag:true,readLocal:()=>[op('local')],ingest:()=>{},readRevision:async()=>null,request:async method=>{
   if(method==='PUT')put=true;return {status:200,responseText:C.pack([]),responseHeaders:header};
  }}),/版本标记/);assert.equal(put,false,header);
 }
});

test('Jianguoyun 412 still retries with the newest raw version and preserves concurrent operations',async()=>{
 let local=[op('local')],remote=[],rev=1,puts=0;
 await C.syncCAS({allowBareETag:true,readLocal:()=>local,ingest:r=>local=C.merge(local,r),request:async(method,data,headers)=>{
  if(method==='GET')return {status:200,responseText:C.pack(remote),responseHeaders:'etag: v'+rev};
  puts++;if(puts===1){remote=[op('other')];rev++;return {status:412};}
  assert.equal(headers['If-Match'],'v2');assert.equal(C.project(C.unpack(data)).group.length,2);return {status:204};
 }});assert.equal(puts,2);
});
