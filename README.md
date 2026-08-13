# 一条消息的旅行 · Journey of a Message

钻进 Coding Agent 的身体里看一看 —— [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的交互式源码科普。

**在线访问:<https://chendahuang.com/dsh>**

你每天都在用 AI 编程助手。但按下回车的那一秒,你的这句话到底去了哪里?
这个网站让你跟着一条消息,用七幕 3D 场景走完它在一个生产级 Agent 内部的旅程:

| 幕 | 场景 | 讲的概念 |
| --- | --- | --- |
| 序 | 消息粒子启程 | — |
| 1 | 插件宇宙 | 一切皆插件(Cordis 插件系统、cordis.yml) |
| 2 | 装配车间 | 能力接缝:接口 / 实现 / 使用者三件套 |
| 3 | 主循环之心 | Agent 主循环:想 → 做 → 看结果 → 再想 |
| 4 | 黑匣子之河 | 会话事件日志:append-only,模型可见即可重建 |
| 5 | 压缩熔炉 | Compaction:上下文压缩,摘要覆盖但原件保留 |
| 6 | 分身与闸门 | 子代理委托 + 危险操作审批 |

每一幕的科普文案都对应 DeepSeek Harness 仓库里的真实实现,想精读源码可以直接去仓库:
[架构文档](https://github.com/deepseek-ai/deepseek-harness/tree/master/docs)。

## 技术栈

- [Astro](https://astro.build) — 静态站点骨架,产物全部静态化
- [Three.js](https://threejs.org) — 每幕一个独立 3D 场景,按幕代码分割、滚动到可视区才懒加载
- [GSAP ScrollTrigger](https://gsap.com) — 卷轴叙事驱动(滚动进度 scrub 场景运镜)
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) — 托管在 `chendahuang.com/dsh` 子路径

## 本地开发

```sh
pnpm install
pnpm dev        # astro dev,http://localhost:4321/dsh
pnpm build      # 构建到 dist/(含子路径重排,见 scripts/finalize-dist.mjs)
pnpm deploy     # 构建并 wrangler deploy
```

## 场景架构

每幕场景是一个 `SceneFactory`(`src/scenes/<name>.ts`),实现统一的 `SceneHandle` 契约
(`src/scenes/types.ts`):`start` / `stop` / `setProgress` / `dispose`。
框架(`src/lib/scene-manager.ts`)负责按幕代码分割、离屏暂停渲染、把 ScrollTrigger
的滚动进度喂给场景。场景状态尽量设计为 progress 的纯函数,保证 scrub 来回滚动不穿帮。

## License

代码:[MIT](./LICENSE)。文案与 DeepSeek Harness 的引用内容归各自权利人所有。
