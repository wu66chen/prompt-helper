const fs = require('node:fs');
const path = require('node:path');
const dir = __dirname;
const matches = JSON.parse(fs.readFileSync(path.join(dir,'userscript-matches.json'),'utf8')).map(pattern=>'// @match        '+pattern).join('\n');
const header = `// ==UserScript==
// @name         提示词助手
// @namespace    http://tampermonkey.net/
// @version      3.8.4
// @description  macOS 风格提示词资料库：分组、全文搜索、变量填写、草稿与坚果云 WebDAV 同步。
// @author       Wesley Liu
${matches}
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_listValues
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      dav.jianguoyun.com
// @noframes
// @run-at       document-end
// @updateURL    none
// @license      MIT
// ==/UserScript==
`;
const core = fs.readFileSync(path.join(dir,'src/core.cjs'),'utf8').replace(/module\.exports = Core;\s*$/, '');
const css = fs.readFileSync(path.join(dir,'src/style.css'),'utf8');
const app = fs.readFileSync(path.join(dir,'src/app.js'),'utf8');
// Embed locally so the launcher works offline and adds no external request.
const launcherPng = fs.readFileSync(path.join(dir,'src/launcher.png')).toString('base64');
const launcher = '<img class="launcher-icon" alt="" aria-hidden="true" draggable="false" width="56" height="56" src="data:image/png;base64,' + launcherPng + '">';
const output = header + '\n(function () {\n\'use strict\';\n' + core + '\nconst STYLE = ' + JSON.stringify(css) + ';\nconst LAUNCHER = ' + JSON.stringify(launcher) + ';\n' + app + '\n})();\n';
fs.writeFileSync(path.join(dir,'prompt-helper.user.js'),output);

console.log('Built standalone userscript: ' + Buffer.byteLength(output) + ' bytes');
