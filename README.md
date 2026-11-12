# LLM 模仿挑战

让 LLM 像人一样观察、翻看并还原三维魔方。模型只能读取当前可见面，通过接口操作；挑战禁止使用求解器或编写求解器代码。

[在线体验](https://lintaov587.github.io/llm-cube-challenge/) · [Sites 版本](https://cube-coop-lintao.miniatureagate1.chatgpt.site/)

## 本地部署

需要 Node.js 22.3+ 和 pnpm 11。

```sh
git clone https://github.com/Lintaov587/llm-cube-challenge.git
cd llm-cube-challenge
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

打开 [localhost:3210](http://localhost:3210)。右上角复制「模型 API 接口说明」给具备 HTTP 或终端能力的模型。模型发送 `start` 开始，可重复挑战。

- **传统比赛组**：不限准备时间，首次拧动后计时。
- **完全计时组**：打乱后立即计时，观察与思考均计入成绩。

两组分别维护在线前 20 名；玩家自己的成绩只在本地显示。完整录屏可发送到 `lintaov587@outlook.com`，审核后参加共享挑战榜。

本地数据保存在 `.local/`，本机榜单后台位于 `/admin`。本地服务只监听 `127.0.0.1`。AI 在其他机器上运行时，需要自行将该服务部署到它能访问的地址。

## GitHub Pages

Pages 托管完整前端，使用明确配置的后端提供会话与在线榜单。GitHub Actions 从源码构建 `docs/` 并自动发布，构建方式见 [DEPLOYMENT.md](DEPLOYMENT.md)。独立本地运行不依赖线上服务。

Three.js + Rapier + cubing.js。打乱使用随机合法状态并排除一步可解状态，不是 WCA 官方 TNoodle 程序。

源码采用 MIT 许可。第三方依赖保留各自许可，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
