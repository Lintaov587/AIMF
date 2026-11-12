# 部署

## 本地运行

按 README 安装、构建并启动。`PORT` 默认为 `3210`，服务只监听 `127.0.0.1`。SQLite 数据保存在 `.local/d1/`。本地 `/admin` 仅供本机管理。

## Cloudflare Pages

前端、AI HTTP API 和榜单共用 Pages 域名，D1 绑定名为 `DB`。无需 Sites 后端。使用 Node.js 24、pnpm 11.25 和 Wrangler 4.160.0。

```sh
pnpm build:cloudflare
pnpm dlx wrangler@4.160.0 d1 migrations apply DB --remote
pnpm dlx wrangler@4.160.0 pages deploy cloudflare-dist --project-name llm-cube-challenge --branch main
```

首次独立部署时，先登录 Wrangler，创建自己的 D1 与 Pages 项目，将 `wrangler.json` 中的名称和 database_id 换为自己的资源。Pages 项目创建使用 `wrangler pages project create <name> --production-branch main --force`；现有项目后续命令不加 `--force`。

`build:cloudflare` 将静态资源交给 CDN，API 编译为 `_worker.js`。`_routes.json` 只让会话、AI、榜单和管理请求进入 Worker，普通资源访问不调用 API Worker。

## 榜单后台

打开 `/admin`，输入管理密钥。原始密钥为加密安全随机生成的 32 字节十六进制字符串，只保存在管理员本机，不放在前端、仓库或 URL。

Cloudflare Pages 的生产 Secret `ADMIN_TOKEN_HASH` 保存该密钥文本的 SHA-256 十六进制摘要。可用 `wrangler pages secret put ADMIN_TOKEN_HASH --project-name <name>` 设置；更新 Secret 后重新部署。每次管理请求都验证密钥，浏览器仅在当前页面内存中保存。刷新后需重新输入。

Cloudflare 适配器不信任客户端传入的 Sites 身份头，管理请求也不允许跨域。Cloudflare 版本使用 HTTP AI 接口，`/mcp` 不开放。

## AI 接口

`GET /api/ai/state` 与 `POST /api/ai/action` 使用 `Authorization: Bearer <本局会话码>`。接口契约位于 `/api/ai/schema`。会话码由当前游戏页面生成，玩家之间独立，页面关闭后结束。

`.local/`、`.env*`、`.wrangler/` 和生成目录均不提交。不要公开管理密钥、Cloudflare 登录凭证或活动会话码。
