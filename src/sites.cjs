'use strict';
const SiteRules=(()=>{
    function parse(value){
        let text=String(value??'').trim(),subdomains=false;
        if(!text||text.length>2048||/\s/.test(text))throw Error('请输入有效域名或 HTTP / HTTPS 网页地址');
        if(text.startsWith('*.')){subdomains=true;text=text.slice(2);}
        if(!/^https?:\/\//i.test(text)){
            if(text.includes('://')||/^[a-z][a-z\d+.-]*:(?!\d+(?:[/?#]|$))/i.test(text))throw Error('只支持 HTTP / HTTPS 网站');
            text='https://'+text;
        }
        let url;try{url=new URL(text);}catch{throw Error('网站地址格式不正确');}
        if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('请使用不含账号密码的 HTTP / HTTPS 地址');
        const host=url.hostname.toLowerCase().replace(/\.$/,'');
        const ipv6=/^\[[0-9a-f:]+\]$/.test(host);
        if(!host||host.length>253||(!ipv6&&(host!=='localhost'&&!host.includes('.')||!host.split('.').every(s=>s.length<=63&&/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/.test(s)))))throw Error('请输入完整域名，例如 example.com');
        if((ipv6||/^\d+(?:\.\d+){3}$/.test(host)||host==='localhost')&&subdomains)throw Error('IP 地址和 localhost 不支持子域名通配');
        return {host,subdomains};
    }
    function matches(host,rule){return host===rule.host||rule.subdomains&&host.endsWith('.'+rule.host);}
    function normalize(value,defaults){
        const known=new Set(defaults),disabledDefaults=[...new Set(Array.isArray(value?.disabledDefaults)?value.disabledDefaults.filter(h=>known.has(h)):[])];
        const custom=[],seen=new Set();
        for(const raw of Array.isArray(value?.custom)?value.custom.slice(0,200):[]){
            try{const {host}=parse(raw?.host);if(known.has(host)||seen.has(host))continue;seen.add(host);custom.push({host,subdomains:raw.subdomains===true&&!/^\[|^\d+(?:\.\d+){3}$|^localhost$/.test(host),enabled:raw.enabled!==false});}catch{}
        }
        return {disabledDefaults,custom};
    }
    function enabled(host,value,defaults){
        host=String(host).toLowerCase().replace(/\.$/,'');
        const state=normalize(value,defaults),custom=state.custom.filter(r=>matches(host,r)).sort((a,b)=>b.host.length-a.host.length)[0];
        const base=defaults.filter(h=>matches(host,{host:h,subdomains:true})).sort((a,b)=>b.length-a.length)[0];
        if(custom&&(!base||custom.host.length>base.length))return custom.enabled;
        return !!base&&!state.disabledDefaults.includes(base);
    }
    function add(value,input,subdomains,defaults){
        const state=normalize(value,defaults),parsed=parse(input);
        if(defaults.includes(parsed.host))throw Error('这个域名已在默认网站中，请使用下方开关');
        if(state.custom.some(r=>r.host===parsed.host))throw Error('这个域名已添加，可直接修改下方开关');
        if(state.custom.length>=200)throw Error('最多添加 200 个自定义网站');
        state.custom.push({...parsed,subdomains:parsed.subdomains||!!subdomains,enabled:true});
        return normalize(state,defaults);
    }
    return {parse,matches,normalize,enabled,add};
})();
module.exports=SiteRules;
