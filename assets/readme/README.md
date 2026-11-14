# 仓库展示素材

[返回项目首页](../../README.md)

| 文件 | 用途 |
| --- | --- |
| [seal.png](seal.png) | 已确认的 B2 半透明树脂海豹透明母稿，1024 × 1024 |
| [seal-banner-light.png](seal-banner-light.png)、[seal-banner-dark.png](seal-banner-dark.png) | 1280 × 320 海豹首页横幅，通过 picture 随浅深主题选择 |
| [window-light.png](window-light.png)、[window-dark.png](window-dark.png) | 3.8.2 的实际界面，使用示例数据与本地演示背景 |
| [settings-light.png](settings-light.png) | 悬浮图标尺寸设置示例 |
| [seal-layout.html](seal-layout.html) | 横幅与分享图的排版源文件，直接引用海豹透明母稿 |
| [render.cjs](render.cjs) | 在开发环境中重新导出展示图的脚本 |
| [social.png](social.png) | 1280 × 640、不透明的海豹分享预览图，小于 1 MB |

横幅与分享图使用同一只海豹，不改变角色造型或树脂材质。排版使用系统字体，不请求外部资源；PNG 导出可避免 GitHub 图片环境的字体与外链限制。对应标题和标语也保留为首页的 Markdown 正文。

在项目根目录完成开发环境的 `npm ci` 后，可用以下命令重新生成两张横幅和分享图（需要本机 Google Chrome）：

```sh
node assets/readme/render.cjs
```

分享图可在 GitHub 仓库的 Settings → General → Social preview → Edit → Upload an image 上传；仅提交 PNG 不会自动设置仓库分享图片。

## About 与 Topics

以下内容已通过 GitHub API 应用到仓库，简介与首页说明一致。

**Description**

```text
面向经常使用 AI 网页的用户，在不同网站间保存、整理和复用提示词的 Tampermonkey 脚本；本地保存，按需连接坚果云。
```

**Topics**

```text
javascript, tampermonkey, userscript, prompt-management, webdav
```

项目暂无独立文档网站，因此不设置 Website。
