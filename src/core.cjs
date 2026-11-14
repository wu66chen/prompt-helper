'use strict';
const Core = (() => {
    const FORMAT = 'prompt-helper', VERSION = 4, MAX_OPS = 30000, MAX_BYTES = 20 * 1024 * 1024;
    const entities = ['prompt', 'tag', 'group', 'tool'];
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const tags = value => [...new Set((Array.isArray(value) ? value : String(value).split(/[,，]/)).map(t => String(t).trim()).filter(Boolean))];
    const order = (a, b) => a.at - b.at || a.id.localeCompare(b.id);
    const isText = (x, max) => typeof x === 'string' && x.length <= max;
    function validateValue(entity, v) {
        if (v === null) return;
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('记录格式不正确');
        if (entity === 'prompt') {
            if (!isText(v.content, 200000) || !v.content.trim() || !isText(v.title, 300) || !Array.isArray(v.tags) || v.tags.length > 100 || !v.tags.every(t => isText(t, 100) && t.trim()) || typeof v.favorite !== 'boolean') throw Error('提示词内容或标签格式不正确');
        } else if(entity==='tool') {
            if(!isText(v.title,100)||!v.title.trim()||!isText(v.description,300)||!isText(v.text,200000)||!v.text.trim())throw Error('工具提示词格式不正确');
        } else {
            if (!isText(v.name, 100) || !v.name.trim() || !Number.isFinite(v.rank)) throw Error('分组或标签格式不正确');
            if (entity === 'tag' && !isText(v.group, 300)) throw Error('标签分组格式不正确');
            if (entity === 'group' && v.color !== undefined && !/^#[0-9a-f]{6}$/i.test(v.color)) throw Error('分组图标颜色格式不正确');
        }
    }
    function validate(ops) {
        if (!Array.isArray(ops) || ops.length > MAX_OPS) throw Error('记录过多或备份格式不正确');
        const map = new Map();
        for (const op of ops) {
            if (!op || !isText(op.id, 300) || !op.id || !entities.includes(op.entity) || !isText(op.key, 300) || !op.key || !isText(op.device, 300) || !Number.isSafeInteger(op.at) || op.at < 0 || !Array.isArray(op.parents) || op.parents.length > MAX_OPS || !op.parents.every(p => isText(p, 300)) || !Object.hasOwn(op, 'value')) throw Error('备份包含无效记录');
            validateValue(op.entity, op.value);
            if (map.has(op.id)) throw Error('备份包含重复的记录编号');
            map.set(op.id, op);
        }
        const pending = new Map(), children = new Map();
        for (const op of ops) {
            const parents = [...new Set(op.parents)];
            pending.set(op.id, parents.length);
            for (const id of parents) {
                const p = map.get(id);
                if (!p || p.entity !== op.entity || p.key !== op.key) throw Error('备份缺少历史记录或引用了其他条目');
                if (!children.has(id)) children.set(id, []);
                children.get(id).push(op.id);
            }
        }
        const queue = ops.filter(op => pending.get(op.id) === 0).map(op => op.id);
        let seen = 0;
        for (let i = 0; i < queue.length; i++) {
            seen++;
            for (const id of children.get(queue[i]) || []) {
                pending.set(id, pending.get(id) - 1);
                if (pending.get(id) === 0) queue.push(id);
            }
        }
        if (seen !== ops.length) throw Error('备份的历史记录存在循环');
        return ops;
    }
    // Canonical representation makes imported JSON property order irrelevant.
    function canonical(op) {
        const v = op.value;
        const value = v === null ? null : op.entity === 'prompt'
            ? {title:v.title,content:v.content,tags:[...v.tags],favorite:v.favorite}
            : op.entity === 'tool' ? {title:v.title,description:v.description,text:v.text}
            : op.entity === 'group' ? {name:v.name,rank:v.rank,...(v.color !== undefined ? {color:v.color} : {})} : {name:v.name,rank:v.rank,group:v.group};
        return {id:op.id,entity:op.entity,key:op.key,at:op.at,device:op.device,parents:[...new Set(op.parents)].sort(),value};
    }
    function merge(...sets) {
        const map = new Map();
        for (const list of sets) for (const raw of list) {
            const op = canonical(raw), previous = map.get(op.id);
            if (previous && JSON.stringify(previous) !== JSON.stringify(op)) throw Error('同编号记录内容不同，已停止合并以保护数据');
            map.set(op.id, op);
        }
        return validate([...map.values()].sort(order));
    }
    function project(ops) {
        const buckets = new Map();
        for (const op of ops) {
            const id = op.entity + ':' + op.key;
            if (!buckets.has(id)) buckets.set(id, []);
            buckets.get(id).push(op);
        }
        const result = {prompt:[],tag:[],group:[],tool:[],heads:new Map()};
        for (const list of buckets.values()) {
            const replaced = new Set(list.flatMap(op => op.parents));
            const heads = list.filter(op => !replaced.has(op.id)).sort(order);
            const {entity,key} = list[0];
            result.heads.set(entity + ':' + key, heads);
            const visible = entity === 'prompt'||entity==='tool' ? heads : heads.slice(-1);
            for (const op of visible) if (op.value !== null) result[entity].push({...op.value,key,revision:op.id,at:op.at,conflict:heads.length > 1,deletedConflict:heads.some(h => h.value === null)});
        }
        // The built-in ungrouped bucket has appearance metadata but is not a tag destination.
        result.ungroupedColor=result.group.find(g=>g.key==='system-ungrouped')?.color;
        result.group=result.group.filter(g=>g.key!=='system-ungrouped');
        result.group.sort((a,b) => a.rank-b.rank || a.name.localeCompare(b.name));
        result.tag.sort((a,b) => a.rank-b.rank || a.name.localeCompare(b.name));
        result.prompt.sort((a,b) => Number(b.favorite)-Number(a.favorite) || b.at-a.at || a.revision.localeCompare(b.revision));
        return result;
    }
    function pack(ops) { return JSON.stringify({format:FORMAT,version:VERSION,operations:merge(ops)}, null, 2); }
    function unpack(text) {
        if (new TextEncoder().encode(text).length > MAX_BYTES) throw Error('文件超过 20 MB，请先拆分或整理备份');
        let data;
        try { data = JSON.parse(text); } catch { throw Error('文件不是有效的 JSON 备份'); }
        if (data.format !== FORMAT || ![3,VERSION].includes(data.version)) throw Error('备份版本不支持，请更新提示词助手后重试');
        return validate(data.operations).map(canonical);
    }
    function parseLegacy(text) {
        const regex = /--- 提示词 \d+ ---\r?\n\[标签\]：(.*?)\r?\n\[内容\]：\r?\n([\s\S]*?)\r?\n\r?\n=========================================/g;
        const result = [];
        let match;
        while ((match = regex.exec(text))) {
            const content = match[2].replace(/\u200c/g,'{{').replace(/\u200d/g,'}}');
            if (content.trim()) result.push({title:'',content,tags:match[1].trim()==='无标签'?[]:tags(match[1]),favorite:false});
        }
        if (!result.length) throw Error('未找到旧版 TXT 提示词，请选择原脚本导出的文件');
        return result;
    }
    function variables(content) { return [...new Set([...content.matchAll(/\{\{([^{}\n]+)\}\}/g)].map(m => m[1]))]; }
    function fill(content, values) { return content.replace(/\{\{([^{}\n]+)\}\}/g, (_, key) => Object.hasOwn(values,key) ? values[key] : key); }
    function filter(prompts, query, tagNames, favorite) {
        const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
        return prompts.filter(p => (!favorite || p.favorite) && (!tagNames || p.tags.some(t => tagNames.includes(t))) && words.every(w => [p.title,p.content,...p.tags].join('\n').toLocaleLowerCase().includes(w)));
    }
    function clampRect(rect, width, height, minimum={w:340,h:320}) {
        const gap = Math.min(12, width / 20, height / 20), maxW = Math.max(1,width-2*gap), maxH = Math.max(1,height-2*gap);
        const w = Math.min(Math.max(Math.max(1,Math.min(minimum.w,maxW)), Number(rect.w)||680),maxW);
        const h = Math.min(Math.max(Math.max(1,Math.min(minimum.h,maxH)), Number(rect.h)||650),maxH);
        return {w,h,x:Math.min(Math.max(gap,Number(rect.x)||gap),Math.max(gap,width-w-gap)),y:Math.min(Math.max(gap,Number(rect.y)||gap),Math.max(gap,height-h-gap))};
    }
    const LAUNCHER_SIZE=56;
    function launcherSize(value) {
        const n=typeof value==='number'||typeof value==='string'&&value.trim()!==''?Number(value):NaN;
        return Number.isFinite(n)?Math.min(128,Math.max(48,Math.round(n/4)*4)):72;
    }
    function collapseModes(settings={}) {
        if(settings.collapseModes&&typeof settings.collapseModes==='object')return {button:settings.collapseModes.button===true,outside:settings.collapseModes.outside===true,double:settings.collapseModes.double===true};
        return {button:true,outside:settings.collapse==='outside',double:settings.collapse==='double'};
    }
    function resizeRect(rect,edge,dx,dy,width,height) {
        const gap=Math.min(12,width/20,height/20),minW=Math.min(340,rect.w),minH=Math.min(320,rect.h);
        let left=rect.x,right=rect.x+rect.w,top=rect.y,bottom=rect.y+rect.h;
        const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
        if(edge.includes('w'))left=clamp(left+dx,gap,right-minW);
        if(edge.includes('e'))right=clamp(right+dx,left+minW,width-gap);
        if(edge.includes('n'))top=clamp(top+dy,gap,bottom-minH);
        if(edge.includes('s'))bottom=clamp(bottom+dy,top+minH,height-gap);
        return {x:left,y:top,w:right-left,h:bottom-top};
    }
    function clampLauncher(position,width,height,requestedSize=LAUNCHER_SIZE) {
        const gap=Math.min(12,width/20,height/20),s=Math.max(1,Math.min(launcherSize(requestedSize),width-2*gap,height-2*gap));
        return {x:Math.max(gap,Math.min(Number(position?.x)||gap,width-gap-s)),y:Math.max(gap,Math.min(Number(position?.y)||gap,height-gap-s)),s};
    }
    function layoutSnapshot(anchor,size,direction,width,height,requestedSize=LAUNCHER_SIZE) {
        const ball=clampLauncher(anchor,width,height,requestedSize),gap=Math.min(12,width/20,height/20);
        return {anchor:{x:ball.x,y:ball.y},size:{...size},direction,relative:{x:(ball.x-gap)/Math.max(1,width-2*gap-ball.s),y:(ball.y-gap)/Math.max(1,height-2*gap-ball.s)}};
    }
    function layoutAnchor(layout,width,height,requestedSize=LAUNCHER_SIZE) {
        if(!layout?.relative)return clampLauncher(layout?.anchor,width,height,requestedSize);
        const gap=Math.min(12,width/20,height/20),s=clampLauncher(null,width,height,requestedSize).s;
        const unit=v=>Math.max(0,Math.min(1,Number(v)||0));
        return clampLauncher({x:gap+unit(layout.relative.x)*Math.max(0,width-2*gap-s),y:gap+unit(layout.relative.y)*Math.max(0,height-2*gap-s)},width,height,requestedSize);
    }
    function anchoredRect(position,size,width,height,preferred='up-left',requestedSize=LAUNCHER_SIZE) {
        const ball=clampLauncher(position,width,height,requestedSize),gap=Math.min(12,width/20,height/20);
        const desired=clampRect({...size,x:gap,y:gap},width,height,{w:Math.min(340,size.w||680),h:Math.min(320,size.h||650)});
        const space={left:ball.x+ball.s-gap,right:width-gap-ball.x,up:ball.y+ball.s-gap,down:height-gap-ball.y};
        const [py,px]=['up-left','up-right','down-left','down-right'].includes(preferred)?preferred.split('-'):['up','left'];
        const select=(a,b,wanted,prefer)=>space[prefer]>=wanted?prefer:space[a]>=wanted?a:space[b]>=wanted?b:space[a]>=space[b]?a:b;
        const xDir=select('left','right',desired.w,px),yDir=select('up','down',desired.h,py);
        const w=Math.min(desired.w,space[xDir]),h=Math.min(desired.h,space[yDir]);
        return {ball,direction:yDir+'-'+xDir,rect:{x:xDir==='left'?ball.x+ball.s-w:ball.x,y:yDir==='up'?ball.y+ball.s-h:ball.y,w,h}};
    }
    function launcherFromRect(rect,direction,width,height,requestedSize=LAUNCHER_SIZE) {
        const s=clampLauncher({x:0,y:0},width,height,requestedSize).s;
        return clampLauncher({x:direction.endsWith('left')?rect.x+rect.w-s:rect.x,y:direction.startsWith('up')?rect.y+rect.h-s:rect.y},width,height,requestedSize);
    }
    function etag(headers,allowBare=false) {
        const lines=String(headers||'').split(/\r?\n/).filter(line=>/^etag:/i.test(line));
        if(lines.length!==1)return null;
        const value=lines[0].slice(5).trim();
        if(!value||/^W\//i.test(value))return null;
        if(/^"[^"\x00-\x20\x7f]+"$/.test(value))return value;
        // Nutstore may return unquoted opaque tokens and compare If-Match literally.
        // Preserve the token; never manufacture quotes, strip W/, or use a wildcard.
        return allowBare&&/^[A-Za-z0-9._~+/=-]+$/.test(value)?value:null;
    }
    // GET + conditional PUT. Never blindly overwrite a newer remote revision.
    async function syncCAS({request,readLocal,ingest,readRevision,allowBareETag=false,maxAttempts=4}) {
        for (let attempt=0; attempt<maxAttempts; attempt++) {
            const r = await request('GET');
            if (![200,404].includes(r.status)) throw httpError(r.status);
            let remote = r.status === 200 ? unpack(r.responseText) : [];
            let revision = r.status === 200 ? etag(r.responseHeaders,allowBareETag) : null;
            await ingest(remote);
            let ops = merge(remote, readLocal());
            if (r.status===200 && pack(ops)===pack(remote)) return {count:ops.length,unchanged:true};
            if(r.status===200&&!revision&&readRevision){
                revision=await readRevision();
                if(revision){
                    // Metadata may describe a newer file than our initial GET. Re-read it
                    // under that condition and check the version again before merging.
                    const checked=await request('GET',undefined,{'If-Match':revision,'Cache-Control':'no-cache'});
                    if([404,412].includes(checked.status))continue;
                    if(checked.status!==200)throw httpError(checked.status);
                    const checkedRevision=etag(checked.responseHeaders,allowBareETag)||await readRevision();
                    if(checkedRevision!==revision)continue;
                    remote=unpack(checked.responseText);await ingest(remote);ops=merge(remote,readLocal());
                    if(pack(ops)===pack(remote))return {count:ops.length,unchanged:true};
                }
            }
            if (r.status===200 && !revision) throw Error('服务未返回可靠的版本标记，已停止上传；本地内容已保留');
            const body = pack(ops);
            if (new TextEncoder().encode(body).length > MAX_BYTES) throw Error('同步文件超过 20 MB，已停止上传；请保留本地备份');
            const put = await request('PUT', body, revision ? {'If-Match':revision} : {'If-None-Match':'*'});
            if (put.status===412) continue;
            if (![200,201,204].includes(put.status)) throw httpError(put.status);
            return {count:ops.length,unchanged:false};
        }
        throw Error('另一台设备正在频繁修改，请稍后再次同步；本地内容已保留');
    }
    function httpError(status) {
        const messages = {401:'账号或应用密码不正确，请检查坚果云授权',403:'无权访问或请求过于频繁，请检查授权并稍后重试',404:'同步目录不存在，请检查文件夹名称',409:'同步目录尚未创建或路径冲突',429:'坚果云请求过于频繁，请稍后重试',507:'坚果云空间不足，请整理网盘后重试'};
        const error = Error(messages[status] || `同步服务返回 ${status}，请稍后重试`); error.status = status; return error;
    }
    return {FORMAT,VERSION,MAX_BYTES,MAX_OPS,LAUNCHER_SIZE,launcherSize,esc,tags,validate,merge,project,pack,unpack,parseLegacy,variables,fill,filter,clampRect,collapseModes,resizeRect,clampLauncher,layoutSnapshot,layoutAnchor,anchoredRect,launcherFromRect,etag,syncCAS,httpError};
})();
module.exports = Core;
