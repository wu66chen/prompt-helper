// Session-local navigation contains page context, never credentials or draft text.
function pageSnapshot(){
    return {view,filter:{...filter},query,selectedTag,settingsTab,expanded:[...expanded],scrolls:$$('.content .scroll').map(el=>el.scrollTop),sidebarScroll:$('.sidebar').scrollTop};
}
function rememberPage(){
    if(view==='editor')return;
    navigation.push(pageSnapshot());if(navigation.length>40)navigation.shift();
}
function restorePage(page){
    view=page.view;filter={...page.filter};query=page.query;selectedTag=page.selectedTag;settingsTab=page.settingsTab;expanded=new Set(page.expanded||[]);
    render();
    const renderedPage=content.firstElementChild;
    const restore=()=>{if(content.firstElementChild!==renderedPage)return;$$('.content .scroll').forEach((el,i)=>el.scrollTop=page.scrolls?.[i]||0);$('.sidebar').scrollTop=page.sidebarScroll||0;};
    restore();requestAnimationFrame(restore);
}
function returnToPrevious(){
    leaveForm();const previous=navigation.pop();
    restorePage(previous||{view:'library',filter:{kind:'all',key:''},query:'',selectedTag:'',settingsTab:'appearance',scrolls:[]});
}
function back(){requestLeave(returnToPrevious);}
function navigate(next,options={}){
    requestLeave(()=>{
        const same=next===view&&(next!=='settings'||!options.tab||options.tab===settingsTab);
        const sameFilter=!options.filter||(options.filter.kind===filter.kind&&options.filter.key===filter.key&&!selectedTag);
        if(same&&sameFilter){if(options.focusSearch)$('.search-input')?.focus();return;}
        rememberPage();leaveForm();view=next;
        if(options.tab)settingsTab=options.tab;
        if(options.filter){filter=options.filter;selectedTag='';}
        panel.classList.remove('nav-open');render();
        if(options.focusSearch)$('.search-input')?.focus();
    });
}
function applyTypography(){
    const size=Math.max(12,Math.min(20,Math.round(Number(settings.fontSize)||14)));
    host.style.setProperty('--font-scale',String(size/14));panel.classList.toggle('font-large',size>16);
    const slider=$('[name=fontSize]');if(slider){slider.value=size;slider.setAttribute('aria-valuetext',size+' 像素');}
    const label=$('[data-font-size]');if(label)label.textContent=size+' px';
    updateVariableHighlight();
}
function typographySettings(){
    return `<section class="section"><div class="setting-row"><label for="font-size">全局字体大小</label><output data-font-size for="font-size">${settings.fontSize} px</output></div><input id="font-size" name="fontSize" class="launcher-range" type="range" min="12" max="20" step="1" value="${settings.fontSize}" aria-valuetext="${settings.fontSize} 像素"><div class="launcher-size-footer"><span>12 px</span>${btn('reset-font-size','恢复默认 14 px')}<span>20 px</span></div><p class="hint">拖动即时调整标题、正文、按钮和输入框文字，自动保存；所有网站共用，也会随坚果云和完整备份迁移。大字号会增加换行和控件高度。</p></section>`;
}
