# Server 配置接口

[Node Agent 服务](server.md)提供模型、Agent 与协作流程配置。以下命令均通过已认证的 `POST /api/commands/<命令名>` 调用，沿用 Tauri 的 camelCase 参数及返回字段。

## 命令与参数

| 命令                            | 请求体                                       | 返回                                             |
| ------------------------------- | -------------------------------------------- | ------------------------------------------------ |
| `get_llm_settings`              | `{}`                                         | `{providers: [...]}`                             |
| `save_llm_settings`             | `{input: {providers: [...]}}`                | 完整模型配置                                     |
| `get_ai_agent_settings`         | `{}`                                         | `{agents: [...], collaborationWorkflows: [...]}` |
| `save_ai_agent`                 | `{input: {id?, name, avatar, description?}}` | 完整 Agent 与流程配置                            |
| `delete_ai_agent`               | `{id}`                                       | 完整 Agent 与流程配置                            |
| `save_collaboration_workflow`   | `{input: {...}}`                             | 完整 Agent 与流程配置                            |
| `delete_collaboration_workflow` | `{id}`                                       | 完整 Agent 与流程配置                            |
| `get_agent_runtime_sandbox_status` | `{}` | 沙箱开关及就绪状态 |
| `set_agent_runtime_sandbox_enabled` | `{enabled: boolean}` | 保存后的沙箱开关及就绪状态 |
| `initialize_agent_runtime_sandbox` | `{}` | 初始化后的沙箱开关及就绪状态 |

沙箱开关保存到 Server 数据目录的 `sandbox.json`，从下一次 Agent 运行生效。Windows 默认关闭沙箱，macOS/Linux 默认开启。开启开关不会自动安装；Windows 用户按需主动初始化，关闭时无需配置隔离账户。返回值中的 `enabled` 表示用户选择，与依赖是否就绪分开；`state` 为 `ready`、`setup-required`、`unavailable` 或 `disabled`。详见[程序执行与沙箱](security/execution.md)。

读取返回的记录包含 `createdAt`、`updatedAt` 等元数据，保存时只传输入契约中的字段。Server 拒绝未知字段和错误类型；删除不存在的记录按 Tauri 行为成功返回当前配置。

模型保存示例：

```json
{
  "input": {
    "providers": [
      {
        "name": "本地模型",
        "provider": "custom",
        "apiFormat": "openai-completions",
        "apiEndpoint": "http://127.0.0.1:11434/v1",
        "apiKey": null,
        "isDefault": true,
        "models": [
          {
            "modelId": "example-model",
            "modelName": "示例模型",
            "isEnabled": true,
            "isOneMillionContext": false,
            "thinking": null
          }
        ]
      }
    ]
  }
}
```

Provider 和模型可传 `id`；返回的模型包含 `providerId`。`thinking` 保留原始 JSON 配置，不限制为固定思考等级列表。模型 API Format 与供应商标识的支持范围仍由 Runtime 决定。

协作流程保存示例：将占位值替换为已创建的 Agent ID。

```json
{
  "input": {
    "name": "写作与审阅",
    "writerAgentId": "writer-id",
    "reviewerAgentId": "reviewer-id",
    "steps": [
      {
        "name": "初稿",
        "agentId": "writer-id",
        "instruction": "完成初稿",
        "phase": "draft"
      },
      {
        "name": "审阅",
        "agentId": "reviewer-id",
        "instruction": "检查逻辑",
        "phase": "review"
      }
    ]
  }
}
```

流程可传 `id`、`description`、`draftInstruction`、`reviewInstruction`、`reviseInstruction`；每一步可传 `id`、`instruction`、`phase`。`name` 和步骤 `agentId` 必填，至少有一个步骤。

## 保留的业务规则

- 记录 ID 沿用 32 位紧凑 UUID v7。缺少 ID 或传入旧格式 ID 时生成新 ID；有效 ID 的 Agent、流程保存执行更新并保留创建时间。
- 名称及可选文本去除首尾空白，可选空文本存为 `null`。
- 模型配置为全量替换。第一个标记默认的 Provider 成为默认项；没有标记时选第一项。空列表会清空模型配置。
- Provider 删除级联删除模型；同一个 Provider 下不允许重复 `modelId`。所有替换写入处于同一个事务，任何约束错误都会恢复原数据。
- 流程保留旧输入字段 `writerAgentId`、`reviewerAgentId`，但实际值由步骤推导：首步为 writer，后续第一个不同 Agent 为 reviewer，缺少不同 Agent 时回退到第二步或首步。
- 与 Tauri 一致，流程保存暂不验证引用的 Agent 是否存在，删除 Agent 也不级联删除已保存流程。执行时的角色解析仍走原有契约。

## 存储与错误处理

配置直接使用原来的 `~/.isle-claw/config.db`，也可通过 `ISLE_SERVER_DATA_DIR` 指定根目录。模型、Agent、流程、工作区、故事、技能和知识库配置共用同一份数据库；切换后端不需要复制或导入数据。

数据库沿用 Rust 的 schema v25，不设置 Node 专属 `application_id`。新库使用相同的 16 张表；旧库按原 v4–v25 升级规则处理，字段顺序不影响读写。历史规则也包括清除旧故事登记和已废弃的只读技能分组配置，不删除对应工作区文件。Node 在同一事务中完成升级和版本写入，重建父表时保留外键关联的技能成员；失败则整体回滚。

更高版本、不兼容或损坏库保留原文件，并通过状态接口报告初始化错误；配置业务暂不可用，认证后的数据库维护接口仍可访问，不自动删库重建。未来两种后端新增 schema 时必须同步升级规则及兼容性测试，避免产生各自的版本线。

API Key 与 Tauri 字段契约一致存入 SQLite，并由受认证的模型读取接口返回。支持 POSIX 权限的平台上，配置文件权限为 0600，新建数据目录为 0700。配置错误响应不包含 SQL、参数或凭据。

- `400 INVALID_ARGUMENT`：输入字段、类型或必填内容不合法。
- `409 SETTINGS_CONFLICT`：重复记录等约束冲突，写入已回滚。
- `503 SETTINGS_BUSY`：配置库被其他连接占用，请稍后重试；锁等待上限为 100 毫秒。
- `500 SETTINGS_STORAGE_ERROR`：其他配置读写错误。

当前配置读写为同步、小规模操作，HTTP 请求仍受 1 MiB 限制。文件扫描与网络 Embedding 使用异步操作；知识索引复用原 `rag/index.sqlite`，向量查询使用 sqlite-vec。大规模索引仍受本机资源和同步 SQLite 提交耗时约束，限制见业务接口文档。

这些接口只管理配置记录。桌面与 Web 已统一使用 Node，任务仍显式提交 `runtimeModel` 与角色配置。[工作区登记接口](server-workspaces.md)以及[技能、知识库和应用接口](server-interfaces.md)均已迁移。
