# 宿主原生插件系统

宿主先定义自己的扩展协议和消费点，再按需接入外部 SDK。原生插件直接使用 `@isle/extension-host`，无需安装或加载 SDK；SDK 插件通过 `@isle/extension-adapters` 转换成同一种原生插件。Pi/Mock 不识别插件来源。

## 目录与依赖

```text
packages/extension/
├─ host/                         # 独立的原生插件系统
│  ├─ index.d.ts / index.js      # 总协议、definePlugin
│  ├─ management/               # 原生包发现、配置、启停
│  ├─ agent/                    # 内部 Agent 契约、能力协商
│  │  └─ registration/          # 注册、回调执行、参数和结果校验
│  ├─ ui/                       # UI 协议与扩展点
│  │  ├─ protocol/              # 插槽、视图入口、目录与传输接口、Schema
│  │  ├─ runtime/               # Provider、目录订阅、贡献绑定
│  │  ├─ slots/                 # SidebarSlot、TextSlot、ExtensionSlot
│  │  ├─ views/                 # iframe、通信、取消与释放
│  │  └─ server/                # 视图租约、作用域、权限撤销
│  └─ services/                 # 内部服务契约、统一分发、会话数据映射
├─ adapters/                    # 外部 SDK 元数据、回调与上下文转换
├─ sdk/                         # 外部插件作者协议
└─ dev/                         # 原生/SDK 插件构建

apps/agent-runtime/src/engines/drivers/native/agent/runtimes/
├─ pi/extensions/              # 内部 Agent 插件 → Pi 原生插件
└─ mock/extensions/index.ts          # 内部 Agent 插件 → Mock 插件
```

宿主核心不依赖 SDK、SDK 适配器或具体 Agent。Agent 自己调用适配器并按自己的机制注册原生插件；能力直接映射、模拟、忽略、空实现或报错的策略仍由具体 Agent 决定。

类型与实现按领域放在一起，内部协议没有从 SDK re-export 类型或声明别名。两套协议目前部分数据形状相同，但分别维护；SDK 版本变化由 Isle 适配器处理。

## 原生插件

原生包使用 `package.json` 的 `isle.plugin` 字段，`schemaVersion: 1`、`protocolVersion: 1`。可执行入口同样声明 `protocolVersion`，通过 `definePlugin` 编写 Agent 的 `setup` 或 UI 的 `mount`。包清单通过 `modules.agent/modules.ui` 组合入口，两个模块不能使用同一文件。

```json
{
  "isle.plugin": {
    "id": "example.native",
    "schemaVersion": 1,
    "protocolVersion": 1,
    "modules": {
      "agent": { "entry": "./index.js", "capabilities": ["commands"] }
    }
  }
}
```

```ts
import { definePlugin } from "@isle/extension-host";

export default definePlugin({
  id: "example.native",
  protocolVersion: 1,
  setup(ctx) {
    ctx.registerCommand({
      name: "hello",
      description: "原生命令",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      async execute() {
        return { text: "hello" };
      },
    });
  },
});
```

UI 原生入口通过 `ctx.services` 访问宿主服务。`apps/extensions/session-ledger` 是原生实例，只依赖宿主包，读取链路并生成不回写的临时摘要。公开 SDK 的 UI 仍使用 `ctx.host`，这一差异由适配器转换。

## SDK 接入

SDK 作者继续使用 `isle.extension` 清单和 `apiVersion`。构建工具根据清单选择路径：

1. 原生包直接构建入口，校验原生清单。
2. SDK 包由 Isle 适配器校验并转换元数据；构建工具将 Agent/UI 适配器包装进入口。
3. SDK 模块在隔离环境内求值，适配器将其定义转换为原生定义，代理注册、服务、事件、取消和生命周期；构建过程不执行插件代码。
4. 最终分发包统一使用 `isle.plugin`，宿主加载时只接收原生协议，不猜测入口属于哪种 SDK。

这是明确的格式转换，没有旧清单兼容分支。SDK 源包需要重新构建再登记。新的 SDK 可以提供自己的元数据和入口适配器；不需要修改 Pi/Mock。

## 应用装配

- Client 的 `api/extensions.ts` 提供目录读取、变更/连接事件与视图传输。工作台直接装配宿主 `PluginUIProvider`，无需单独的 `src/extensions` 模块。宿主 `ui/runtime` 负责目录订阅、竞态处理、焦点刷新和清理。
- 页面从 `@isle/extension-host/ui/slots/sidebar` 导入 `SidebarSlot`，使用宿主 `uiSlotDefinitions`，通过 `render` 适配布局。
- Server 的 `bootstrap/extensions.ts` 将当前应用的会话和模型服务绑定到宿主服务接口；模块命令层把通用插件错误映射为 HTTP 错误。
- Agent Runtime 的 `src/extensions` 保留当前进程的沙箱、审批、会话池与状态事务装配，调用宿主的通用注册执行器。具体 Pi/Mock 适配器仍在各自运行目录。

根入口不会加载 React、Node 服务或具体 Agent。React 插槽使用 `/ui/react`、`/ui/slots`；Node 租约使用 `/ui/server`；包管理使用 `/management`；Agent 注册执行使用 `/agent/registration`。独立入口按环境装配，同一套实现不再散落到各应用。

## 验证

`pnpm test:extensions` 覆盖宿主依赖边界、SDK 元数据和回调转换、包构建与真实 Pi/Mock 工作流。`pnpm --filter client test:extensions` 验证原生 UI 插槽。`pnpm --filter @isle/server test:extensions` 验证原生账本插件和 SDK 统计插件共同加载，并核对一次性摘要前后全部会话文件不变。

边界测试禁止 Client、Server、Agent Runtime 生产代码直接导入 SDK 或 SDK 适配器，也禁止宿主核心依赖具体 Pi 包。更换 SDK 只影响 SDK 接入侧；更换 Agent 只影响该 Agent 的适配器。新增未被宿主支持的能力仍需扩展内部协议和消费点。
