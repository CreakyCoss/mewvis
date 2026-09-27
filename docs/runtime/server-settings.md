# Server 配置接口

[Node Agent 服务](server.md)提供模型与聊天智能体配置。协作流程在[角色协作插件](../extensions/collaboration.md)中管理。以下命令均通过已认证的 `POST /api/commands/<命令名>` 调用，沿用 Tauri 的 camelCase 参数及返回字段。

## 命令与参数

| 命令                                | 请求体                                                      | 返回                         |
| ----------------------------------- | ----------------------------------------------------------- | ---------------------------- |
| `get_llm_settings`                  | `{}`                                                        | `{providers: [...]}`         |
| `save_llm_settings`                 | `{input: {providers: [...]}}`                               | 完整模型配置                 |
| `get_agent_settings`                | `{}`                                                        | `{agents: [...]}`            |
| `save_agent`                        | `{input: {id?, name, avatar, category, instructions, ...}}` | 完整智能体列表               |
| `delete_agent`                      | `{id}`                                                      | 完整智能体列表               |
| `get_agent_runtime_sandbox_status`  | `{}`                                                        | 沙箱开关及就绪状态           |
| `set_agent_runtime_sandbox_enabled` | `{enabled: boolean}`                                        | 保存后的沙箱开关及就绪状态   |
| `initialize_agent_runtime_sandbox`  | `{}`                                                        | 初始化后的沙箱开关及就绪状态 |

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

## 智能体定义与聊天引用

内置智能体包含办公、写作、资料整理、会议纪要、汇报、数据分析、项目规划和研发助手。全部可在模型菜单中选择，默认不选中；内置定义只读，修改时先复制为自定义智能体。`source` 为 `builtin` 或 `custom`，由服务端决定，保存时不得传入。

自定义定义必须包含 `name`、`avatar`、`category` 和 `instructions`。可选 `summary` 为列表介绍，不充当工作指令；`useCases`、`starterPrompts`、`skillKeys`、`toolNames`、`knowledgeCollectionIds` 均为字符串数组，缺省为空。能力绑定只使用当前可用的资源：技能自动加入本次指令，知识库额外参与检索，非空工具列表限制本次可用工具且不能扩大场景权限；工具为空则沿用聊天工具。

聊天只保留模型菜单中的智能体选项，外层显示“智能体 · 模型”。输入 `/` 或点击 `+` 可插入 `{type:"agent-reference", agentId, name}`；每次请求至多引用一个智能体，该引用优先于会话选择且不会更改会话配置。删除引用或发送下一条普通消息后，恢复会话选择。名称仅用于展示，工作指令始终通过 ID 从当前目录读取；失效引用会拒绝执行。

## 保留的业务规则

- 记录 ID 沿用 32 位紧凑 UUID v7。缺少 ID 或传入旧格式 ID 时生成新 ID；有效 ID 的自定义智能体保存执行更新并保留创建时间。
- 名称及可选文本去除首尾空白，模型的可选空文本存为 `null`；智能体介绍存为空字符串。
- 模型配置为全量替换。第一个标记默认的 Provider 成为默认项；没有标记时选第一项。空列表会清空模型配置。
- Provider 删除级联删除模型；同一个 Provider 下不允许重复 `modelId`。所有替换写入处于同一个事务，任何约束错误都会恢复原数据。

## 存储与错误处理

配置直接使用原来的 `~/.isle-claw/config.db`，也可通过 `ISLE_SERVER_DATA_DIR` 指定根目录。模型、智能体、工作区、故事、技能和知识库配置共用同一份数据库；切换后端不需要复制或导入数据。

配置库当前为 schema v26，不设置 Node 专属 `application_id`。v26 用 `agent_definitions` 保存自定义智能体的完整定义；内置智能体从服务端目录读取，不写入数据库。旧 `ai_agents` 表直接删除，旧角色不兼容、不迁移，原 `get_ai_agent_settings`、`save_ai_agent`、`delete_ai_agent` 命令已移除。旧会话中失效的角色选择会清空，聊天记录仍保留。

历史 v4–v25 升级规则仍用于模型、知识库等保留配置；为兼容历史数据库，原 `collaboration_workflows` 表及已有数据继续保留，但宿主不再读写，旧流程不迁移到插件。数据库升级与版本写入在同一事务内完成，失败会整体回滚。更高版本、不兼容或损坏库保留原文件，通过状态接口报告初始化错误，不自动删库重建。

API Key 与 Tauri 字段契约一致存入 SQLite，并由受认证的模型读取接口返回。支持 POSIX 权限的平台上，配置文件权限为 0600，新建数据目录为 0700。配置错误响应不包含 SQL、参数或凭据。

- `400 INVALID_ARGUMENT`：输入字段、类型或必填内容不合法。
- `409 SETTINGS_CONFLICT`：重复记录等约束冲突，写入已回滚。
- `503 SETTINGS_BUSY`：配置库被其他连接占用，请稍后重试；锁等待上限为 100 毫秒。
- `500 SETTINGS_STORAGE_ERROR`：其他配置读写错误。

当前配置读写为同步、小规模操作，HTTP 请求仍受 1 MiB 限制。文件扫描与网络 Embedding 使用异步操作；知识索引复用原 `rag/index.sqlite`，向量查询使用 sqlite-vec。大规模索引仍受本机资源和同步 SQLite 提交耗时约束，限制见业务接口文档。

这些接口只管理配置记录。桌面与 Web 已统一使用 Node，任务仍显式提交 `runtimeModel` 与智能体工作指令。[工作区登记接口](server-workspaces.md)以及[技能、知识库和应用接口](server-interfaces.md)均已迁移。
