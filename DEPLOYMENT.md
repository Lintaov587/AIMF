# 部署

## 本地完整版本

执行 README 中的安装、构建和启动命令。`PORT` 可指定端口，默认 `3210`。SQLite 数据与迁移记录保存在 `.local/d1/`，服务重启后保留；不要将 `.local/` 发布到仓库。

`/admin` 是仅在本机可访问的管理界面。它使用本地适配器身份；请勿将此 loopback 适配器直接改为公网监听。

## GitHub Pages 前端

先执行 `pnpm build`，再明确指定 Pages 子路径和后端地址：

```sh
PAGES_BASE=/llm-cube-challenge/ PAGES_BACKEND=https://cube-coop-lintao.miniatureagate1.chatgpt.site node build-pages.mjs
```

PowerShell：

```powershell
$env:PAGES_BASE='/llm-cube-challenge/'
$env:PAGES_BACKEND='https://cube-coop-lintao.miniatureagate1.chatgpt.site'
node build-pages.mjs
```

在仓库 Settings → Pages 选择 GitHub Actions。推送到 main 后，`.github/workflows/pages.yml` 自动构建并发布 `docs/`；生成目录不提交到 Git。构建产物包含 `.nojekyll`，无需服务端或 Jekyll。

如果使用自己的后端，需在后端 `ALLOWED_ORIGINS` 中加入 Pages 的精确 origin，例如 `https://your-name.github.io`。只允许游戏会话、AI 接口和榜单读取跨域，不开放后台管理或 MCP 跨域访问。用户会话凭证仍然独立校验。

## 云端后端

`worker.js` 是 Cloudflare Worker ESM 源码，`pnpm build` 输出 `dist/server/index.js`。需要 D1 绑定 `DB` 并应用 `drizzle/` 的迁移。`.openai/hosting.json` 是不含 Site 身份的部署模板；在自己的 Sites 注册后填入其返回的 project_id。

Sites 管理员身份由平台提供的已验证请求头决定，`ADMIN_EMAIL` 应配置为站点所有者邮箱并存为服务端 Secret。项目不包含原站点的管理员凭证、数据库数据或运行会话。

AI HTTP 接口是 `/api/ai/state` 与 `/api/ai/action`，使用本局会话码。接口契约为 `/api/ai/schema`；`/mcp` 是可选的 Sites MCP 集成。
