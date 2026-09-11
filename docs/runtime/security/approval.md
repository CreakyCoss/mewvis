# 调用前安全与审批

源码目录 `apps/desktop/agent-runtime/src/security/safety` 中，`policy.ts` 配置调用前规则、档位元数据、资源边界和操作风险；`index.ts` 提供配置校验、运行快照解析、规则评估、等待审批和调用复核；`types.ts` 定义通用契约。Agent 特有的操作解码留在运行时适配器。

## 独立开关

`policy.ts` 的 `SAFETY_CONFIG.enabled` 控制整个调用前安全层，与 `../execution/policy.ts` 的 `enabled` 独立，默认均为 true。

| 安全层 | 沙箱  | 行为                                     |
| ------ | ----- | ---------------------------------------- |
| true   | true  | 检查／审批后在操作系统隔离中执行。       |
| true   | false | 检查／审批后在普通子进程执行。           |
| false  | true  | 跳过调用前安全检查，由沙箱约束资源范围。 |
| false  | false | 普通子进程执行，不执行这两层检查。       |

禁用时 `resolveSafetyPolicy()` 返回 `null`，适配器不改动 `beforeToolCall`，跳过插件启动审批。Worker RPC、取消、超时与工具分配不受开关影响。full 是普通档位，仍遵守显式禁用与审批规则。

## 修改规则

在 `policy.ts` 修改设置或新增规则。通用入口不包含文件、网络、命令或工具专用决策分支，也没有按领域维护的 Schema。工厂 `rules(context)` 每轮解析路径并建立快照，返回规则：

- `id`、`description`：稳定标识与说明。
- `scope: "operation"`：分别评估每个已解码操作。
- `scope: "invocation"`：评估整个调用一次，包括未解码出操作的调用。
- `evaluate({ request, operation, workspacePath })`：不匹配返回 `undefined`，匹配返回 `{ risk, reason, effect? }`。`effect: "deny"` 禁止调用，`effect: "ask"` 无视风险阈值要求审批。

例如向返回的规则列表添加以下对象，使所有档位中的匹配命令都需要确认：

```ts
{
  id: "confirm-git-push",
  description: "此 Git push 调用需要确认。",
  scope: "invocation",
  evaluate({ request }) {
    if (request.entry === "bash" && typeof request.input.command === "string" &&
        /\bgit\s+push\b/.test(request.input.command)) {
      return { risk: "high", effect: "ask", reason: "此 Git push 调用需要确认。" };
    }
  },
}
```

拒绝优先于显式审批，其后才应用风险与未知操作策略。每个解码操作都必须匹配操作规则才算已识别；调用级规则不会分类其内部操作，低风险匹配也不能掩盖未识别操作或不完整分析。规则格式错误、ID 重复、评估结果无效都会拒绝执行。

规则是受信任的同步宿主代码，应无副作用，在工厂内捕获私有快照。正则应避免 `g` / `y`，或每次匹配前重置 `lastIndex`，因为审批复核会再次评估。函数不穿过 Worker RPC，也不能结构化克隆。规则对象、列表、审批设置被冻结，子 Agent 共用此宿主快照；可序列化执行设置另行克隆。

每轮新建快照；文件参与打包，不支持热重载。修改配置后运行 `pnpm generate:agent-runtime:protocol`，重新构建并重启。前端模式与说明由同一配置生成。

## 资源与平台

路径支持绝对路径与 `${workspace}`、`${home}`、`${temp}`、`${runtime}`，目录包含子孙路径。读取除拒绝范围外默认允许；写入需命中允许根目录且不能命中拒绝项。递归访问也检查受保护后代；配置启用时拒绝写入多重硬链接。未知变量与路径 glob 会被拒绝。

网络规则检查解码后的 URL。ask 默认拒绝已解码网络请求，auto/full 允许网络目的地址。网络本身为中风险，在 auto 下无需审批；其他高风险或分析不完整的作用仍遵守原审批规则。Bash 与自定义工具继续按进程／未知操作分析，此层不枚举任意代码内部隐藏的网络请求。独立沙箱的三个档位默认允许代理网络。

`../platforms/resources.ts` 选择路径语义，处理符号链接（包括悬空链接和新文件的现有祖先）、目录变量、路径校验及域名匹配。POSIX 与 Windows 的 `paths.ts` 实现平台差异。审批与执行共用资源入口，不相互导入配置或后端。`../platforms/index.ts` 使用同一平台选择器选取进程、通道和沙箱启动实现。Windows 原生隔离验证状态见 [程序执行](execution.md)，路径契约测试不能替代原生测试。

## 审批流程

`checkExecution()` 分析最终参数、评估规则，必要时等待。获批后重新分析与评估；参数、目标或决策变化使审批失效。审批从创建起一分钟过期，包含排队时间，主／子 Agent 超时计时不中断。批准只恢复原调用，不能扩大沙箱范围。

命令正则只检查调用文本，不能发现隐藏脚本、展开或子进程的所有作用。调用前检查不提供操作系统隔离，也不完整分析任意代码。文件和网络强制边界应使用独立沙箱。

## 验证

在 `apps/desktop` 运行 `pnpm test:agent-runtime:permissions`、`pnpm test:agent-runtime:pi-extensions`、`pnpm test:agent-runtime:sandbox-platform`。Pi 套件使用真实会话与本地模型桩，检查四种开关组合及子策略继承。
