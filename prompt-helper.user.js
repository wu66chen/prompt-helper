// ==UserScript==
// @name         提示词助手
// @namespace    http://tampermonkey.net/
// @version      2.5
// @description  全网通用 AI 提示词管家：支持填空式红字变量、一键直拷防抖动、标签搜索、多平台独立深浅主题、智能滚动条、独立大小记忆及无痕导出导入。
// @author       Wesley Liu
// @match        *://doubao.com/*
// @match        *://*.doubao.com/*
// @match        *://jimeng.jianying.com/*
// @match        *://*.jimeng.jianying.com/*
// @match        *://dreamina.capcut.com/*
// @match        *://*.dreamina.capcut.com/*
// @match        *://exp.volcengine.com/*
// @match        *://*.exp.volcengine.com/*
// @match        *://aistudio.google.com/*
// @match        *://*.aistudio.google.com/*
// @match        *://gemini.google.com/*
// @match        *://*.gemini.google.com/*
// @match        *://business.gemini.google/*
// @match        *://*.business.gemini.google/*
// @match        *://chatgpt.com/*
// @match        *://*.chatgpt.com/*
// @match        *://qianwen.com/*
// @match        *://*.qianwen.com/*
// @match        *://qwen.ai/*
// @match        *://*.qwen.ai/*
// @match        *://deepseek.com/*
// @match        *://*.deepseek.com/*
// @match        *://arena.ai/*
// @match        *://*.arena.ai/*
// @match        *://kimi.com/*
// @match        *://*.kimi.com/*
// @include      *://*doubao.com/*
// @include      *://*jimeng.jianying.com/*
// @include      *://*dreamina.capcut.com/*
// @include      *://*exp.volcengine.com/*
// @include      *://*aistudio.google.com/*
// @include      *://*gemini.google.com/*
// @include      *://*business.gemini.google/*
// @include      *://*chatgpt.com/*
// @include      *://*qianwen.com/*
// @include      *://*qwen.ai/*
// @include      *://*deepseek.com/*
// @include      *://*arena.ai/*
// @include      *://*kimi.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        window.onurlchange
// @run-at       document-end
// @license      MIT
// ==/UserScript==
 
(function() {
    'use strict';
 
    // 【核心防御】：允许在 iframe 中运行（解决 Google AI Studio 等嵌套应用失效问题）
    // 但排除那些极小的隐形广告追踪器，防止错加悬浮球
    if (window !== window.top) {
        if (window.innerWidth < 400 || window.innerHeight < 400) {
            return;
        }
    }
 
    console.log("🚀【提示词助手 V2.5】脚本开始尝试运行...");
 
    // 数据状态
    let activeFilterTag = '全部';
    let currentEditId = null; 
    let isTempEditMode = false;
    
    // 获取当前网站的独立域名，用于隔离主题设置与面板尺寸
    const domainKey = window.location.hostname;
    const themeKey = 'db_theme_mode_' + domainKey;
    const sizeKey = 'db_panel_size_' + domainKey; // 新增独立尺寸记忆 Key
 
    // 获取最新数据防多标签页数据覆盖
    function getPrompts() {
        return GM_getValue('db_prompts_data',[]);
    }
 
    // --- 工具函数 ---
    function uuidv4() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
 
    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag]));
    }
 
    // 列表渲染时用的格式化
    function formatRedText(text) {
        let escaped = escapeHTML(text);
        return escaped.replace(/\{\{(.*?)\}\}/g, '<span class="db-red-text">$1</span>');
    }
 
    // 插入红字
    function insertRedTextRich(elementId) {
        const el = document.getElementById(elementId);
        el.focus();
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
 
        if (!selection.isCollapsed) {
            let text = selection.toString();
            document.execCommand('insertHTML', false, '<span class="db-red-text">' + escapeHTML(text) + '</span>\u200B');
        } else {
            document.execCommand('insertHTML', false, '<span class="db-red-text">自定义文字</span>\u200B');
        }
    }
 
    // 插入黑字 (恢复普通文本)
    function insertBlackTextRich(elementId) {
        const el = document.getElementById(elementId);
        el.focus();
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
 
        if (!selection.isCollapsed) {
            let text = selection.toString();
            document.execCommand('insertHTML', false, '<span class="db-black-text">' + escapeHTML(text) + '</span>\u200B');
        } else {
            document.execCommand('insertHTML', false, '<span class="db-black-text">\u200B</span>');
        }
    }
 
    // 将富文本框中的颜色格式转换回 {{ }} 格式以便本地保存
    function getRawContentFromRich(element) {
        const clone = element.cloneNode(true);
        const blackSpans = clone.querySelectorAll('.db-black-text');
        blackSpans.forEach(blackSpan => {
            if (blackSpan.closest('.db-red-text')) {
                blackSpan.textContent = '}}' + blackSpan.textContent + '{{';
            }
        });
        const redSpans = clone.querySelectorAll('.db-red-text');
        redSpans.forEach(span => {
            span.textContent = '{{' + span.textContent + '}}';
        });
        clone.style.cssText = 'position: absolute; left: -9999px; white-space: pre-wrap; word-break: break-all;';
        document.body.appendChild(clone);
        let text = clone.innerText;
        document.body.removeChild(clone);
        
        return text.replace(/\xA0/g, ' ')
                   .replace(/\u200B/g, '')
                   .replace(/\{\{+/g, '{{')
                   .replace(/\}\}+/g, '}}')
                   .replace(/\{\{\}\}/g, '');
    }
 
    // 拦截粘贴事件，只允许纯文本粘贴
    function handlePasteAsPlainText(e) {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, text);
    }
 
    // --- 渲染 UI ---
    function renderUI() {
        const prompts = getPrompts();
        const tagsContainer = document.getElementById('db-tags-container');
        const listContainer = document.getElementById('db-list-container');
        const searchInput = document.getElementById('db-tag-search-input');
        if (!tagsContainer || !listContainer) return;
 
        // 获取标签搜索关键字
        const keyword = searchInput ? searchInput.value.trim().toLowerCase() : '';
 
        // 渲染顶部标签 (含搜索过滤)
        let allTags = new Set();
        prompts.forEach(p => p.tags.forEach(t => allTags.add(t)));
        let tagsArr =['全部', ...Array.from(allTags)];
        
        if (!tagsArr.includes(activeFilterTag)) activeFilterTag = '全部';
 
        // 过滤显示的标签
        let displayTags = tagsArr;
        if (keyword) {
            displayTags = tagsArr.filter(t => t === '全部' || t.toLowerCase().includes(keyword));
        }
 
        tagsContainer.innerHTML = '';
        if (displayTags.length === 0) {
            tagsContainer.innerHTML = '<span style="color:var(--text-sub); font-size:12px;">无匹配标签</span>';
        } else {
            displayTags.forEach(tag => {
                const span = document.createElement('span');
                span.className = 'db-tag';
                span.style.cssText = `padding: 2px 8px; background: ${activeFilterTag === tag ? 'var(--primary-color)' : 'var(--bg-tag)'}; color: ${activeFilterTag === tag ? '#fff' : 'var(--text-sub)'}; border-radius: 4px; font-size: 12px; cursor: pointer; user-select: none; white-space: nowrap;`;
                span.innerText = tag;
                span.onclick = () => { activeFilterTag = tag; renderUI(); };
                tagsContainer.appendChild(span);
            });
        }
 
        // 渲染提示词列表
        listContainer.innerHTML = '';
        const filteredPrompts = activeFilterTag === '全部' ? prompts : prompts.filter(p => p.tags.includes(activeFilterTag));
 
        if (filteredPrompts.length === 0) {
            listContainer.innerHTML = '<div style="color:var(--text-sub);text-align:center;margin-top:20px;">暂无提示词</div>';
        }
 
        filteredPrompts.forEach(p => {
            const card = document.createElement('div');
            card.style.cssText = 'background: var(--bg-card); padding: 12px; border-radius: 8px; margin-bottom: 10px; box-shadow: 0 2px 4px var(--shadow-color); border: 1px solid var(--border-color);';
            
            const tagsHTML = p.tags.length > 0 
                ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">${p.tags.map(t => `<span style="font-size:11px;background:var(--bg-primary-light);color:var(--primary-color);padding:1px 6px;border-radius:2px;">${escapeHTML(t)}</span>`).join('')}</div>`
                : '';
 
            card.innerHTML = `
                ${tagsHTML}
                <div class="db-prompt-text-clickable" title="点击直接复制到剪贴板" style="color:var(--text-main); margin-bottom:12px; white-space:pre-wrap; word-break:break-all; font-size:13px; cursor:pointer; padding:6px; border-radius:4px; transition:0.2s; border:1px solid transparent;">${formatRedText(p.content)}</div>
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button class="db-action-btn" data-action="delete" style="padding:4px 8px;font-size:12px;border-radius:4px;cursor:pointer;border:none;background:var(--bg-red-light);color:var(--red-color);">删除</button>
                    <button class="db-action-btn" data-action="edit-perm" style="padding:4px 8px;font-size:12px;border-radius:4px;cursor:pointer;border:none;background:var(--bg-tag);color:var(--text-sub);">修改</button>
                    <button class="db-action-btn" data-action="edit-temp" style="padding:4px 8px;font-size:12px;border-radius:4px;cursor:pointer;border:none;background:var(--primary-color);color:#fff;">临时编辑</button>
                </div>
            `;
            
            // 点击文本区域直接复制逻辑
            const textDiv = card.querySelector('.db-prompt-text-clickable');
            textDiv.onmouseover = () => { textDiv.style.background = 'var(--bg-hover)'; textDiv.style.borderColor = 'var(--border-color)'; };
            textDiv.onmouseout = () => { textDiv.style.background = 'transparent'; textDiv.style.borderColor = 'transparent'; };
            textDiv.onclick = () => {
                const cleanText = p.content.replace(/\{\{/g, '').replace(/\}\}/g, '');
                navigator.clipboard.writeText(cleanText).then(() => {
                    const currentHeight = textDiv.offsetHeight;
                    textDiv.style.height = currentHeight + 'px';
                    textDiv.style.boxSizing = 'border-box';
                    textDiv.style.overflow = 'hidden';
                    
                    const origHtml = textDiv.innerHTML;
                    textDiv.innerHTML = '<span style="color:var(--primary-color); font-weight:bold;">✔️ 提示词已成功复制到剪贴板！</span>';
                    
                    setTimeout(() => {
                        textDiv.innerHTML = origHtml;
                        textDiv.style.height = ''; 
                        textDiv.style.overflow = '';
                    }, 1000);
                }).catch(() => alert('复制失败，请手动选取复制。'));
            };
 
            card.querySelector('[data-action="delete"]').onclick = () => {
                if (confirm('确定要删除吗？')) {
                    let currentPrompts = getPrompts();
                    currentPrompts = currentPrompts.filter(item => item.id !== p.id);
                    GM_setValue('db_prompts_data', currentPrompts);
                    renderUI();
                }
            };
            card.querySelector('[data-action="edit-perm"]').onclick = () => openModal(p.id, false);
            card.querySelector('[data-action="edit-temp"]').onclick = () => openModal(p.id, true);
 
            listContainer.appendChild(card);
        });
    }
 
    function openModal(id, isTemp) {
        currentEditId = id;
        isTempEditMode = isTemp;
        const prompts = getPrompts();
        const promptObj = prompts.find(p => p.id === id);
        if (!promptObj) return;
 
        const editContentRich = document.getElementById('db-edit-content-rich');
        
        editContentRich.innerHTML = escapeHTML(promptObj.content)
            .replace(/\n/g, '<br>')
            .replace(/\{\{(.*?)\}\}/g, '<span class="db-red-text">$1</span>\u200B');
            
        if (isTemp) {
            document.getElementById('db-modal-title').innerText = '临时编辑并使用 (直接修改红字，不影响原模板)';
            document.getElementById('db-edit-tags').style.display = 'none';
            document.getElementById('db-modal-confirm').innerText = '复制到剪贴板';
        } else {
            document.getElementById('db-modal-title').innerText = '修改提示词 (永久保存)';
            document.getElementById('db-edit-tags').style.display = 'block';
            document.getElementById('db-edit-tags').value = promptObj.tags.join(',');
            document.getElementById('db-modal-confirm').innerText = '保存修改';
        }
        
        document.getElementById('db-modal-overlay').style.display = 'flex';
    }
 
    // --- 初始化 App ---
    function initApp() {
        const targetNode = document.body || document.documentElement;
        if (!targetNode) return; 
        if (document.getElementById('db-prompt-helper-root')) return; 
 
        console.log("✅【提示词助手 V2.5】正在向页面注入悬浮窗...");
 
        const currentTheme = GM_getValue(themeKey, 'light');
 
        const cssText = `
            #db-prompt-helper-root {
                --bg-main: #ffffff;
                --bg-header: #f2f3f5;
                --bg-body: #f7f8fa;
                --bg-card: #ffffff;
                --bg-tag: #f2f3f5;
                --bg-hover: #f2f3f5;
                --bg-primary-light: #e8f3ff;
                --bg-red-light: #ffece8;
                --text-main: #1d2129;
                --text-sub: #4e5969;
                --border-color: #e5e6eb;
                --primary-color: #165dff;
                --red-color: #f53f3f;
                --black-text: #1d2129;
                --modal-overlay: rgba(0,0,0,0.5);
                --input-bg: #ffffff;
                --shadow-color: rgba(0,0,0,0.15);
            }
            #db-prompt-helper-root.db-dark-mode {
                --bg-main: #232324;
                --bg-header: #1c1c1e;
                --bg-body: #191a1a;
                --bg-card: #2f3033;
                --bg-tag: #3c4043;
                --bg-hover: #3c4043;
                --bg-primary-light: #1a2a4a;
                --bg-red-light: #4a1a1a;
                --text-main: #e8eaed;
                --text-sub: #9aa0a6;
                --border-color: #3c4043;
                --primary-color: #4e88ff;
                --red-color: #ff6b6b;
                --black-text: #e8eaed;
                --modal-overlay: rgba(0,0,0,0.75);
                --input-bg: #2f3033;
                --shadow-color: rgba(0,0,0,0.5);
            }
            #db-prompt-helper-root * { box-sizing: border-box; }
            #db-prompt-helper-root .db-custom-input { width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; outline: none; font-size: 13px; font-family: inherit; background: var(--input-bg); color: var(--text-main); }
            #db-prompt-helper-root .db-custom-input:focus { border-color: var(--primary-color); }
            #db-prompt-helper-root .db-custom-btn { padding: 6px 12px; font-size: 13px; border-radius: 4px; cursor: pointer; border: none; transition: 0.2s; }
            #db-prompt-helper-root .db-custom-btn:hover { opacity: 0.8; }
            #db-prompt-helper-root .db-red-text { color: var(--red-color) !important; font-weight: bold !important; }
            #db-prompt-helper-root .db-black-text { color: var(--black-text) !important; font-weight: normal !important; }
            #db-prompt-helper-root[contenteditable][placeholder]:empty:before { content: attr(placeholder); color: var(--text-sub); cursor: text; }
 
            /* 智能滚动条：全局强制击穿防污染 */
            #db-prompt-helper-root #db-tags-container,
            #db-prompt-helper-root #db-list-container,
            #db-prompt-helper-root .db-custom-input {
                scrollbar-width: thin !important;
                scrollbar-color: rgba(0,0,0,0.25) transparent !important;
            }
            #db-prompt-helper-root.db-dark-mode #db-tags-container,
            #db-prompt-helper-root.db-dark-mode #db-list-container,
            #db-prompt-helper-root.db-dark-mode .db-custom-input {
                scrollbar-color: rgba(255,255,255,0.25) transparent !important;
            }
 
            /* 重置 Webkit 滚动条可见性 */
            #db-prompt-helper-root #db-tags-container::-webkit-scrollbar,
            #db-prompt-helper-root #db-list-container::-webkit-scrollbar,
            #db-prompt-helper-root .db-custom-input::-webkit-scrollbar {
                display: block !important; visibility: visible !important; width: 6px !important; height: 6px !important; background-color: transparent !important;
            }
            #db-prompt-helper-root #db-tags-container::-webkit-scrollbar-track,
            #db-prompt-helper-root #db-list-container::-webkit-scrollbar-track,
            #db-prompt-helper-root .db-custom-input::-webkit-scrollbar-track {
                display: block !important; visibility: visible !important; background-color: transparent !important;
            }
            #db-prompt-helper-root #db-tags-container::-webkit-scrollbar-thumb,
            #db-prompt-helper-root #db-list-container::-webkit-scrollbar-thumb,
            #db-prompt-helper-root .db-custom-input::-webkit-scrollbar-thumb {
                display: block !important; visibility: visible !important; background-color: rgba(0,0,0,0.25) !important; border-radius: 3px !important; border: none !important;
            }
            #db-prompt-helper-root #db-tags-container::-webkit-scrollbar-thumb:hover,
            #db-prompt-helper-root #db-list-container::-webkit-scrollbar-thumb:hover,
            #db-prompt-helper-root .db-custom-input::-webkit-scrollbar-thumb:hover { background-color: rgba(0,0,0,0.45) !important; }
 
            #db-prompt-helper-root.db-dark-mode #db-tags-container::-webkit-scrollbar-thumb,
            #db-prompt-helper-root.db-dark-mode #db-list-container::-webkit-scrollbar-thumb,
            #db-prompt-helper-root.db-dark-mode .db-custom-input::-webkit-scrollbar-thumb { background-color: rgba(255,255,255,0.25) !important; }
            
            #db-prompt-helper-root.db-dark-mode #db-tags-container::-webkit-scrollbar-thumb:hover,
            #db-prompt-helper-root.db-dark-mode #db-list-container::-webkit-scrollbar-thumb:hover,
            #db-prompt-helper-root.db-dark-mode .db-custom-input::-webkit-scrollbar-thumb:hover { background-color: rgba(255,255,255,0.45) !important; }
            
            #db-main-panel::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
        `;
 
        // 强行穿透极严 CSP 拦截。
        if (!document.getElementById('db-style-tracker')) {
            try {
                if (typeof GM_addStyle === 'function') {
                    GM_addStyle(cssText);
                } else {
                    throw new Error("No GM_addStyle");
                }
            } catch (e) {
                const styleEl = document.createElement('style');
                styleEl.innerHTML = cssText;
                document.head.appendChild(styleEl);
            }
            const tracker = document.createElement('meta');
            tracker.id = 'db-style-tracker';
            document.head.appendChild(tracker);
        }
 
        const root = document.createElement('div');
        root.id = 'db-prompt-helper-root';
        root.style.cssText = 'position: fixed; z-index: 2147483647 !important; top: 0; left: 0; pointer-events: none; width: 100%; height: 100%;';
        if (currentTheme === 'dark') root.classList.add('db-dark-mode');
        
        // 注意：为 #db-main-panel 添加了动态边界约束：max-width 和 max-height，确保不管浏览器怎么缩小都不会越界
        root.innerHTML = `
            <!-- 悬浮球 -->
            <div id="db-float-btn" title="提示词助手 V2.5" style="position: absolute; bottom: 80px; right: 20px; width: 48px; height: 48px; background: var(--primary-color); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; cursor: pointer; box-shadow: 0 4px 12px var(--shadow-color); pointer-events: auto; user-select: none;">
                💡
            </div>
 
            <!-- 主面板 -->
            <div id="db-main-panel" style="display: none; position: absolute; bottom: 140px; right: 20px; width: 480px; height: 680px; min-width: 350px; min-height: 450px; max-width: calc(100vw - 40px); max-height: calc(100vh - 160px); background: var(--bg-main); border-radius: 12px; box-shadow: 0 8px 30px var(--shadow-color); flex-direction: column; border: 1px solid var(--border-color); overflow: hidden; pointer-events: auto; font-family: sans-serif;">
                
                <!-- 左上角自定义拖拽拉伸锚点 -->
                <div id="db-resize-handle" title="按住这里拖拽以调整窗口大小" style="position: absolute; top: 0; left: 0; width: 24px; height: 24px; cursor: nwse-resize; z-index: 10; background: linear-gradient(135deg, var(--primary-color) 40%, transparent 40%); border-top-left-radius: 12px;"></div>
 
                <div style="padding: 12px 16px 12px 30px; background: var(--bg-header); display: flex; justify-content: space-between; align-items: center; font-weight: bold; color: var(--text-main); border-bottom: 1px solid var(--border-color);">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span>📝 提示词助手 V2.5</span>
                        <div style="display: flex; gap: 4px;">
                            <button class="db-custom-btn" id="db-btn-theme" title="切换深色/浅色模式 (本站独立)" style="padding: 2px 6px; font-size: 11px; background: var(--bg-main); border: 1px solid var(--border-color); color: var(--text-sub);">${currentTheme === 'dark' ? '☀️' : '🌙'}</button>
                            <button class="db-custom-btn" id="db-btn-export" title="无痕导出到TXT文件" style="padding: 2px 6px; font-size: 11px; background: var(--bg-main); border: 1px solid var(--border-color); color: var(--text-sub);">导出TXT</button>
                            <button class="db-custom-btn" id="db-btn-import" title="从导出的TXT恢复数据" style="padding: 2px 6px; font-size: 11px; background: var(--bg-main); border: 1px solid var(--border-color); color: var(--text-sub);">导入TXT</button>
                            <input type="file" id="db-file-import" accept=".txt" style="display: none;" />
                        </div>
                    </div>
                    <span id="db-btn-close-panel" style="cursor: pointer; color: var(--text-sub); padding: 0 5px;">✕</span>
                </div>
                
                <!-- 标签搜索框 -->
                <div style="padding: 10px 16px 0; background: var(--bg-main);">
                    <input type="text" class="db-custom-input" id="db-tag-search-input" placeholder="🔍 搜索标签进行过滤...">
                </div>
 
                <div id="db-tags-container" style="padding: 10px 16px; display: flex; flex-wrap: wrap; gap: 6px; border-bottom: 1px solid var(--border-color); max-height: 80px; overflow-y: auto !important;"></div>
                
                <div id="db-list-container" style="flex: 1; overflow-y: auto !important; padding: 12px 16px; background: var(--bg-body);"></div>
                
                <div style="padding: 12px 16px; background: var(--bg-main); border-top: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 8px;">
                    <!-- 富文本添加框 -->
                    <div class="db-custom-input" id="db-add-content-rich" contenteditable="true" placeholder="输入新的提示词内容..." style="min-height: 60px; max-height: 150px; overflow-y: auto !important; white-space: pre-wrap; word-break: break-all;"></div>
                    
                    <div style="display: flex; gap: 8px; width: 100%;">
                        <button class="db-custom-btn" id="db-add-red-btn" style="background: var(--bg-red-light); color: var(--red-color); flex: 1; font-weight: bold;">标红选中文本</button>
                        <button class="db-custom-btn" id="db-add-black-btn" style="background: var(--bg-tag); color: var(--black-text); flex: 1; font-weight: bold;">标黑选中文本</button>
                    </div>
                    
                    <input type="text" class="db-custom-input" id="db-add-tags" placeholder="添加标签 (多个用逗号隔开，支持中英文)">
                    <button class="db-custom-btn" id="db-btn-save-new" style="background: var(--primary-color); color: #fff; width: 100%; font-weight: bold;">➕ 确认添加提示词</button>
                </div>
            </div>
 
            <!-- 模态框 (遮罩) -->
            <div id="db-modal-overlay" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: var(--modal-overlay); align-items: center; justify-content: center; pointer-events: auto; z-index: 9999999;">
                <div style="background: var(--bg-main); width: 500px; border-radius: 8px; padding: 20px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 10px 30px var(--shadow-color);">
                    <h3 id="db-modal-title" style="margin: 0; font-size: 16px; color: var(--text-main);">编辑提示词</h3>
                    
                    <!-- 统一使用的富文本编辑框 -->
                    <div class="db-custom-input" id="db-edit-content-rich" contenteditable="true" style="min-height: 200px; max-height: 400px; overflow-y: auto !important; white-space: pre-wrap; word-break: break-all;"></div>
                    
                    <div style="display: flex; gap: 8px; width: 100%;">
                        <button class="db-custom-btn" id="db-edit-red-btn" style="background: var(--bg-red-light); color: var(--red-color); flex: 1; font-weight: bold;">标红选中文本</button>
                        <button class="db-custom-btn" id="db-edit-black-btn" style="background: var(--bg-tag); color: var(--black-text); flex: 1; font-weight: bold;">标黑选中文本</button>
                    </div>
                    
                    <input type="text" class="db-custom-input" id="db-edit-tags" placeholder="标签 (中英文逗号均可)">
                    
                    <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
                        <button class="db-custom-btn" id="db-modal-cancel" style="background: var(--bg-tag); color: var(--text-sub);">取消</button>
                        <button class="db-custom-btn" id="db-modal-confirm" style="background: var(--primary-color); color: #fff;">保存</button>
                    </div>
                </div>
            </div>
        `;
 
        targetNode.appendChild(root);
 
        // --- 读取并应用跨域独立存储的窗口尺寸 ---
        const panel = document.getElementById('db-main-panel');
        const savedSize = GM_getValue(sizeKey, null);
        if (savedSize) {
            panel.style.width = savedSize.width + 'px';
            panel.style.height = savedSize.height + 'px';
        }
 
        // --- 左上角自定义拉伸逻辑 (加入了越界限制算法) ---
        const resizeHandle = document.getElementById('db-resize-handle');
        let isResizing = false;
        let startX, startY, startWidth, startHeight;
 
        const handleMouseMove = (e) => {
            if (!isResizing) return;
            
            let newWidth = startWidth + (startX - e.clientX);
            let newHeight = startHeight + (startY - e.clientY);
            
            // 动态边界判定：限制面板最大高度和宽度，防止鼠标拉过头超出窗口
            const maxWidth = window.innerWidth - 40; // 留出左/右安全边距
            const maxHeight = window.innerHeight - 160; // 留出顶部/底部安全边距
            
            if (newWidth > maxWidth) newWidth = maxWidth;
            if (newHeight > maxHeight) newHeight = maxHeight;
 
            if (newWidth >= 350) panel.style.width = newWidth + 'px';
            if (newHeight >= 450) panel.style.height = newHeight + 'px';
        };
        
        const handleMouseUp = () => {
            if (isResizing) {
                // 拖拽松手瞬间，保存此时的独立宽高到本地
                GM_setValue(sizeKey, {
                    width: parseInt(window.getComputedStyle(panel).width, 10),
                    height: parseInt(window.getComputedStyle(panel).height, 10)
                });
            }
            isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
 
        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = parseInt(window.getComputedStyle(panel).width, 10);
            startHeight = parseInt(window.getComputedStyle(panel).height, 10);
            e.preventDefault(); 
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
 
        // 绑定主题切换逻辑 (现已各域名独立)
        document.getElementById('db-btn-theme').addEventListener('click', () => {
            let theme = GM_getValue(themeKey, 'light');
            theme = theme === 'light' ? 'dark' : 'light';
            GM_setValue(themeKey, theme);
            
            if (theme === 'dark') {
                root.classList.add('db-dark-mode');
                document.getElementById('db-btn-theme').innerText = '☀️';
            } else {
                root.classList.remove('db-dark-mode');
                document.getElementById('db-btn-theme').innerText = '🌙';
            }
        });
 
        // 绑定悬浮球事件
        document.getElementById('db-float-btn').addEventListener('click', () => {
            panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
            renderUI();
        });
        document.getElementById('db-btn-close-panel').addEventListener('click', () => {
            panel.style.display = 'none';
        });
 
        // 标签搜索实时过滤
        document.getElementById('db-tag-search-input').addEventListener('input', () => {
            renderUI();
        });
 
        // 绑定导出逻辑
        document.getElementById('db-btn-export').addEventListener('click', () => {
            const promptsToExport = getPrompts();
            if (promptsToExport.length === 0) return alert('暂无提示词可导出！');
 
            let exportText = "【提示词助手 - 导出备份】\n=========================================\n\n";
            promptsToExport.forEach((p, index) => {
                const cleanContent = p.content.replace(/\{\{/g, '\u200C').replace(/\}\}/g, '\u200D');
                const tagsStr = p.tags.length > 0 ? p.tags.join(', ') : '无标签';
                exportText += `--- 提示词 ${index + 1} ---\n[标签]：${tagsStr}\n[内容]：\n${cleanContent}\n\n=========================================\n\n`;
            });
 
            const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const date = new Date();
            const dateStr = `${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2,'0')}${date.getDate().toString().padStart(2,'0')}`;
            a.download = `提示词备份_${dateStr}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
 
        // 绑定导入逻辑
        document.getElementById('db-btn-import').addEventListener('click', () => {
            document.getElementById('db-file-import').click();
        });
        document.getElementById('db-file-import').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                const fileText = event.target.result;
                const regex = /--- 提示词 \d+ ---\r?\n\[标签\]：(.*?)\r?\n\[内容\]：\r?\n([\s\S]*?)\r?\n\r?\n=========================================/g;
                let match, importedCount = 0;
                let currentPrompts = getPrompts();
                
                while ((match = regex.exec(fileText)) !== null) {
                    const tagsStr = match[1].trim();
                    const tags = tagsStr === '无标签' ?[] : tagsStr.split(/,|，/).map(t => t.trim()).filter(t => t);
                    let finalContent = match[2].replace(/\u200C/g, '{{').replace(/\u200D/g, '}}');
                    
                    if (!currentPrompts.find(p => p.content === finalContent)) {
                        currentPrompts.push({ id: uuidv4(), content: finalContent, tags: tags });
                        importedCount++;
                    }
                }
 
                if (importedCount > 0) {
                    GM_setValue('db_prompts_data', currentPrompts);
                    renderUI();
                    alert(`✅ 成功导入并添加了 ${importedCount} 条新的提示词！\n(已自动跳过列表内完全重复的项)`);
                } else {
                    alert('⚠️ 未发现新提示词。\n可能是文件格式不正确，或文件内的提示词你已经全部拥有了。');
                }
                e.target.value = '';
            };
            reader.readAsText(file);
        });
 
        // 绑定标红/标黑按钮
        document.getElementById('db-add-red-btn').addEventListener('mousedown', e => e.preventDefault());
        document.getElementById('db-edit-red-btn').addEventListener('mousedown', e => e.preventDefault());
        document.getElementById('db-add-black-btn').addEventListener('mousedown', e => e.preventDefault());
        document.getElementById('db-edit-black-btn').addEventListener('mousedown', e => e.preventDefault());
        
        document.getElementById('db-add-red-btn').addEventListener('click', () => insertRedTextRich('db-add-content-rich'));
        document.getElementById('db-edit-red-btn').addEventListener('click', () => insertRedTextRich('db-edit-content-rich'));
        document.getElementById('db-add-black-btn').addEventListener('click', () => insertBlackTextRich('db-add-content-rich'));
        document.getElementById('db-edit-black-btn').addEventListener('click', () => insertBlackTextRich('db-edit-content-rich'));
 
        document.getElementById('db-add-content-rich').addEventListener('paste', handlePasteAsPlainText);
        document.getElementById('db-edit-content-rich').addEventListener('paste', handlePasteAsPlainText);
 
        // 绑定添加逻辑
        document.getElementById('db-btn-save-new').addEventListener('click', () => {
            const contentRich = document.getElementById('db-add-content-rich');
            const content = getRawContentFromRich(contentRich).trim();
            const tagsStr = document.getElementById('db-add-tags').value.trim();
            if (!content) return alert('内容不能为空！');
            
            const tagsArray = tagsStr.split(/,|，/).map(t => t.trim()).filter(t => t);
            let currentPrompts = getPrompts();
            currentPrompts.push({ id: uuidv4(), content: content, tags: tagsArray });
            GM_setValue('db_prompts_data', currentPrompts);
            
            contentRich.innerHTML = '';
            document.getElementById('db-add-tags').value = '';
            renderUI();
        });
 
        // 模态框确认/取消逻辑
        document.getElementById('db-modal-cancel').addEventListener('click', () => {
            document.getElementById('db-modal-overlay').style.display = 'none';
        });
 
        document.getElementById('db-modal-confirm').addEventListener('click', () => {
            const editContentRich = document.getElementById('db-edit-content-rich');
            let newContent = '';
            
            if (isTempEditMode) {
                newContent = editContentRich.innerText.trim().replace(/\u200B/g, '');
            } else {
                newContent = getRawContentFromRich(editContentRich).trim();
            }
 
            const editTags = document.getElementById('db-edit-tags');
            const modalConfirm = document.getElementById('db-modal-confirm');
            const overlay = document.getElementById('db-modal-overlay');
 
            if (!newContent) return alert('内容不能为空');
 
            if (isTempEditMode) {
                navigator.clipboard.writeText(newContent).then(() => {
                    const originalText = modalConfirm.innerText;
                    modalConfirm.innerText = '✔️ 复制成功！';
                    setTimeout(() => {
                        modalConfirm.innerText = originalText;
                        overlay.style.display = 'none';
                    }, 1000);
                }).catch(err => {
                    alert('复制失败，请手动复制输入框里的内容。');
                });
            } else {
                const newTags = editTags.value.split(/,|，/).map(t => t.trim()).filter(t => t);
                let currentPrompts = getPrompts();
                const index = currentPrompts.findIndex(p => p.id === currentEditId);
                if (index > -1) {
                    currentPrompts[index].content = newContent;
                    currentPrompts[index].tags = newTags;
                    GM_setValue('db_prompts_data', currentPrompts);
                    renderUI();
                }
                overlay.style.display = 'none';
            }
        });
 
        renderUI();
        console.log("🎉【提示词助手 V2.5】悬浮窗注入成功！");
    }
 
    // --- 单页应用(SPA)幽灵路由变化侦测 ---
    if (window.onurlchange === null) {
        window.addEventListener('urlchange', () => {
            setTimeout(initApp, 500);
        });
    }
 
    // --- 强力轮询防清理机制 ---
    setInterval(() => {
        if (document.body && !document.getElementById('db-prompt-helper-root')) {
            initApp();
        }
    }, 1000);
 
})();