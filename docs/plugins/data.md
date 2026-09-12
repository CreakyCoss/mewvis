# 插件数据与工作区 SDK

`@isle/plugin-sdk/data` 为插件提供标准持久化接口：工作区新增与查询，以及通用业务数据的增删改查。桌面插件页面和原生 Node PluginHost 已接入，实际落库由宿主负责，插件无需知道后端使用 YAML 还是 SQLite。

## 职责边界

SDK 管理持久化数据和工作区登记。插件自行选择当前工作区、组织文件、加载聊天、恢复业务状态。插件工作区不进入宿主工作区列表，也不改变宿主当前选择。

插件通过本 SDK 访问宿主管理的插件持久化数据，接口只暴露当前插件的业务键和工作区登记，不提供宿主配置、宿主默认工作区或其他插件的私有数据。Chat 只接受此登记表中的工作区 ID，不提供另一套查询入口，也不回退到宿主工作区。用户明确选择并完成登记的目录可以正常使用，宿主不因其物理位置额外限制插件的普通文件操作。

工作区创建或确认加入成功后，普通文件操作与宿主工作区使用相同规则，只受既有标准沙箱和所选权限档位控制。SDK 不增加插件工作区专属的文件访问限制，不修改 Agent／Pi 的执行流程，也不代理插件业务。

权限声明供用户审核，并用于 SDK 对应宿主接口的检查。它可以阻止未声明权限的插件通过 SDK 创建、登记工作区或写入业务数据；插件直接调用文件系统创建普通目录，仍由原有执行环境控制。

## 接入

声明所需权限，两个权限相互独立：

```json
{
  "isle": {
    "permissions": ["plugin-data", "plugin-workspaces"]
  }
}
```

使用 `isle.config.ts` 的插件在 `permissions` 中填写同样的名称。安装页面会分别展示「读写插件数据」和「创建和查询插件工作区」。

插件页面使用当前沙箱中宿主提供的连接：

```ts
import { getPluginDataClient } from "@isle/plugin-sdk/data";

const { storage, workspaces } = getPluginDataClient();
const workspace = await workspaces.create({ name: "小说 A" });
if (workspace) {
  await storage.setItem("activeWorkspaceId", workspace.id);
  await storage.setItem("editorState", {
    currentFile: "chapters/001.md",
    cursor: 120,
  });
}

// 下次加载时恢复引用；如何读取目录中的文件与聊天由插件决定。
const id = await storage.getItem<string>("activeWorkspaceId");
const selected = id ? await workspaces.get(id) : null;
const registered = await workspaces.list();
```

原生 Node 插件在 `inject` 中声明 `storage`、`workspaces`，通过 `ctx.storage`、`ctx.workspaces` 使用相同接口。`IslePluginContext` 的字段保持可选，以兼容未接入的自定义宿主。

纯 JavaScript 客户端 `createPluginDataClient(transport)` 不依赖 Node、DOM、Tauri 或数据库驱动。自定义宿主可提供自己的 transport。独立 Agent 运行环境及 DSH 兼容适配器没有自动接入本服务；无宿主连接时明确报告能力不可用，不回退到浏览器存储或内存，也不自动重试。

`@isle/plugin-dev` 的浏览器开发预览显式注入内存数据适配，按声明检查权限，支持业务键和虚拟工作区，整页刷新即清空。它不连接原生数据库，不打开真实目录选择器；持久化、共享确认和目录访问需在 Isle 中验证。[聊天调试台](builtins/chat-playground.md)提供完整接入示例。

## 通用业务数据

接口类似 sessionStorage，但异步执行且跨应用重启持久化。

| 方法                  | 行为                                                                          |
| --------------------- | ----------------------------------------------------------------------------- |
| `getItem<T>(key)`     | 读取 JSON 值；不存在返回 `null`。`T` 是调用方类型断言，插件仍需校验业务结构。 |
| `setItem(key, value)` | 整体替换一个键；成功表示数据库已提交。                                        |
| `removeItem(key)`     | 删除一个业务键，不存在也成功。                                                |
| `clear()`             | 清除当前插件的全部业务键。                                                    |
| `keys()`              | 返回业务键的快照，不承诺顺序。                                                |

键允许空字符串、`__proto__` 等普通名称。值支持普通 JSON 对象、数组、字符串、有限数值、布尔值和 `null`。SDK 拒绝 undefined、NaN、Infinity、bigint、函数、类实例、循环引用、稀疏数组、访问器和非 JSON 属性，最大嵌套深度为 100；日期需显式编码。派发时复制写入值，后续修改调用方对象不会改变本次写入。

保存的 `null` 和不存在的键读取时都返回 `null`，需要区分可使用 `keys()`。每次写入、删除或清空是一个原子操作；多次调用不构成事务，`getItem` 后 `setItem` 不是原子读改写。并发写同一个键以实际提交顺序为准。

业务键与工作区登记分开保存。`setItem("workspaces", ...)` 不会修改登记记录；`clear()` 不删除配置、工作区、文件或聊天。共享工作区也不会共享两个插件的全局 storage。

## 工作区

```ts
type PluginWorkspace = Readonly<{
  id: string;
  name: string;
  path: string;
  isDefault: boolean;
}>;

interface PluginWorkspaces {
  create(input: {
    name: string;
    path?: string;
  }): Promise<PluginWorkspace | null>;
  list(): Promise<PluginWorkspace[]>;
  get(id: string): Promise<PluginWorkspace>;
}
```

`id` 是稳定工作区标识，同一目录的成员插件共享此 ID。`name` 是当前插件登记的显示名，`path` 是规范化后的绝对目录，`isDefault` 表示当前插件的默认工作区。描述对象不是额外的文件权限令牌。

### 新增

`create` 要求非空名称。省略 `path` 时宿主打开目录选择器；显式路径必须是本地绝对路径。两种入口都经过相同的共享检查，插件不能传入 `approved`、成员列表或其他插件身份。

插件与宿主工作区共用路径规范化和目录初始化代码，解析已有目录别名，并初始化标准 `workspace.db`。已有文件和聊天不会被清空。工作区登记写入当前插件的数据库，不写入宿主工作区列表。

已登记且标识有效的目录直接返回原记录，不重复初始化、改名或弹出确认。其他插件已使用的目录，以及存在标识但本机缺少当前插件登记的目录，需要用户确认。提示包含目录、已登记插件，以及按现有沙箱和权限档位读取、修改、删除共享文件可能带来的影响。

取消目录选择或共享确认返回 `null`，不会新增工作区登记或修改共享目录。需要交互但没有可见宿主窗口时返回 `CONFIRMATION_UNAVAILABLE`。目录选择与确认共用 60 秒期限；超时不视为同意，之后的迟到确认不会完成登记。SDK 传输为 create 保留更长的等待时间。

确认后宿主重新检查连接、权限和目录标识。若成员或目录已变化，返回错误，插件应重新发起，让用户看到最新信息。

### 查询与默认目录

首次 `list()` 创建并登记 `plugins/<namespace>/workspace/` 默认工作区。`create()` 取消时不会顺便创建默认目录。默认目录已有标识而本机登记丢失时，`list()` 不自动加入；插件需显式调用 `create` 完成确认。

`list()` 返回当前插件自己的全部登记，包含默认工作区。目录暂时丢失时保留记录，不自动生成一个空目录替代原数据。

`get(id)` 仅查询当前插件的登记，并验证目录及标识，不创建目录或弹出确认。未知和未登记 ID 均返回 `WORKSPACE_NOT_FOUND`；目录丢失、移动或不可访问返回 `WORKSPACE_UNAVAILABLE`；标识损坏、缺失或不匹配返回 `WORKSPACE_MARKER_INVALID`。

当前选择属于插件业务数据，可使用 `storage.setItem("activeWorkspaceId", id)` 保存。创建工作区和保存当前选择是两个独立操作；后者失败时，前者仍可通过 `list()` 找回。

### 隐藏标识与共享

宿主在工作区中维护 `.isle/workspace.json`，记录格式版本、工作区 ID、插件列表、创建时间，并保留已有扩展元数据。具体文件格式由宿主管理，不作为插件业务接口。SDK 使用本机登记和标识共同判断是否已加入，不能仅靠编辑标识获得已有登记。

成员更新使用文件锁和原子替换；并发加入时如果确认的成员快照已变化，拒绝本次登记，避免丢失其他插件的成员记录。标识损坏或版本不支持时保留原文件，不按新目录处理。当前插件复制或移动目录造成同 ID、不同路径时，不静默重新绑定，需先处理原登记及目录；本版不提供移动和重新关联接口。

标识和登记用于 SDK 数据管理，不形成另一套文件系统沙箱。插件仍按自身业务逻辑和现有执行环境读写文件。

## 宿主持久化与权限

| SDK 服务       | 所需声明            |
| -------------- | ------------------- |
| `storage.*`    | `plugin-data`       |
| `workspaces.*` | `plugin-workspaces` |

SDK 导出 `PLUGIN_DATA_PERMISSIONS` 映射。调用方身份由宿主连接确定，每次请求检查插件是否启用及是否声明对应权限。未声明、禁用或连接撤销都返回 `PERMISSION_DENIED`，在拒绝前不创建目录或写入业务记录。工作区创建不要求额外声明 `plugin-data` 或 `workspace-files`。

父页面固定 iframe 的插件身份，连接令牌不会交给 iframe；原生 PluginHost 使用宿主签发的令牌。请求不能通过插件 ID、数据库名、SQL 或文件路径切换到其他插件的业务键空间。禁用、卸载和关闭连接会撤销旧连接。

当前后端把每个插件的数据统一放在应用数据目录的 `plugins/<namespace>/` 下。namespace 使用完整插件 ID，例如 `@isle/chat-playground`；特殊字符会转义，避免不同插件重名或路径越界。

```text
plugins/
  registry.json                    # 宿主维护的启用状态
  pnpm-store/                      # 安装器共享缓存
  @isle/chat-playground/
    settings.yaml                  # defineSettings 配置（按需创建）
    storage.sqlite                 # SDK 业务键与工作区登记
    workspace/                     # 默认工作区
      workspace.db
      .isle/workspace.json          # 工作区 ID、插件成员及元数据
      .isle-claw/chats/             # 聊天保存后创建
  @vendor/example/
    package/                       # 外部安装包及其依赖
    settings.yaml
    storage.sqlite
    workspace/
```

内置插件代码随应用资源发布；外部安装包保存在对应 namespace 的 `package/` 中。升级或卸载只替换/移除安装包，保留配置和业务数据。用户选择的外部工作区保留原路径，其登记保存在所属插件的 `storage.sqlite` 中。插件业务文件放在这些工作区；配置和持久化记录由宿主管理，通过 SDK 访问。

宿主在启动插件服务之前迁移旧的 `data/<十六进制插件 ID>/` 中的 SDK 数据库与默认工作区，以及 `packages/` 和共享配置。默认工作区移动时保留 ID、标识及文件，并同步更新各插件的共享登记；SDK 业务值保持不变，不改写插件自定义 JSON 中的任意路径。旧 namespace 配置优先于共享配置及其备份，写入新配置并核验数据库成功后才删除旧文件和空目录。迁移使用持久记录，可在失败后重试；目标冲突、文件损坏或无法确定旧设置所属插件时停止启动，保留数据供处理。现有插件按包 ID、历史 namespace 名及内置 RSS 的 `dsh-rss` 别名匹配。

`settings.yaml` 按设置 namespace 保存用户覆盖和 `$version`，并包含宿主格式标记 `$islePluginSettings`。它不自动转换成 SDK 业务键。SQLite 中业务键和工作区登记属于不同表；宿主自动升级旧表结构。后端布局和表结构不是 SDK 承诺，插件只使用公开接口。

单次请求上限为 256 KiB，存储键上限为 4096 UTF-8 字节，响应上限为 4 MiB。工作区名称上限为 512 UTF-8 字节；隐藏标识上限为 64 KiB。超出上限明确失败，本版没有列表分页。空 storage 的读取、删除和清空不会创建数据库；工作区登记可独立初始化它自己的表。

## 传输与错误

传输为 `{ version: 1, request(request) }`，请求与响应只包含 JSON 数据。例如：

```json
{
  "version": 1,
  "method": "storage.setItem",
  "params": { "key": "editorState", "value": { "cursor": 120 } }
}
```

成功返回 `{ "ok": true, "value": ... }`，无返回值操作返回成功的 `null`。失败返回 `{ "ok": false, "error": { "code": "PERMISSION_DENIED", "message": "未声明权限" } }`。SDK 将错误转换为带 `code` 的 `PluginDataError`。

| 错误码                     | 含义                                        |
| -------------------------- | ------------------------------------------- |
| `CAPABILITY_UNAVAILABLE`   | 当前宿主没有数据能力或版本不支持。          |
| `PERMISSION_DENIED`        | 插件未启用、未声明所需 SDK 权限或连接失效。 |
| `INVALID_ARGUMENT`         | 请求或 JSON 值不符合契约。                  |
| `WORKSPACE_NOT_FOUND`      | 当前插件没有该登记。                        |
| `WORKSPACE_UNAVAILABLE`    | 目录不可用、初始化失败或确认期间发生变化。  |
| `WORKSPACE_MARKER_INVALID` | 标识缺失、损坏、版本不支持或与登记冲突。    |
| `CONFIRMATION_UNAVAILABLE` | 无法展示交互，或交互已超时。                |
| `STORAGE_ERROR`            | 宿主落库失败或结果超出容量限制。            |
| `INTERNAL_ERROR`           | 其他宿主错误。                              |
| `INVALID_RESPONSE`         | 响应不符合 SDK 契约。                       |
| `TRANSPORT_ERROR`          | 连接或传输失败，操作结果可能未知。          |

客户端不自动重试写入、清空或创建。传输失败时应重新读取状态确认，避免重复覆盖或误判数据丢失。

## 验证

在仓库根目录运行：

```sh
pnpm --filter @isle/plugin-sdk test
pnpm --filter @isle/plugin-dev exec tsc -p ../plugin-sdk/test/tsconfig.json
pnpm --filter @isle/plugin-dev exec node --test test/data-sdk.test.mjs
pnpm --filter desktop test:plugin-host:data
```

测试覆盖 SDK JSON 契约、插件独立打包、页面桥接、真实 SQLite 与 Node PluginHost 重启恢复，以及权限拒绝、默认目录、共享确认取消、并发加入、目录别名、标识异常、旧数据迁移和 clear 的范围。测试不依赖模型服务；自动化确认测试通过宿主交互接口注入选择结果，不会替真实用户批准共享。
