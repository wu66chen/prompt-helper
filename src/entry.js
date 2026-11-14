// Only the allowlist and recovery menu run on websites that are not enabled.
if(window.top!==window.self||!['http:','https:'].includes(location.protocol))return;
const SITES_KEY='ph3_sites_global';
const readSites=()=>SiteRules.normalize(GM_getValue(SITES_KEY,{}),DEFAULT_SITES);
const siteEnabled=()=>SiteRules.enabled(location.hostname,readSites(),DEFAULT_SITES);
let showSites;
GM_registerMenuCommand('提示词助手：网站管理',()=>{
    if(!showSites)showSites=launchHelper();
    showSites?.();
});
if(siteEnabled())showSites=launchHelper();
