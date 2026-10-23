# 口袋文明

口袋文明位于 `apps/applications/builtins/pocket-civilization`，使用应用自有页面呈现固定斜俯视的分层小岛。居民、局部雨云、花朵、手账、法则卷轴和可编辑手册独立于场景底图，支持缩放、暂停演出、查看居民和翻阅事件。

## 游玩流程

从第7天的雨点镇开始。点击卷轴的「改写」，在手册右页写下新的法则，例如「说真话的人，身边会开花。」。写下后仍停在当天；卷轴同时显示现行法则与下一天生效的新法则，支持撤回。点击「推进一天」后，居民动作、对白、场景效果和手账一起更新。

首版支持真话、故意说谎、帮助和真诚夸奖四类条件，以及局部下雨、脚边开花两种效果。复杂的否定、例外或复合条件不会被静默简化。重复真话种花会引出岛民请愿，玩家可以决定「重复的真话不再开花」或「每次真话都算」；解释从下一天生效。

「故事模式」使用明确标注的手写情节，不调用模型。初次打开即可体验法则、请愿和历史延续。点击右上手册，进入「游玩」可以连接「智能演绎」并选择宿主中已经配置的模型。

## 智能演绎

智能演绎复用公开的应用 Chat SDK 创建无界面会话。当前应用的默认工作区由数据 SDK 获取，模型与启用的插件由现有宿主解析。应用不直接读取凭据，也不导入判断插件内部实现。

每次推进先生成至多3件居民行动，再通过现有结构化插件命令 `mewvis.decisions/evaluate` 判断法则是否触发。该命令在现有 Agent Runtime 中直接分发。应用校验命令返回的结果、状态和依据；`accepted` 与判断值分别处理，`review_required`、`abstained` 或错误不会被当作成功，也不会退回固定故事。

判断插件在现有策略下可能要求宿主确认。应用沿用会话授权并显示「请到 Mewvis 主窗口确认这次智能判断」，不提供审批入口。插件未启用、模型缺失、取消、超时或结果格式不完整时保留原来的日期、法则和存档。

## 数据与边界

世界状态在当前应用的 `application-data` 中保存到单个版本化记录；模型演绎结束并通过校验后才整体提交新一天。演绎会话引用单独保存。关闭界面会取消正在等待的演绎并释放观察，聊天历史由已有宿主管理。

应用声明 `application-data`、`application-workspaces` 和 `chat`，不提供文件、网络或程序执行工具。实现和美术素材归本应用；宿主协议、公共 SDK、Agent Runtime 和判断插件实现不因本应用改变。

## 开发与验证

在仓库中运行：

```sh
pnpm --filter @mewvis/pocket-civilization dev --port 5186
pnpm --filter @mewvis/pocket-civilization check
pnpm --filter @mewvis/pocket-civilization test
pnpm --filter @mewvis/pocket-civilization test:runtime
pnpm --filter @mewvis/pocket-civilization build
pnpm --filter @mewvis/builtin-applications build
pnpm --filter @mewvis/pocket-civilization preview:packed
```

开发预览提供隔离的内存工作区与存储，适合验证故事模式与界面。真实模型和插件使用 Mewvis 内的应用会话。`test:runtime` 使用临时数据目录、真实 Runtime 与判断插件、隔离本地模型桩，并模拟测试用户在宿主确认调用；不读取用户模型配置或消耗付费模型。

`preview:packed` 在 `http://127.0.0.1:5187/` 加载已构建的应用 UI，使用与宿主相同的沙盒文档和公开 SDK 桥接、隔离内存数据。视觉对比与交互验收记录位于应用目录的 `design-qa.md`。请愿与解释绑定当时的法则，新法则不会继承旧解释。
