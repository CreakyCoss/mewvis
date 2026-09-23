# 插件协议与能力映射

Isle 以 Pi 的扩展能力为基准，设计自己的插件协议、SDK 和运行时。插件作者面向 Isle 开发；Pi、脚本 Mock 和后续 Agent 通过适配 Isle 协议使用这些插件。目标是建立完整、可分能力实现的扩展模型；当前已有资源、状态、观察事件、会话实例、输入/工具中间件及压缩控制钩子，仍是 Pi 能力的部分实现。

系统提供两个方向的适配：Agent 适配器将 Isle 插件定义转换成底层 Agent 可按自身标准注册的原生插件；生态兼容适配器将 Pi 等生态的原生插件接入 Isle。两者分别维护，插件协议本身不依赖任何具体 Agent 的接口或类型。

本文的「目标设计」描述尚未全部实现的架构；「当前状态」和「当前实现边界」记录实际代码能力。目前没有 Pi 原生插件兼容层。

## SDK 目录与入口

`packages/extension/sdk/index.d.ts` 统一定义插件清单、`ExtensionModules` 和配置；按需声明 `agent`、`ui`。[插件 SDK 能力与目录](../extensions/sdk.md)提供当前能力表与阅读导航。

- `agent/`：Agent 上下文与生命周期、工具/技能/命令、事件、中间件、会话契约及编写辅助函数。
- `ui/`：UI 模块、通用插槽与贡献、受控数据服务；浏览器 DOM 挂载单独定义在 `browser.d.ts`。
- `host/`：加载来源、宿主执行绑定、Agent 适配契约与能力协商；不属于可执行插件模块。
- `shared.d.ts`：跨领域基础类型；`manifest.schema.json` 和 `ui/contribution.schema.json` 负责校验。

对外提供统一 `@isle/extension-sdk` 入口，以及 `/agent`、`/ui`、`/host` 领域入口。类型与相关实现按领域共置，不维护平行的 types/runtime 目录树；内部不反向导入 SDK 总入口。旧 `/ui-slots` 和 `/ui-contribution.schema.json` 路径已移除。

## 当前模块化加载

清单 v2 按 `modules.agent` 与 `modules.ui` 声明可选入口；共享插件 ID、版本、配置与启停。包管理只校验元数据，Agent 来源解析只输出 Agent 模块。只接受模块化清单，不提供旧结构转换，也不将 UI 能力传给 Agent 适配器。

```text
插件目录 → 清单校验与配置
           ├─ modules.agent → Agent Worker → Pi / Mock 适配器
           └─ modules.ui    → 桌面 session.sidebar 插槽 → 隔离 iframe
                                               ↓ MessageChannel
                                      Server 视图租约与能力校验
                                               ↓
                                      宿主会话读取与公开 DTO
```

`packages/extension/sdk/ui/slots.js` 是 UI 插槽协议源，生成贡献 Schema 和 `slots.generated.d.ts`，`slots.d.ts` 定义编写辅助与宿主上下文。协议定义 `key`、`type`、`scope` 与贡献字段，不依赖 React 或具体布局。当前有 `session.sidebar`（`sidebar`）和 `session.status`（`text`）；未知插槽、类型、字段或不匹配的 key/type 在清单校验时被拒绝。

`modules.ui.contributions` 声明贡献。纯文本模块不需要 JS 入口；包含 `view` 引用时必须声明 `entry`。页面在普通 TSX 布局中预留具体 Slot，并提供渲染方法：

```text
SDK 插槽协议 → 插件声明 contributions
                       ↓
Server 贡献目录 → ExtensionHost 绑定可执行视图
                       ↓
ExtensionSlotProvider（提供贡献数据，不注册布局）
                       ↓
页面 SidebarSlot / TextSlot（或通用 ExtensionSlot）
                       ↓
页面 render / renderAll → 预留位置中的插件内容
                       ↓ 按需调用 renderView()
                 独立的插件视图实例
```

客户端插件能力统一放在 `apps/client/src/extensions/`。`slots/` 承载无布局的插槽机制与具体类型接口，`views/` 承载插件视图的隔离执行；页面不依赖插件管理页面。

```text
extensions/
├── index.tsx             # ExtensionHost：组合贡献目录、视图绑定与 Provider
├── catalog.ts            # 订阅插件贡献目录
├── contributions.tsx     # 按内容契约绑定通用视图加载器
├── slots/
│   ├── index.tsx         # ExtensionSlot、Provider、渲染类型与上下文
│   ├── sidebar.tsx       # SidebarSlot：标题、图标和视图引用
│   ├── text.tsx          # TextSlot：结构化 text / tone 字段
│   └── icons.tsx         # 可供页面使用的协议图标映射
└── views/                # 隔离 iframe、通信及租约生命周期
```

前端依赖按职责划分：

- `ExtensionHost` 订阅目录并提供绑定后的贡献，视图加载不按 sidebar/text 类型分支。只有带 `view` 的贡献才绑定加载器。
- `ExtensionSlot` 根据定义筛选贡献、绑定作用域并调用页面的渲染函数，不生成固定布局、标题栏或样式。
- `SidebarSlot` 和 `TextSlot` 分别约束定义与渲染参数的类型；位置定义与贡献必须匹配。没有专用封装时可直接使用通用 `ExtensionSlot`，参数仍由定义推导。
- `render(item)` 逐项渲染，Slot 管理列表 key；`renderAll({ items, error })` 将插件条目交给页面组织，只渲染预留的扩展区域，两者互斥。
- 单项模式的 `fallback` 和 `renderError` 由页面决定空状态和错误展示；集合模式在空集合或目录异常时也调用 `renderAll`，页面自行处理。
- Slot 只从宿主读取插件贡献，不接受页面传入 `contributions`。`workbench/pages/chats/panels/index.tsx` 直接编写原生工具栏和文件、版本、链路内容，通过普通页面组件组合面板；在原生面板声明之后预留一个 `SidebarSlot`。Slot 不包裹整个页面，也不接管原生面板。`layout.tsx` 提供 `ChatPanels` 和 `ChatPanel`；每个面板一次声明图标、标题与内容，组件统一管理选择，并通过 portal 安排内容位置。它不依赖插件协议或 Slot 类型，也不识别具体业务面板。
- `workbench/pages/extensions/` 只承担插件管理。

页面可以不挂载插槽或返回 `null`，不再维护全局 UI 适配器注册表，也没有由注册状态推断的 `supported/noop/unsupported`。`useExtensionSlotStatus(definition)` 只返回该定义的挂载数量；挂载插槽不等于打开插件视图。诊断仅供宿主使用，未通过 iframe SDK 暴露。

`renderView()` 已绑定该贡献的视图引用和当前页面作用域，只有页面实际渲染返回值时才挂载实例。同一个插件贡献可在多个位置以不同样式展示，各处实例独立；工作区、会话或视图引用改变时旧实例卸载。关闭、切换、停用或移除贡献会清理 iframe 与视图租约。聊天页的 Slot 始终挂载，由 `render` 将完整条目适配成普通 `ChatPanel`；选择和延迟挂载由 `ChatPanels` 与 `ChatPanel` 统一处理；没有匹配贡献时不渲染插件内容，不自动切换到其他面板。

结构化内容由具体协议定义，不能通过任意 `data` 绕过契约。当前 `TextSlot` 的 `text/tone` 由页面直接绘制；sidebar 的内部视图由插件绘制。未来需要表格、卡片等结构化内容时，先在对应类型声明准确的数据结构，再由页面选择渲染方式，不假定所有视图都能转换成结构化数据。

新增同类插件贡献不修改页面；新增协议类型先修改 `ui/slots.js` 并运行 SDK `generate`，按需提供专用 Slot，再由页面传入 render 挂载。无需新增全局注册项；如果需要新的受控服务或执行方式，仍需实现相应宿主边界。当前没有后台插件代码入口、任意页面注入或动态文本更新 API。

sidebar 协议必须提供 `title`、语义图标 `icon` 和 `view: { id }`。图标是受控名称，不接收 React 组件、HTML 或资源 URL。浏览器上下文以 `contributionId` 与 `viewId` 区分贡献与入口内部视图，Server 校验请求引用确实存在于已启用插件的清单中。

聊天侧栏不内置插件命令管理或执行面板，启停与配置集中在插件管理页。宿主 SDK 和 Agent 的命令能力继续保留；有交互需求时再通过插件提供界面，并按需扩展受控宿主接口。

`apps/extensions/session-insights` 是纯 UI 示例，通过 `session.read` 查询当前会话的公开消息和关联运行。权限由 Server 重检，配置和启停变更撤销已有视图租约，数据读取过程中停用也不会继续返回数据。宿主账本与存储实现保持原职责。

## 目标结构

```text
Isle 原生插件 ────────────────────┐
Pi 原生插件 → Pi 导入适配器 ────────┤
其他生态插件 → 对应导入适配器 ──────┤
                                 ↓
                      Isle 插件协议 / SDK
                                 ↓
                      目标 Agent 插件适配器
                         ├── Pi 原生插件定义 → Pi 标准注册
                         ├── Mock 插件定义 → Mock 注册与执行
                         └── 其他 Agent 插件定义 → 该 Agent 标准注册

Isle 宿主服务：包管理、配置、权限、持久化和桌面 UI
    ↑ 由插件适配器按需要桥接，供原生插件代理调用
```

包构建、注册、配置和启停是这套系统的分发管理入口，插件运行时和 Agent 适配器不承担包安装职责。

`packages/extension/sdk` 定义插件契约和清单 JSON Schema；`packages/extension/host` 管理本地包元数据与宿主设置；`packages/extension/dev` 提供开发 CLI。与 Agent 执行、安全沙箱耦合的 worker 宿主仍位于 `apps/agent-runtime/src/extensions`。

该宿主模块按核心生命周期、可扩展能力和执行机制组织：

```text
extensions/
├── index.ts             # 定义 ExtensionRuntime，创建宿主并管理生命周期
├── types.ts             # 操作、命令及诊断类型
├── sources.ts           # 来源校验与快照
├── capabilities/        # 随插件协议演进的能力模块
│   ├── commands.ts      # 命令发现与调用
│   ├── resources.ts     # 工具、命令、技能注册及结果校验
│   ├── middleware.ts    # 中间件契约校验
│   └── events.ts        # 观察事件校验
├── session/             # 跨操作的实例与持久状态
│   ├── pool.ts          # 会话实例池与借用队列
│   └── state.ts         # 状态持久化与文件锁
└── execution/           # 单次操作与隔离执行机制
    ├── operation.ts     # 执行资源、审批、RPC 和事务协调
    ├── host.ts          # worker 内插件加载、注册与调用
    └── worker.ts        # 独立进程入口，由构建配置引用
```

外部模块仅从 `extensions/index.ts` 导入，其唯一运行时导出为 `createExtensionRuntime()`。入口本身定义 `ExtensionRuntime` 接口并组装宿主，持有实例池、协调释放和终态恢复；提供 snapshotSources、bindCommands、open、releaseSession、dispose 和生命周期 signal。open 返回 `ExtensionOperation`，在 SDK 的 `ExtensionBindings` 上增加 finish 与 dispose。Agent 只声明运行终态，取消后是否重建 worker、如何保持队列顺序和恢复通知由宿主决定。finish 最多投递一次，调用方仍须在 finally 中 dispose，释放借用。

`runtime.bindCommands()` 将命令能力绑定到同一个宿主实例，提供已有 SDK/stdio 命令接口；`runtime.snapshotSources()` 提供来源快照。相对稳定的实例所有权与操作生命周期收敛于核心入口，具体能力校验和命令行为放在 `capabilities/`，后续扩展按实际职责增加模块。`session/` 与 `execution/` 分别封装跨操作状态及执行机制，不以一个笼统的 internal 目录承载全部实现。worker 是进程入口，宿主侧的统一接入入口仍为 index。

入口不导出会话池、状态目录、worker、校验器或底层执行资源。白盒测试可以直接验证子模块；产品代码不依赖这些路径。这里的宿主接入类型与 `@isle/extension-sdk` 面向插件作者、Agent 适配器的通用协议职责不同。

`apps/extensions/text-stats` 和 `apps/extensions/tasks` 是独立插件包，分别演示工具与技能、命令与状态事件。构建时扫描 `apps/extensions/` 的插件包，独立打包到 Runtime 的 `dist/extensions/`，桌面宿主通过清单自动发现并默认启用。用户启停与配置按 ID 单独持久化，列表与执行使用相同的合并规则；插件不会成为固定的运行时入口。新增同类内置插件无需增加构建入口或修改 Agent。

## 目标设计：三个契约边界

| 边界             | 责任                                                                                         | 不应承担的责任                                              |
| ---------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 插件 SDK         | 插件注册、资源贡献、生命周期、宿主服务及标准扩展点                                           | 暴露 Pi 的内部类型或要求插件识别底层 Agent                  |
| Agent 适配契约   | 将 Isle 插件转换为 Agent 原生插件定义与回调，交由 Agent 标准注册；处理直接映射与缺失能力策略 | 重复实现插件加载、状态事务、审批、桌面 UI 或包管理          |
| 生态兼容适配契约 | 识别外部包，提供其受支持 API 的桥接，将注册、回调和调用翻译为 Isle 语义                      | 绕过 Isle 执行边界，或为每个目标 Agent 再写一套插件转换逻辑 |

Agent 适配器的产物是可注册的原生插件或插件工厂。注册以后，由目标 Agent 的原生插件机制驱动其事件、钩子、命令与工具调度，适配器在回调边界转换参数、返回值和上下文。Isle 不要求每个 Agent 重新实现一套 Isle 专用插件调度器。宿主通用服务实现一次，插件作者不需要针对每个 Agent 编写分支。

这里的插件协议包含可执行回调和生命周期契约，不限于 JSON 包清单。跨 worker 时，原生插件定义可以持有 RPC 代理，插件逻辑仍在隔离 worker 中执行；适配后的返回值、异常、取消和事件顺序必须维持相应契约。

例如 Isle 的上下文钩子应通过 Pi 适配器注册为 Pi 的上下文钩子，由 Pi 在组装请求时调用，再将结果映射回 Pi。Pi 适配器可以使用 Pi 内部能力完成模拟，但这些依赖封装在适配器内。

例如，一个 Isle 插件修改本轮上下文、拦截工具调用并展示状态面板：上下文与工具拦截由当前 Agent 的适配器接入；状态面板由 Isle 宿主提供。这些能力分别协商，桌面 UI 无需每个 Agent 重新实现。

## 目标设计：能力与语义

协议以 Pi 能力为基准按模块定义，弱能力 Agent 可以只实现其中一部分。目标模块包含包资源、工具与技能、命令与补全、事件与中间件、生命周期与会话、消息与 UI、模型与 Provider。Pi 适配器作为首个完整能力参考实现，Mock 用于验证调度、错误、取消和状态语义。

选定仓库内某一版本的 Pi 插件 API 作为基准，逐项等价定义 Isle 协议，并以该范围内百分百适配为验收目标。验收覆盖接口、上下文、生命周期、顺序和结果语义，不能仅凭接口名称一致就宣布完成。后续 Isle 新增能力由 Pi 适配器选择直接映射、模拟或显式降级，不能追溯计入原基准的完整支持范围。

目标适配器对每项能力给出明确的映射策略，并报告实际采用的策略：

| 策略     | 行为                                          |
| -------- | --------------------------------------------- |
| 直接映射 | 转换成 Agent 对应的原生插件 API               |
| 模拟     | 组合 Agent 的其他内部方法或 Isle 宿主服务实现 |
| 忽略     | 不注册该贡献或钩子                            |
| 空实现   | 保留可调用接口，返回事先定义的空值或中性结果  |
| 报错     | 在注册或调用时返回明确的不支持错误            |

策略可以由适配器提供默认值，并由插件要求及宿主策略进一步约束。忽略和空实现是允许的兼容策略，但属于降级，不计为语义等价支持；空值必须满足返回类型，不能任意返回 `undefined`。执行权限和审批仍由宿主控制，不属于可通过空实现绕过的插件贡献。

当前清单 v2 的 `modules.agent.capabilities` 为必需能力声明。SDK 已增加版本化 `ExtensionAdapter<TNativePlugin>`、五种映射模式和逐项适配报告；缺少映射默认报错。具体策略由适配器实现，尚未提供宿主覆盖策略或更细粒度的语义要求。

每个扩展点必须定义触发时机、输入输出、执行顺序、串行或并行、返回值合并、短路、失败、取消和权限语义。观察事件与可改变执行的中间件分开定义。对上下文的修改必须送入本轮实际模型请求；工具参数修改后必须重新进行 schema 与宿主最终权限检查。只有完整兑现这些语义的 Agent 才能声明支持相应能力。

插件协议的丰富程度不应受现有 Mock 限制。Mock 可以提供可控的扩展点来验证协议，不能以缺少真实模型推理为理由删减协议能力。

## 目标设计：生命周期

协议需要分别定义插件安装登记、插件激活、会话绑定、单轮运行及单次调用的生命周期。会话级插件实例应能接收多轮运行事件，具有明确的初始化、暂停或释放时机；Agent 适配器通过原生插件生命周期或内部方法兑现这些语义。运行级配置与资源仍使用快照。会话内存与可持久化状态是不同保证，重启恢复只能依赖已提交状态。

worker 是隔离与执行机制，不能反过来决定公共插件生命周期。当前已增加 runtime 所有的会话实例池：相同会话的 Agent 运行、命令和手动压缩复用插件闭包，每次操作重新创建受控 bindings。无持久会话的运行仍使用临时实例。并发、配置失效、取消和退出清理的具体约定见[Pi 兼容基准与协议规格](../extensions/pi-compatibility.md)。压缩前决策与结果观察已实现；会话切换与分叉仍待补齐。

## 目标设计：外部插件兼容

Pi 兼容层作为独立模块实现，声明支持的 Pi API 版本和能力范围。优先以运行时 API 桥接承接原生插件的注册函数、事件回调与宿主操作；包元数据和资源路径可在导入时转换。转换后的 Isle 插件经过目标 Agent 插件适配器，生成原生插件并按该 Agent 的标准注册。Isle 宿主对整条链路统一提供配置、能力诊断和执行权限服务。

这不是承诺任意插件都能自动进行源码转换。依赖 Pi 内部模块、具体终端组件、特殊会话结构或未支持生命周期语义的插件，需要补充映射，或按选定策略模拟、忽略、空实现或报错，并报告降级。兼容层执行的插件代码同样受 Isle 的 worker、权限和审批机制管理。

验收包括两条链路：Pi 原生插件经「Pi 导入适配器 → Isle 协议 → Pi 插件适配器」往返后，与直接注册到 Pi 的行为对照；同一导入结果再经 Mock 适配器注册，验证可映射能力及预期降级。其他生态插件沿用同一转换结构，不需要为每对源生态与目标 Agent 编写专用适配器。

这条链路统一了接入方式。外部插件的完整行为保留仍取决于导入端能否表达其语义、以及目标适配器能否兑现；丢弃或空适配能实现接入，但不能称为无损兼容。

## Pi 到 Isle 的能力对应

参考仓库内 Pi 0.85.1 的 `ai/pi/packages/coding-agent/docs/extensions.md`、`docs/packages.md` 和 `src/core/extensions/types.ts`。完整分类及基准校验见[Pi 兼容基准与协议规格](../extensions/pi-compatibility.md)，概要如下：

| Pi 能力                                  | Isle 目标                               | 当前状态                                                                     |
| ---------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| Pi package 的资源声明与分发              | `isle.extension` 清单、独立构建、包注册 | 已有本地目录注册、tgz 打包；网络安装和托管解包未实现                         |
| `registerTool`                           | `ctx.registerTool` 与宿主最终执行检查   | 已有文本结果、JSON details 与进度；多模态结果待补                            |
| skills / prompts 资源                    | 技能与模板贡献                          | 已有内联技能；目录技能和模板发现待补                                         |
| `registerCommand`                        | 显式命令目录、SDK 和桌面执行入口        | 已有通用参数表单、审批、取消与结果；输入框斜杠命令与补全待补                 |
| Agent / tool 事件                        | Isle 归一化事件                         | 已有 run/tool/turn 开始结束、消息开始/流式更新/结束观察；消息返回值替换待补  |
| `input`、`context`、`before_agent_start` | 输入和上下文中间件                      | 已有文本输入/系统提示替换、输入阻断及上下文文本/引用管道；完整多模态编辑待补 |
| `tool_call`、`tool_result` 拦截          | 调用前拦截和结果转换                    | 已有参数替换、工具阻断、结果转换；最终参数重新校验并接受权限检查             |
| `appendEntry` 和 session manager         | 插件会话状态、会话操作                  | 已有 JSON 状态、压缩前允许/阻止与结果通知；切换、分叉、条目历史待补          |
| `ctx.ui`、消息渲染器、快捷键             | Isle 通知、卡片、面板及交互扩展         | 待实现，采用桌面协议                                                         |
| 模型选择、provider、请求钩子             | 可选模型与供应商扩展能力                | 待设计，按 Agent 支持范围开放                                                |

尚未实现的能力不能写入清单，加载时会报错。Agent 通过 `extensionAdapter.capabilities` 声明映射；运行前检查包的全部所需能力，缺少映射时明确失败。Pi 和脚本 Mock 已通过原生插件注册承接资源、状态、五类观察事件和六类中间件，其中内联技能、运行事件及状态采用显式模拟；Pi 上下文使用文本/原生消息引用投影。Mock 验证契约和工作流，不模拟真实模型推理或原生会话摘要。

## 当前实现边界

已实现第一阶段原生插件适配：SDK 的 `ExtensionCatalog` 定义贡献数据，`ExtensionBindings` 定义受控调用接口，`ExtensionAdapter<TNativePlugin>` 定义转换。Pi 适配器返回 Pi 的 `ExtensionFactory` 并交给原生资源加载器；Mock 适配器返回 Mock 插件并交给其注册表。工具、命令与工具事件由原生注册机制驱动，运行终态及状态事务仍复用 Isle 宿主服务。适配契约位于 SDK 的独立 `adapter` 模块，具体 Agent 类型只出现在各自适配器中。

包身份由清单 `id` 和代码 `defineExtension({ id })` 共同确定。元数据阶段检查版本、入口和配置；代码只在执行 worker 中导入，激活时再次检查身份和贡献能力。JSON Schema 是声明校验；worker 沙箱及宿主执行检查承担运行权限控制。`capabilities` 不等于文件、网络或进程授权。

当前生命周期分为本地包注册、会话插件实例、单次操作绑定及持久状态。安装登记不运行 setup；同一 runtime 和规范化会话目录内的 Agent 与命令按序借用实例，闭包可跨轮保存。配置、沙箱策略或入口变化、取消、显式释放及 runtime 退出会结束实例，重启后只能通过 `ctx.session` 恢复已提交数据。Pi 的原生代理仍按轮注册；这不等价于保持 Pi AgentSession、会话切换钩子或全部 Pi 生命周期。

公共 SDK 在新建 runtime 时快照启停与配置；桌面 stdio CLI 每次操作从宿主设置文件读取新快照，进行中的操作不受变更影响。配置传到插件的 `ctx.config`，深度冻结；持久状态按会话和插件 ID 隔离。插件停用或移除注册不会删除会话状态。

目前工具、命令、事件、状态与中间件契约共用开发中的 API v1。中间件使用独立模块和能力声明，顺序、短路、错误、取消和最终权限检查见[插件中间件](../extensions/middleware.md)。后续增加新模块仍需先明确语义，再定义接口与版本兼容规则。

## 后续顺序

1. 在已固定的 Pi 能力矩阵和会话实例契约上，逐项补齐未实现能力的数据模型与语义规格。
2. 在[消息与回合观察事件](../extensions/events.md)和[会话压缩钩子](../extensions/session-control.md)基础上补齐多模态编辑、其他会话控制；继续以 Pi/Mock 行为测试验证已有能力。
3. 补齐资源发现、消息与 UI、会话操作、模型与 Provider 能力；按模块声明支持范围。
4. 增加独立 Pi 兼容适配器，先覆盖工具、命令和事件类原生插件，再逐步覆盖复杂插件；用真实插件验证跨 Agent 行为。

桌面包管理与宿主 SDK 命令能力继续复用。新增接口应落在上述契约边界中，并明确「设计」「已实现」「已验证」，避免把局部闭环描述为完整兼容。

开发与验证步骤见[插件包开发与管理](../extensions/development.md)，执行和状态语义见[宿主插件最小闭环](../runtime/extensions.md)。
