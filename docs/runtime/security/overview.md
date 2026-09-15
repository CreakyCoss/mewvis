# 运行时安全架构

`apps/agent-runtime/src/security` 集中管理审批、沙箱执行及平台实现。Agent 适配器只调用公开的 safety/execution 入口，资源与平台辅助模块由安全模块内部管理。

```text
security/
  access/                协议解析与不可变访问上限
    index.ts             解析宿主路径基础、交集范围、拒绝未声明操作
  safety/                调用前规则、审批及复核
    index.ts             公共流程与配置校验
    policy.ts            可执行规则与权限档位
    types.ts             安全契约
  execution/             程序执行与可选操作系统隔离
    index.ts             配置校验、策略解析、执行与状态
    policy.ts            独立执行和沙箱配置
    runtime/             启动器、RPC 和沙箱生命周期
    cli/                 沙箱状态及初始化命令
    types.ts             执行契约
  platforms/             平台实现
    index.ts             进程、通道选择与后端加载
    resources.ts         共享路径／域名辅助逻辑及平台路径选择
    posix/               配置、路径、进程、通道和沙箱
    windows/             配置、路径、进程、通道、沙箱、ACL 和初始化
```

`safety/index.ts` 解析权限档位并检查调用，`execution/index.ts` 执行注入的程序。两条流程独立，审批与隔离可分别启用；配置分别位于 `safety/policy.ts`、`execution/policy.ts`。

两层共用 `platforms/resources.ts` 的平台选择、规范路径、目录变量及域名匹配。该入口不导入沙箱，只使用审批不会加载执行后端。`platforms/index.ts` 按需选择实现、加载 SRT 与初始化模块，各平台使用同一选择器。

运行时根目录的 `build-entries.json` 声明执行启动器与沙箱控制命令的源码位置及输出名称。Agent SDK 工具和参数解码仍留在引擎适配器。配置、生命周期与验证见 [审批规则](approval.md)和 [程序执行](execution.md)。

## Agent 访问上限

`agentAccess` 是宿主提供的可选上限，与 `permissions.mode` 独立。唯一协议来源为 `protocol/v1/schema/access.schema.json`，SDK 声明由其生成。`access/index.ts` 校验 Schema、解析路径基础，未声明能力默认拒绝。

普通宿主省略此上限；应用边界始终注入已安装清单声明，未声明时也传入 `{}`。安全模块不处理应用身份或启用逻辑。

调用前门控先于审批拒绝已知越界操作，即使关闭审批也不放行。执行层将文件和网络策略与同一上限取交集，不透明工具和子进程仍处于该沙箱。Node Worker 还使用 Node 权限模型限制进程创建，关闭原生 addon、FFI、worker 逃逸路径；这不隔离独立的原生应用服务自身。

受限执行要求沙箱已启用且程序适配完成；不支持的程序或平台范围会拒绝执行。子 Agent 继承完整策略快照。禁用应用由原生宿主取消其任务。

在 `apps/client` 运行 `pnpm test:agent-runtime:access` 验证真实文件、符号链接、进程和网络边界；`pi-extensions-e2e.mjs` 还检查 full 模式及子 Agent 继承。
