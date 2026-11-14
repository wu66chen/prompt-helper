# 开发指南

[返回首页](../README.md)

普通安装直接使用 [`prompt-helper.user.js`](../prompt-helper.user.js)，不需要构建环境。

## 准备环境

- Git、Node.js 与 npm。
- 当前锁定的 Playwright 依赖要求 **Node.js ≥20**，见 [`package-lock.json`](../package-lock.json) 的 `engines` 字段。项目自身未声明独立的 Node.js 版本范围。
- 浏览器检查使用本机 **Google Chrome**，通过 Playwright 的 `chrome` channel 启动。

本次文档核验使用 Windows、Node.js 24.19.0、npm 11.17.0 和本机 Chrome。其他浏览器及真实坚果云账户连接不属于这些自动化检查的覆盖范围。

## 获取、构建与检查

在希望保存项目的目录执行以下命令：

```sh
git clone https://github.com/wu66chen/prompt-helper.git
cd prompt-helper
npm ci
npm run build
npm test
npm run test:ui
```

构建生成根目录的 `prompt-helper.user.js`，将源码、样式和 PNG 图标打包到一个脚本内；不依赖旧版备份文件。浏览器检查使用隔离的示例页面和模拟 GM 接口，不会操作个人提示词库。

专项检查：

| 命令 | 检查内容 |
| --- | --- |
| `npm test` | 数据合并、变量与搜索逻辑、窗口几何、WebDAV 版本校验、域名规范化与匹配 |
| `npm run test:ui` | 编辑、复制、草稿、导入导出、冲突和界面流程 |
| `npm run test:launcher` | 尺寸预览、保存、四角展开、刷新恢复与边界 |
| `npm run test:settings` | 跨网站设置共享、布局适配、未完成表单保护 |
| `npm run test:sites` | 网站启停、默认规则与自定义规则、跨站共享、菜单恢复、未启用网站不加载与 HTTP 兼容 |
| `npm run test:tools` | 工具编辑、原样复制变量、恢复内置、增删撤销、跨页并行编辑保护、草稿和窄窗口 |
| `npm run test:tool-sync` | 旧工具迁移、模拟双设备 WebDAV、JSON 导入导出、工具冲突与删除保护 |
| `npm run test:editor` | 网页冒泡 / 捕获快捷键干扰、真实剪贴板粘贴、中文组合输入、撤销、红色变量和滚动对齐 |
| `npm run test:masonry` | 排列切换、等宽与不重叠、标题完整、最短列补位、展开、搜索、主题和响应式布局 |
| `npm run test:clipboard` | 用事件式 GM 桥接写入真实系统剪贴板，验证所有复制入口、回退、超时、空内容和手动复制；会替换运行机器的剪贴板内容 |
| `npm run test:window` | 窗口与入口对齐、拖动、标签布局和视口约束 |
| `npm run test:controls` | 缩放边角与收起方式 |
| `npm run test:sidebar` | 侧栏操作和分组颜色 |
| `npm run test:motion` | 微动效与减少动态效果 |
| `npm run test:tooltip` | 侧栏名称提示 |
| `npm run test:sync` | 模拟坚果云兼容性与同步状态 |

WebDAV 检查使用模拟服务，不替代真实账户的连接测试。`artifacts/` 中产生的截图和测试导出文件已被 Git 忽略。

## 项目结构

```text
src/                     界面、样式、图标与数据逻辑
tests/                   核心和浏览器检查
assets/                  README 截图与展示素材
docs/                    使用、同步与开发文档
userscript-matches.json  默认启用的站点清单（构建时合并重复父子域名）
build.cjs                单文件脚本构建入口
prompt-helper.user.js    可安装的构建产物
```

修改源文件后重新构建，并运行与修改相关的检查。提交时同步更新构建产物，说明行为变化和验证结果。请勿提交个人提示词备份、账号、应用密码或测试账户凭据。

3.11.0 的数据格式为 v4，新增 `tool` 操作类型；读取兼容 v3，写入采用 v4，云端路径保持不变。工具与普通提示词使用同一历史合并、删除标记和 CAS 同步机制。旧 `ph3_tool_*` 本地记录只迁移一次且保留原值。编辑高亮以原生 textarea 叠加只读着色层实现；焦点隔离测试使用模拟宿主网页，不替代所有在线网站的实际兼容性检查。

网站启动逻辑位于 `src/entry.js`，纯域名规则位于 `src/sites.cjs`。脚本的 `@match` 覆盖 HTTP / HTTPS；启动层先读取独立的 `ph3_sites_global` 设置，再决定是否调用资料库界面。未启用网站只注册恢复菜单，用户主动打开该菜单时才加载界面。修改网站规则不会卸载当前页面中的界面，刷新后生效；后续自动同步会先检查当前网站是否启用。
