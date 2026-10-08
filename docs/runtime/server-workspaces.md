# Server 工作区管理

[Node 后端服务](server.md)通过 `config.db` 登记工作区，提供以下四个接口。所有请求通过已认证的 `POST /api/commands/<命令名>` 发送。

## 接口契约

| 命令               | 请求体                                              | 返回           |
| ------------------ | --------------------------------------------------- | -------------- |
| `list_workspaces`  | `{}`                                                | `Workspace[]`  |
| `create_workspace` | `{input: {name, path, description?, groupId?}}`     | 新工作区       |
| `update_workspace` | `{input: {id, name, path, description?, groupId?}}` | 更新后的工作区 |
| `delete_workspace` | `{input: {id}}`                                     | `null`         |

工作区记录包含 `id`、`name`、`description`、`path`、`isDefault`、`isPinned`、`order`、`groupId`、`createdAt`、`updatedAt`。ID 使用紧凑 UUID v7，时间戳为毫秒。

新建示例，请替换为本机目标目录的绝对路径：

```json
{
  "input": {
    "name": "我的项目",
    "path": "/absolute/path/to/project",
    "description": "开发工作区"
  }
}
```

返回的 `path` 是规范化后的路径，可直接用作 Agent 命令中的 `workspacePath`。工作区登记与 Agent 任务保持独立：运行 Agent 不强制要求先登记，删除登记也不取消已运行的任务。

## 默认工作区与分组

默认工作区位于 `<MEWVIS_SERVER_DATA_DIR>/default-workspace`，末级目录名读取产品配置 `defaultWorkspaceDirName`。首次列出工作区时初始化目录、`workspace.db` 和登记记录；并发请求也只创建一条默认记录。默认工作区置顶，由系统管理，禁止编辑、删除或作为普通工作区创建。

直接复用 `config.db` 中的 `workspace_groups` 和 `workspaces`，当前配置库为 schema v27，这两张表沿用原有结构。启动时保留并修复默认分组，缺少时创建「默认分组」。默认工作区位于 `~/.mewvis/default-workspace`，当前数据库中已有工作区的登记路径直接使用。

未传 `groupId`、传空字符串或传不存在的分组时，回退到默认分组。新工作区追加在目标分组末尾；更新时分组不变则保留顺序，跨分组则追加到目标分组末尾。列表按置顶、顺序、创建时间倒序排列。

当前不提供分组 CRUD、置顶或拖拽排序命令；记录保留对应字段和分组归属规则。

## 目录与数据文件

目录不存在时创建。路径必须为绝对路径，按组件解析真实目录和符号链接，再处理父目录 `..`，避免把符号链接后面的父路径错误地按字符串折叠。文件路径、失效符号链接及不可访问目录均被拒绝。

每个工作区根目录初始化 `workspace.db`。当前工作区数据库 schema 为 v1，无业务表；初始化时保留已有表与内容。现有更高版本或损坏数据库会报错，不自动删除或重建。`workspace.db` 本身必须是普通文件，不接受指向外部文件的符号链接。

新建、更新和默认工作区保护均比较规范化路径，包括指向默认工作区的目录别名。普通工作区不能通过更新变成默认工作区。

同一个普通目录可以有多条登记。更新目录只切换登记并初始化新目标，不移动旧目录的内容。删除工作区只删除登记，保留目录、数据库、会话和其他文件；重复删除不存在的 ID 返回 404。

配置数据库操作放在事务中，文件准备使用异步 I/O。两者不构成跨文件系统事务：如果目录已经创建，后续数据库登记失败，会保留目录和 `workspace.db`，不会为了回滚登记而删除用户文件。服务关闭会先等待已派发的业务操作收尾，再关闭配置库。

## 错误与边界

- `400 INVALID_ARGUMENT`：参数、必填内容或绝对路径不合法。
- `400 WORKSPACE_UNAVAILABLE`：路径不可访问或目录初始化失败。
- `400 WORKSPACE_DATABASE_UNAVAILABLE`：`workspace.db` 不是普通文件。
- `404 WORKSPACE_NOT_FOUND`：要更新或删除的登记不存在。
- `409 DEFAULT_WORKSPACE_MANAGED`：试图修改默认工作区，或用普通登记指向默认目录。
- `409 WORKSPACE_SCHEMA_TOO_NEW`：工作区数据库版本过高。
- `409 WORKSPACE_CONFLICT`：数据库约束冲突。
- `503 WORKSPACE_BUSY`：数据库被占用；锁等待上限为 100 毫秒。
- `500 WORKSPACE_STORAGE_ERROR`：其他数据库读写错误，响应不包含 SQL 或参数。

本页介绍工作区登记和初始化。工作区文件、版本控制、聊天、知识检索与应用工作区接口另见 [Server 业务接口](server-interfaces.md)。桌面与 Web 均通过 Node 调用这些接口。
