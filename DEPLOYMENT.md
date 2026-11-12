# 部署

## 本地运行

按 README 安装、构建并启动。`PORT` 默认为 `3210`，服务只监听 `127.0.0.1`。SQLite 数据保存在 `.local/d1/`。本地 `/admin` 仅供本机管理。

## Cloudflare Pages

前端、AI HTTP API 和榜单共用 Pages 域名。D1 绑定 `DB` 仅用于榜单；会话使用 `CUBE_SESSIONS` Durable Object 绑定。无需 Sites 后端。使用 Node.js 24、pnpm 11.25 和 Wrangler 4.160.0。

```sh
pnpm build:cloudflare
pnpm dlx wrangler@4.160.0 deploy --config wrangler-relay.json
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

## WebSocket 推送

`relay-worker.js` 在独立 Worker `llm-cube-relay` 导出 SQLite Durable Object `CubeSession`；Pages 通过 `wrangler.json` 的跨脚本绑定访问。先部署 relay，再部署 Pages；独立复制部署时须同步修改两份 Wrangler 配置中的 script_name。Wrangler 需要 Pages、D1 与 Workers 部署权限。relay 无公开 workers.dev 地址。

浏览器按需建立 WebSocket，凭证通过连接内的认证消息发送，不放入 URL。AI 继续使用 HTTP API。指令与结果直接推送，空闲无应用层心跳、轮询或定时数据库写入；连接由 Hibernation API 托管。网络断开后才触发重连，未确认指令不自动重放。会话 24 小时过期，由一次性 Alarm 清理。

旧轮询端点返回 410。升级后刷新页面并重新复制连接信息，旧会话码不会迁移。`pnpm start` 使用本机 Miniflare + WebSocket 桥运行相同协议。
