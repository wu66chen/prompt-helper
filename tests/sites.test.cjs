const test=require('node:test'),assert=require('node:assert/strict'),S=require('../src/sites.cjs');
const defaults=['chatgpt.com','deepseek.com','aistudio.google.com'];
test('defaults remain enabled, disabled roots cover all descendants and boundary lookalikes stay excluded',()=>{
 assert.ok(S.enabled('chatgpt.com',{},defaults));assert.ok(S.enabled('chat.deepseek.com',{},defaults));
 assert.equal(S.enabled('evilchatgpt.com',{},defaults),false);assert.equal(S.enabled('chatgpt.com.evil.test',{},defaults),false);
 assert.equal(S.enabled('chat.deepseek.com',{disabledDefaults:['deepseek.com']},defaults),false);
 assert.equal(S.enabled('elsewhere.test',{},defaults),false);
});
test('URL and domain normalization handles IDN, trailing dots, ports and rejects executable or credential URLs',()=>{
 assert.deepEqual(S.parse('HTTPS://Example.COM.:8080/a?q=1'),{host:'example.com',subdomains:false});
 assert.equal(S.parse('example.com:8080/a').host,'example.com');assert.equal(S.parse('https://例子.测试').host,'xn--fsqu00a.xn--0zwm56d');
 assert.deepEqual(S.parse('*.example.com'),{host:'example.com',subdomains:true});assert.equal(S.parse('http://[::1]:8080').host,'[::1]');
 for(const bad of ['','com','*','*://*/*','file:///a','javascript:alert(1)','https://u:p@example.com','https://*.com','foo bar.com','-bad.com','*.127.0.0.1'])assert.throws(()=>S.parse(bad),bad);
});
test('specific custom rule wins over broader rules and defaults; deleting it restores inherited behavior',()=>{
 let r=S.add({},'example.com',true,defaults);assert.ok(S.enabled('a.example.com',r,defaults));
 r=S.add(r,'a.example.com',true,defaults);r.custom[1].enabled=false;
 assert.equal(S.enabled('a.example.com',r,defaults),false);assert.equal(S.enabled('b.a.example.com',r,defaults),false);assert.ok(S.enabled('b.example.com',r,defaults));
 r.custom.pop();assert.ok(S.enabled('a.example.com',r,defaults));
 r=S.add({disabledDefaults:['deepseek.com']},'chat.deepseek.com',false,defaults);assert.ok(S.enabled('chat.deepseek.com',r,defaults));assert.equal(S.enabled('api.deepseek.com',r,defaults),false);
});
test('malformed storage is bounded and normalized, duplicates and default overrides cannot be added',()=>{
 assert.deepEqual(S.normalize({disabledDefaults:['bad','chatgpt.com','chatgpt.com'],custom:[null,{host:'javascript:bad'},{host:'EXAMPLE.com',enabled:false},{host:'example.com'},{host:'chatgpt.com'}]},defaults),{disabledDefaults:['chatgpt.com'],custom:[{host:'example.com',enabled:false,subdomains:false}]});
 assert.throws(()=>S.add({},'chatgpt.com',true,defaults));let r=S.add({},'example.com',false,defaults);assert.throws(()=>S.add(r,'https://EXAMPLE.com/path',true,defaults));assert.equal(S.enabled('sub.example.com',r,defaults),false);
});
test('a broad custom parent cannot override a more specific default switch',()=>{
 const state={custom:[{host:'google.com',subdomains:true,enabled:false}]};
 assert.equal(S.enabled('aistudio.google.com',state,defaults),true);
 assert.equal(S.enabled('other.google.com',state,defaults),false);
 state.custom[0].enabled=true;state.disabledDefaults=['aistudio.google.com'];
 assert.equal(S.enabled('aistudio.google.com',state,defaults),false);
 assert.equal(S.enabled('other.google.com',state,defaults),true);
});
