const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.cjs');
const value=content=>({title:'模板',content,tags:['写作'],favorite:false});
const op=(id,parents=[],content=id,at=1)=>({id,parents,entity:'prompt',key:'p',device:'test',at,value:content===null?null:value(content)});

test('shared layout preserves relative anchor across viewports without shrinking stored size',()=>{
    const value=C.layoutSnapshot({x:1300,y:900},{w:680,h:650},'up-left',1440,1000);
    const same=C.layoutAnchor(value,1440,1000);assert.ok(Math.abs(same.x-1300)<1&&Math.abs(same.y-900)<1);
    for(const [w,h] of [[390,760],[280,500],[1920,1080]]){
        const anchor=C.layoutAnchor(value,w,h),actual=C.anchoredRect(anchor,value.size,w,h,value.direction);
        assert.ok(actual.rect.x>=0&&actual.rect.y>=0&&actual.rect.x+actual.rect.w<=w&&actual.rect.y+actual.rect.h<=h);
    }
    assert.deepEqual(value.size,{w:680,h:650});
});

test('group colors survive canonical merge and backup, while legacy groups and invalid colors remain safe',()=>{
    const old={...op('g'),entity:'group',key:'g',value:{name:'工作',rank:0}};
    const colored={...old,id:'g2',parents:['g'],value:{...old.value,color:'#d65831'}};
    assert.equal(C.project(C.unpack(C.pack([old,colored]))).group[0].color,'#d65831');
    assert.equal(Object.hasOwn(C.merge([old])[0].value,'color'),false);
    assert.throws(()=>C.merge([old,{...colored,value:{...colored.value,color:'red;display:none'}}]),/颜色/);
    assert.throws(()=>C.merge([colored],[{...colored,value:{...colored.value,color:'#123456'}}]),/同编号/);
    const system={...colored,id:'builtin',key:'system-ungrouped',parents:[]};
    const result=C.project(C.unpack(C.pack([old,colored,system])));
    assert.equal(result.group.length,1);assert.equal(result.ungroupedColor,'#d65831');
});
test('collapse checkbox migration preserves old choices and permits every combination',()=>{
    assert.deepEqual(C.collapseModes({}),{button:true,outside:false,double:false});
    assert.deepEqual(C.collapseModes({collapse:'outside'}),{button:true,outside:true,double:false});
    assert.deepEqual(C.collapseModes({collapse:'double'}),{button:true,outside:false,double:true});
    for(let bits=0;bits<8;bits++){
        const modes={button:!!(bits&1),outside:!!(bits&2),double:!!(bits&4)};assert.deepEqual(C.collapseModes({collapse:'double',collapseModes:modes}),modes);
    }
});
test('eight resize directions move only their named edges and pin the opposite edges',()=>{
    const initial={x:400,y:300,w:600,h:500};
    for(const edge of ['n','s','w','e','nw','ne','sw','se']){
        const result=C.resizeRect(initial,edge,40,30,1440,1000);
        assert.equal(result.x,edge.includes('w')?440:400);assert.equal(result.y,edge.includes('n')?330:300);
        assert.equal(result.x+result.w,edge.includes('e')?1040:1000);assert.equal(result.y+result.h,edge.includes('s')?830:800);
    }
});
test('all resize directions respect viewport and minimum size even past the opposite corner',()=>{
    for(const edge of ['n','s','w','e','nw','ne','sw','se'])for(const delta of [-10000,10000]){
        const result=C.resizeRect({x:400,y:300,w:600,h:500},edge,delta,delta,1440,1000);
        assert.ok(result.w>=340&&result.h>=320&&result.x>=12&&result.y>=12&&result.x+result.w<=1428&&result.y+result.h<=988);
    }
});
test('launcher selects all four quadrants and aligns corresponding edges',()=>{
    for(const [position,direction] of [[{x:1300,y:900},'up-left'],[{x:20,y:900},'up-right'],[{x:1300,y:20},'down-left'],[{x:20,y:20},'down-right']]){
        const r=C.anchoredRect(position,{w:680,h:650},1440,1000);assert.equal(r.direction,direction);
        const b=C.launcherFromRect(r.rect,r.direction,1440,1000);assert.deepEqual(b,r.ball);
        assert.ok(r.rect.x>=0&&r.rect.y>=0&&r.rect.x+r.rect.w<=1440&&r.rect.y+r.rect.h<=1000);
    }
});
test('left-up is the default when all directions fit; largest available space wins otherwise',()=>{
    assert.equal(C.anchoredRect({x:900,y:800},{w:340,h:320},2000,1800).direction,'up-left');
    for(const [w,h] of [[1440,1000],[390,640],[280,260],[80,80]]){
        const r=C.anchoredRect({x:w/2,y:h/2},{w:680,h:650},w,h);
        assert.deepEqual(C.launcherFromRect(r.rect,r.direction,w,h),r.ball);
        assert.ok(r.rect.x>=0&&r.rect.y>=0&&r.rect.x+r.rect.w<=w&&r.rect.y+r.rect.h<=h);
    }
});
test('moving the panel moves its hidden launcher and reopening keeps the same rectangle',()=>{
    for(const direction of ['up-left','up-right','down-left','down-right']){
        const rect={x:400,y:330,w:500,h:400},ball=C.launcherFromRect(rect,direction,1440,1000);
        const reopened=C.anchoredRect(ball,rect,1440,1000,direction);
        assert.deepEqual(reopened.rect,rect);
    }
});
test('simultaneous edits remain two heads regardless of merge order',()=>{
    const root=op('root'),a=op('a',['root'],'A',3),b=op('b',['root'],'B',2);
    const first=C.merge([root,a],[root,b]),second=C.merge([root,b],[root,a]);
    assert.deepEqual(first,second);assert.equal(C.project(first).prompt.length,2);assert.ok(C.project(first).prompt.every(p=>p.conflict));
    assert.equal(C.project(C.merge(first,[op('resolve',['a','b'],'kept',4)])).prompt.length,1);
});
test('stale device cannot revive deleted record; concurrent edit stays visible as conflict',()=>{
    const root=op('root'),del=op('delete',['root'],null,2);
    assert.equal(C.project(C.merge([root,del],[root])).prompt.length,0);
    const state=C.project(C.merge([root,del],[root,op('edit',['root'],'new',2)]));
    assert.equal(state.prompt[0].deletedConflict,true);
    const restored=C.project(C.merge([root,del],[op('undo',['delete'],'restored',3)]));assert.equal(restored.prompt[0].content,'restored');
});
test('malformed histories, collisions and loops are rejected before writes',()=>{
    assert.throws(()=>C.merge([op('x')],[op('x',[],'different')]),/同编号/);
    assert.throws(()=>C.validate([op('a',['missing'])]),/缺少/);
    assert.throws(()=>C.validate([op('a',['b']),op('b',['a'])]),/循环/);
    assert.throws(()=>C.validate([{...op('a'),value:{content:42}}]),/格式/);
    assert.throws(()=>C.unpack('{"version":2}'),/版本/);
});
test('JSON roundtrip preserves tombstones, groups and Unicode without exporting credentials',()=>{
    const group={id:'g',key:'g',entity:'group',at:1,parents:[],device:'test',value:{name:'创作',rank:0}};
    const input=[op('root',[],'你好 👋 {{主题}}'),op('delete',['root'],null,2),group];
    assert.deepEqual(C.merge(input),C.unpack(C.pack(input)));assert.ok(!C.pack(input).includes('password'));
});
test('legacy TXT and duplicate variables remain intact',()=>{
    const text='--- 提示词 1 ---\r\n[标签]：写作，工作\r\n[内容]：\r\n你好\u200c主题\u200d\r\n\r\n=========================================';
    assert.equal(C.parseLegacy(text)[0].content,'你好{{主题}}');
    assert.deepEqual(C.variables('{{主题}} {{主题}} {{角色}}'),['主题','角色']);
    assert.equal(C.fill('{{主题}} / {{主题}}',{'主题':'$& <script>'}),'$& <script> / $& <script>');
});
test('search matches all words across title content and tags',()=>{
    const p={title:'周报',content:'整理任务进展',tags:['工作'],favorite:true};
    assert.equal(C.filter([p],'周报 工作',null,true).length,1);assert.equal(C.filter([p],'不存在',null,false).length,0);assert.equal(C.filter([p],'',['绘画'],false).length,0);
});
test('window bounds hold even when viewport is smaller than minimum size',()=>{
    for(const [w,h] of [[1920,1080],[390,640],[280,180],[80,80]]){
        const r=C.clampRect({x:10000,y:-500,w:5000,h:6000},w,h);assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=w&&r.y+r.h<=h);
    }
});
test('CAS retries conflicting upload, merging the newly arrived edit',async()=>{
    const root=op('root'),a=op('a',['root'],'A'),b=op('b',['root'],'B');let local=[root,a],remote=[root],revision=1,puts=0;
    await C.syncCAS({readLocal:()=>local,ingest:r=>local=C.merge(local,r),request:async(method,data,headers)=>{
        if(method==='GET')return {status:200,responseText:C.pack(remote),responseHeaders:`ETag: "${revision}"\r\n`};
        puts++;if(puts===1){remote=[root,b];revision++;return {status:412};}
        assert.equal(headers['If-Match'],'"2"');remote=C.unpack(data);return {status:204};
    }});
    assert.equal(puts,2);assert.equal(C.project(remote).prompt.length,2);
});
test('CAS requires strong version marker and preserves local data on auth failure',async()=>{
    const local=[op('a')];let wrote=false;
    await assert.rejects(C.syncCAS({readLocal:()=>local,ingest:()=>{},request:async(method)=>{if(method==='PUT')wrote=true;return {status:200,responseText:C.pack([]),responseHeaders:'ETag: W/"x"'};}}),/版本标记/);
    assert.equal(wrote,false);
    await assert.rejects(C.syncCAS({readLocal:()=>local,ingest:()=>{},request:async()=>({status:401})}),/应用密码/);assert.equal(local.length,1);
});
test('first upload uses create-only condition and empty local store never erases remote',async()=>{
    let local=[],remote=[op('cloud')],put=false;
    await C.syncCAS({readLocal:()=>local,ingest:r=>local=C.merge(local,r),request:async method=>{if(method==='PUT')put=true;return {status:200,responseText:C.pack(remote),responseHeaders:'ETag: "1"'};}});
    assert.equal(put,false);assert.equal(local.length,1);
    await C.syncCAS({readLocal:()=>local,ingest:()=>{},request:async(method,data,headers)=>{if(method==='GET')return {status:404};assert.equal(headers['If-None-Match'],'*');return {status:201};}});
});
