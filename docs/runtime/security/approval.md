# 调用前安全与审批

源码目录 `apps/agent-runtime/src/security/safety` 中，`policy.ts` 配置调用前规则、档位元数据、资源边界和操作风险；`index.ts` 提供配置校验、运行快照解析、规则评估、等待审批和调用复核；`types.ts` 定义通用契约。Agent 特有的操作解码留在运行时适配器。

## 独立开关

`policy.ts` 的 `SAFETY_CONFIG.enabled` 控制整个调用前安全层，默认开启；它与 `../execution/policy.ts` 的沙箱开关独立。沙箱在 macOS/Linux 默认开启，在 Windows 默认关闭，用户可在设置中切换。

| 安全层 | 沙箱  | 行为                                     |
| ------ | ----- | ---------------------------------------- |
| true   | true  | 检查／审批后在操作系统隔离中执行。       |
| true   | false | 检查／审批后在普通子进程执行。           |
| false  | true  | 跳过调用前安全检查，由沙箱约束资源范围。 |
| false  | false | 普通子进程执行，不执行这两层检查。       |

禁用时 `resolveSafetyPolicy()` 返回 `null`；适配器仍验证工具参数，没有额外 `agentAccess` 约束时跳过安全分析和审批。已启用应用的加载属于宿主授权的初始化，所有档位均不再单独进行启动审批。Worker RPC、取消、超时与工具分配不受开关影响。full 是普通档位，仍遵守显式禁用与审批规则。

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

网络规则检查解码后的 URL。ask 默认拒绝已解码网络请求，auto/full 允许网络目的地址。网络本身为中风险，在 auto 下无需审批；其他高风险或分析不完整的作用仍遵守原审批规则。已启用的自定义工具从其注册定义获取风险，适配为通用 `tool` 操作，由 `tool.declared-risk` 规则评估；没有声明的工具才按未知操作处理。声明表示用户信任该工具的风险契约，不表示宿主已分析其内部所有副作用，此层不枚举任意代码内部隐藏的网络请求。独立沙箱的三个档位默认允许代理网络。

### 工作区 Bash 免审批

`safety/bash.ts` 解码 POSIX Bash 的有限字面量语法。支持带引号、转义的参数，以及 `&&` 和管道；每一段都必须成功解码。宿主固定实际执行的程序与文件操作数绝对路径后，按最终参数重新分析。外部程序必须来自宿主 PATH 或标准安装目录；工作区、临时目录中的同名程序和脚本不继承安装程序的信任。多调用程序的符号链接（如 `cat -> busybox`）保留为未知操作。

支持 `pwd`、`echo`、受限 `printf`、`cd`、`ls`、`cat`、`head`、`tail`、`wc`、`rg`、只含数字行号和 `p/q` 的 `sed`、`mkdir`、`touch` 的明确参数子集。`rg` 固定加入 `--no-config`，防止隐式配置注入预处理脚本。只有工作目录和所有文件目标都在当前工作区内时，auto 才把已解码进程的读取标为低风险、普通写入标为中风险。文件作用仍经过现有的保护路径、硬链接和 Agent 访问范围规则。ask 中命令维持高风险，full 仍服从显式拒绝规则。

删除、覆盖式移动、Git 操作、构建或测试脚本、任意解释器代码、变量或命令展开、重定向、未支持参数和语法均维持不完整分析并请求审批。比如 `rg --pre`、跟随符号链接或搜索压缩文件的选项、`sed -i` 和 `printf -v/%n` 不在免审批范围内。包含 `..` 的路径、通过符号链接的 `cd`、管道中的 `cd` 也保守要求审批。Windows Git Bash 与 PowerShell 保留原有审批行为。

免审批识别不依赖沙箱是否开启；执行仍经过独立的沙箱配置。沙箱限制资源范围，不能阻止已获准程序删除工作区内文件，因此不会仅凭沙箱已开启而放行任意项目脚本。

`../platforms/resources.ts` 选择路径语义，处理符号链接（包括悬空链接和新文件的现有祖先）、目录变量、路径校验及域名匹配。POSIX 与 Windows 的 `paths.ts` 实现平台差异。审批与执行共用资源入口，不相互导入配置或后端。`../platforms/index.ts` 使用同一平台选择器选取进程、通道和沙箱启动实现。Windows 原生隔离验证状态见 [程序执行](execution.md)，路径契约测试不能替代原生测试。

## 审批流程

`checkExecution()` 分析最终参数、评估规则，必要时等待。获批后重新分析与评估；参数、目标或决策变化使审批失效。审批从创建起一分钟过期，包含排队时间，主／子 Agent 超时计时不中断。批准只恢复原调用，不能扩大沙箱范围。

命令正则只检查调用文本，不能发现隐藏脚本、展开或子进程的所有作用。调用前检查不提供操作系统隔离，也不完整分析任意代码。文件和网络强制边界应使用独立沙箱。

## 验证

在 `apps/client` 运行 `pnpm test:agent-runtime:permissions`、`pnpm test:agent-runtime:pi-extensions`、`pnpm test:agent-runtime:sandbox-platform`。Pi 套件使用真实会话与本地模型桩，检查四种开关组合及子策略继承。
