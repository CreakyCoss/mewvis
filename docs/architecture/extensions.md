# 插件协议与能力映射

宿主拥有独立于外部 SDK 的插件协议、注册机制和扩展点。内部插件直接使用宿主协议；Mewvis SDK 插件经过独立映射后成为内部插件。宿主通用模块不认识 Pi/Mock，具体 Agent 自己将内部 Agent 插件转换成原生插件并注册。

```text
宿主原生插件 ───────────────────────────┐
Mewvis SDK 插件 → Mewvis SDK 映射器 ─────────┤
                                      ↓
                            宿主原生插件协议与注册
                              ├─ UI → 宿主插槽
                              ├─ Host → 宿主服务
                              └─ Agent → 内部 Agent 插件
                                              ↓
                                      当前 Agent 的适配器
                                              ↓
                                      Agent 原生插件注册
```

当前不推进其他生态插件导入或 Pi 全量 API 兼容。按实际需求增加协议类型、插件实现和消费点。更换 SDK 修改 SDK 映射器；更换 Agent 修改该 Agent 的适配器；增加宿主没有的能力仍需扩展内部协议和实现。

## 目录与入口

`packages/extension/host/index.d.ts` 定义原生清单与领域组合，`index.js` 提供 `definePlugin`。领域契约与实现共置，不从 SDK 导出内部类型。完整目录和原生编写方式见[宿主原生插件系统](../extensions/native-host.md)。

- `host/agent/`：工具、技能、命令、状态、事件、中间件契约及原生适配接口；`registration/` 负责通用注册、调用与校验。
- `host/ui/`：宿主插槽协议、React 插槽、视图绑定、隔离 iframe、通信与视图租约。
- `host/services/`：宿主服务协议、分发校验和会话 DTO 映射。
- `host/management/`：原生包的发现、清单与配置校验、启停及设置持久化。
- `adapters/`：SDK 包元数据、执行入口、注册回调、UI 上下文及服务的双向映射。
- `sdk/`：外部插件作者协议，与宿主内部协议分别维护。
- `dev/`：源包构建；原生包直接打包，SDK 包注入 Mewvis 映射器，产物统一为原生包。

原生包使用 `mewvis.plugin`、`schemaVersion: 1`、`protocolVersion: 1`；SDK 源包使用 `mewvis.extension`、`schemaVersion: 2`、`apiVersion: 1`。宿主加载只处理原生包，不猜测插件格式，也不提供旧清单兼容分支。SDK 定义在隔离执行环境内经入口包装器转成原生定义，构建工具不执行插件代码。

## UI 消费点

```text
原生清单 contributions → Server 贡献目录
                                 ↓
Client 装配 PluginUIProvider（注入目录和传输）
                                 ↓
宿主 ExtensionSlotProvider → 页面 SidebarSlot / TextSlot
                                 ↓
页面 render / renderAll → 预留位置中的插件内容
                                 ↓ 按需 renderView()
                     独立的隔离视图实例
```

插槽实现集中于 `packages/extension/host/ui/slots`，视图执行位于 `ui/views`。`apps/client/src/extensions` 仅保留目录订阅和依赖装配；页面不导入 SDK，也不依赖插件管理页。

`host/ui/protocol/contracts.js` 是内部插槽定义源，`host` 的 generate/check:ui 独立生成和检查内部声明与 Schema。SDK 保留自己的插槽定义与生成流程，映射器转换声明；不同版本不能通过类型别名静默混用。

当前有 `session.sidebar`（必需标题、图标和视图引用）和 `session.status`（结构化文本）。页面可以不挂载插槽，也可以在 render 中返回 null。Slot 不接收页面提供的 contributions，不管理整个页面布局，不自动选择具体面板。发布贡献不等于执行视图；只有实际调用并渲染 renderView，才加载插件。

聊天页面使用普通 `ChatPanels`/`ChatPanel`，一个面板一次声明图标、标题和内容。原生文件、版本面板之后放置一个 SidebarSlot。选择、展开和 portal 由页面组件负责，Slot 将插件贡献交给 render。原生账本面板已由 `apps/extensions/session-ledger` 插件替代。

工作区、会话或视图引用改变时旧实例卸载；关闭、切换、停用或配置变化撤销租约并取消请求。同一贡献在不同布局中具有独立视图实例。页面未使用的插槽不执行插件代码。

## Host 服务消费点

原生 UI 使用 `ctx.services`；SDK UI 使用 `ctx.host`，由 Mewvis 适配器转换。宿主服务目前接入 UI，Agent worker 尚未注入此服务客户端。服务需求声明不等同于可执行的 Host 插件模块。

`host/services/dispatch.ts` 统一协商能力、校验请求、处理错误与取消，`host/ui/server/views.ts` 管理作用域和视图租约。Server 的 `bootstrap/extensions.ts` 仅将现有会话和模型服务注入宿主接口；业务存储和模型实现仍留在原模块。

当前支持公开会话读取、诊断账本读取和一次性摘要。账本插件可直接调用内部服务，不需要 SDK；SDK 统计插件通过适配后的服务调用进入相同分发。摘要调用无会话的模型请求，不压缩、不持久化、不改变后续上下文。能力范围、错误和取消见[宿主服务协议](../extensions/host-services.md)。

## Agent 消费点

Pi 适配器仍位于 `apps/agent-runtime/src/engines/drivers/native/agent/runtimes/pi/extensions`，Mock 适配器仍位于 `runtimes/mock`。两者依赖宿主的 `ExtensionBindings`、事件和中间件契约，不依赖 SDK。宿主提供通用适配接口和能力协商机制，不选择底层 Agent，也不包含具体 Agent 名称分支。

适配器产物是各 Agent 可按自身标准注册的原生插件或工厂。注册后，由原生机制驱动回调，适配器转换输入输出、事件和上下文。宿主负责加载、状态事务、审批和执行隔离，不要求每个 Agent 重写这些能力。

| 策略     | 行为                               |
| -------- | ---------------------------------- |
| direct   | 映射到 Agent 原生扩展点            |
| simulate | 组合 Agent 内部方法或宿主服务实现  |
| ignore   | 不注册贡献或钩子，并报告降级       |
| noop     | 返回契约允许的中性结果，并报告降级 |
| error    | 明确拒绝不支持的能力               |

缺少映射默认报错。执行权限和审批不能通过 ignore/noop 绕过。观察事件不修改执行，修改输入、工具参数、上下文等必须使用中间件；修改后的工具参数仍经过最终权限与 Schema 校验。

## 执行与生命周期

通用 Agent 注册器和参数/结果/事件/中间件校验位于宿主包；当前 Runtime 中 `extensions/index.ts` 定义 `ExtensionRuntime`，装配安全执行、会话实例池和持久状态事务。它仍是 Runtime 的唯一插件运行接入入口，具体 Agent 不直接访问实例池或 worker。

`open()` 借用操作，`finish()` 最多提交一次运行终态，调用方在 finally 中 dispose。相同会话的运行、命令和压缩可复用实例；无会话操作使用临时实例。配置、权限或入口变化在下一操作替换实例，不改写正在执行的快照。取消后不重放工具或命令；worker 失效与终态恢复由 Runtime 装配层协调。

Pi 对回调错误的吞并、压缩恢复和原生消息投影等细节，封装在 Pi 自己的适配目录。协议版本和已实现语义见[Pi 能力参考](../extensions/pi-compatibility.md)、[插件中间件](../extensions/middleware.md)和[消息与回合事件](../extensions/events.md)。

## 验证边界

边界测试禁止宿主、Client、Server 和 Agent Runtime 生产代码直接导入外部 SDK/SDK 映射器，也禁止宿主核心导入具体 Pi 实现。完整插件工作流覆盖原生入口、SDK 适配入口、真实 Pi 与脚本 Mock、UI 插槽、原生账本、服务取消和摘要不回写。构建与测试入口见[原生插件验证](../extensions/native-host.md#验证)。
