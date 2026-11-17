// Portable preferences are allowlisted operation records. Credentials never enter this path.
function publishPreference(name,data,at){
    if(!portableReady)return;
    refresh();const current=state.preference.find(p=>p.key===name);
    if(current&&JSON.stringify(current.data)===JSON.stringify(data))return;
    const op=makeOp('preference',name,{name,data});if(at!==undefined)op.at=at;
    // Local state is already applied by the caller. Reapplying a layout here would
    // clear the maximize/restore rectangle during the same pointer operation.
    const previous=portableApplied.get(name);portableApplied.set(name,op.id);
    try{writeOperations([op]);}catch(error){portableApplied.set(name,previous);throw error;}
}
function applyPortable(){
    if(!portableReady)return;
    const next={...GM_getValue(SETTINGS_KEY,settings)};let changed=false,layout;
    for(const p of state.preference){
        if(portableApplied.get(p.key)===p.revision)continue;
        portableApplied.set(p.key,p.revision);
        if(p.key==='sites'){GM_setValue(SITES_KEY,SiteRules.normalize(p.data,DEFAULT_SITES));continue;}
        if(p.key==='layout'){layout=p.data;GM_setValue(LAYOUT_KEY,layout);continue;}
        if(p.key==='autoSync'){
            const config=GM_getValue(PREFIX+'sync',{});if(config.username)GM_setValue(PREFIX+'sync',{...config,auto:p.data});continue;
        }
        next[p.key]=p.data;changed=true;
    }
    if(changed){GM_setValue(SETTINGS_KEY,next);receiveSettings(next);}
    if(layout)applySharedLayout(layout);
    if(view==='drafts')renderDrafts();
}
function publishDraft(value,parents){
    refresh();const key=value.form.draftId,heads=state.heads.get('draft:'+key)||[];
    const comparable=f=>{const {draftParents,...rest}=f;return JSON.stringify(rest);};
    const same=heads.find(h=>h.value&&comparable(h.value.form)===comparable(value.form));
    if(same)return same.id;
    return commit('draft',key,value,parents||heads.map(h=>h.id)).id;
}
function flushDrafts(){
    // Migrate recovery caches created by older releases; new edits are saved explicitly.
    for(const key of GM_listValues().filter(k=>k.startsWith(DRAFT))){
        const value=GM_getValue(key);if(!value?.form)continue;
        const revision=publishDraft(value,value.form.draftParents);
        if(form?.draftId===value.form.draftId)form.draftParents=[revision];
        GM_deleteValue(key);
    }
}
function removeDraft(draftId,parents){
    GM_deleteValue(DRAFT+draftId);refresh();const heads=state.heads.get('draft:'+draftId)||[];
    const observed=parents||heads.map(h=>h.id);
    if(observed.length)commit('draft',draftId,null,observed);
}
function formSnapshot(f){
    if(f.mode==='use')return JSON.stringify([f.output,Object.entries(f.values||{}).filter(([,value])=>value!=='').sort(([a],[b])=>a.localeCompare(b))]);
    if(f.mode==='tool')return JSON.stringify([f.title,f.description||'',f.content]);
    return JSON.stringify([f.title,f.content,f.tags,!!f.favorite]);
}
function protectedEdit(){return !!form;}
function isFormDirty(){return !!form&&formSnapshot(form)!==form.initial;}
function draftKind(f){return f.mode==='tool'?(f.toolExisting?'修改工具':'新建工具'):f.mode==='use'?(variables(f.content).length?'填写变量':'临时编辑'):f.base?.length?'修改原模板':'新建提示词';}
function requestLeave(proceed){
    if(!isFormDirty()){proceed();return;}
    dialog('如果返回，你编辑的内容将丢失。','<p>选择存草稿可以稍后继续编辑。按 Esc 可留在编辑页。</p>',()=>{persistDraft(true);form=null;closeDialog();proceed();return false;},{label:'存草稿'});
    const discard=$('[data-action=dialog-cancel]');discard.textContent='放弃';discard.classList.add('danger');
    // Discard this edit session, not the last explicitly saved draft.
    discard.onclick=e=>{e.stopPropagation();form=null;closeDialog();proceed();};
}
function launcherMarkup(){return settings.launcherIcon?`<img class="launcher-icon custom-launcher" alt="" aria-hidden="true" draggable="false" width="56" height="56" src="${esc(settings.launcherIcon)}">`:LAUNCHER;}
function paintLauncher(){
    const value=settings.launcherIcon||'';
    if(ball.dataset.customIcon!==value){ball.innerHTML=launcherMarkup();ball.dataset.customIcon=value;}
    const preview=$('.launcher-preview');if(preview)preview.innerHTML=launcherMarkup();
}
async function uploadLauncher(file){
    if(!file)return;
    if(file.size>1024*1024)throw Error('请选择不超过 1 MB 的 PNG 图片');
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(bytes.length<24||[137,80,78,71,13,10,26,10].some((n,i)=>bytes[i]!==n))throw Error('仅支持 PNG 图片，请先转换格式');
    const header=new DataView(bytes.buffer),w=header.getUint32(16),h=header.getUint32(20);
    if(Math.min(w,h)<64||Math.max(w,h)>2048)throw Error('图片宽高均需在 64–2048 像素之间');
    const url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
    try{
        const img=new Image();img.src=url;await img.decode();
        const canvas=document.createElement('canvas'),scale=Math.min(1,256/Math.max(w,h));canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);
        const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,canvas.width,canvas.height);
        const data=canvas.toDataURL('image/png');if(data.length>360000)throw Error('图片处理后仍过大，请选择更简单的图标');
        saveSettings({launcherIcon:data});renderSettings();toast('自定义图标已保存');
    }finally{URL.revokeObjectURL(url);}
}
function fillOutput(){
    outputHistory.clear();outputHistoryId=form.draftId;
    const ranges=[];let length=0,end=0,output='';
    for(const m of form.content.matchAll(/\{\{([^{}\n]+)\}\}/g)){
        output+=form.content.slice(end,m.index);length=output.length;
        const value=Object.hasOwn(form.values,m[1])?form.values[m[1]]:m[1];output+=value;
        if(value.length)ranges.push([length,output.length]);end=m.index+m[0].length;
    }
    form.output=output+form.content.slice(end);form.outputRanges=ranges;
}
function remapOutputRanges(oldText,newText){
    if(outputHistoryId!==form.draftId){outputHistory.clear();outputHistoryId=form.draftId;}
    outputHistory.set(oldText,(form.outputRanges||[]).map(r=>[...r]));
    while(outputHistory.size>20)outputHistory.delete(outputHistory.keys().next().value);
    if(outputHistory.has(newText)){form.outputRanges=outputHistory.get(newText).map(r=>[...r]);return;}
    let start=0;while(start<oldText.length&&start<newText.length&&oldText[start]===newText[start])start++;
    let oldEnd=oldText.length,newEnd=newText.length;while(oldEnd>start&&newEnd>start&&oldText[oldEnd-1]===newText[newEnd-1]){oldEnd--;newEnd--;}
    const delta=newEnd-oldEnd;
    form.outputRanges=(form.outputRanges||[]).map(([a,b])=>b<=start?[a,b]:a>=oldEnd?[a+delta,b+delta]:start<=a&&oldEnd>=b&&(start<a||oldEnd>b)?[0,0]:[Math.min(a,start),b>=oldEnd?b+delta:newEnd]).filter(([a,b])=>b>a);
}
function migratePortable(){
    portableReady=true;
    if(!GM_getValue(PREFIX+'portable_migrated',false)){
        // A fresh installation has no preference operations, so cloud preferences win on first sync.
        if(globalSettings&&!state.preference.length){
            for(const key of [...Object.keys(defaults),'collapseModes'])publishPreference(key,settings[key],1);
            if(storedLayout?.relative)publishPreference('layout',storedLayout,1);
            publishPreference('sites',readSites(),1);
            const config=GM_getValue(PREFIX+'sync',{});if(config.username)publishPreference('autoSync',!!config.auto,1);
        }
        flushDrafts();GM_setValue(PREFIX+'portable_migrated',true);
    }
    refresh();applyPortable();paintLauncher();
}
try{if(!storageBroken)migratePortable();}catch(error){errorStatus=error.message;updateStatus();}
