# 故事工坊

故事工坊位于 `apps/applications/builtins/story`。它提供故事库、资料编辑、创作助手、酒馆管理与角色演绎。宿主只提供应用沙箱、工作区、数据、聊天、模型目录和剪贴板能力。

## 代码归属

| 目录                                   | 职责                                                           |
| -------------------------------------- | -------------------------------------------------------------- |
| `main/stories`                         | 故事库、结构化编辑器、助手界面、酒馆配置、房间及导演／角色编排 |
| `core/project`                         | Story Contract、类型定义、上下文构建、校验与原子提交           |
| `main/host/authoring/tool`             | story 工具参数归一化、操作分发与输出协议                       |
| `main/host`                            | 应用工具与文件访问                                             |
| `main/platform`                        | SDK 适配：项目接口、登记、目录选择、模型、会话和剪贴板能力     |
| `main/assets`、`main/styles/theme.css` | 故事头像、背景和酒馆专属样式                                   |
| `main/host/authoring/skills`           | 故事助手路由与子技能；由应用统一发布                           |

故事从通用应用入口打开，故事／酒馆业务逻辑由应用实现，工具和技能通过应用宿主注册。

宿主维护系统猫头像、智能体头像和通用空白头像；故事人物头像、酒馆背景及酒馆专属样式由故事应用维护。两端各自提供空白头像作为缺失／未知 ID 的兜底。资源归属由应用边界检查约束，通用协议辅助代码由 Agent Runtime 提供。

## 适配方式

`core/` 保存故事项目的业务内核与协议基础，`@story/project` 别名指向 `core/project`。Node 文件系统适配放在 `main/host/adapters/project-file.ts`，助手配置放在 `main/stories/assistant/profile.ts`，主题放在 `main/styles/theme.css`。

宿主与故事共用 `packages/design-system` 的组件、主题变量和通用样式，组件从 `design-system/components/...` 引用。`cn` 和通用 hooks 分别由 `design-system/lib/utils`、`design-system/hooks/...` 提供。知识库列表样式属于宿主，酒馆强调样式属于故事应用。酒馆文件写入时由应用后端创建父目录。

窗口标题栏与拖动区域由宿主统一管理，故事页面默认全屏，占满标题栏下方的应用工作区；顶部保留全屏切换与返回应用列表的入口。故事页面不设置窗口拖动区或为其预留空间，SDK 不提供窗口拖动接口。

页面通过 `project-client` 调用应用自己的 `mewvis_story_project`，执行共享领域内核。Agent 使用 `story` 工具及应用技能，先调用 `describe_structure`，再通过 ChangeSet 校验并提交正式数据。

故事库登记保存在应用 storage。新建故事先选择父目录，以独占模式创建子目录；已有故事可通过「导入故事」登记，也可重命名或移除登记。项目文件位于故事工作区的 `story/`，酒馆配置为 `story/tavern.json`，章节消息为 `.tavern/<故事 ID>/<章节>/messages.json`。项目内核负责格式校验、兼容性检查和版本升级。

创作助手使用公共 Chat 组件及应用会话。酒馆负责导演／角色编排、输入输出协议、消息显示与模型选择；底层执行经 Chat SDK，每个章节和角色独立恢复会话，重置仅删除该章节的角色会话。模型目录只包含可选 ID 和显示信息，凭据由宿主解析。

## 工具与技能注册

故事创作能力按能力包组织：入口声明工具与技能，协议、工具实现、技能源文件相邻放置。阅读时从 `authoring/index.ts` 进入即可。

```text
main/host/
├── index.ts                    # 向宿主注册
├── registry.ts                 # 汇总、校验注册表
├── definition.ts               # 工具与协议定义类型
├── authoring/
│   ├── index.ts                # 声明创作能力包：skill + tools
│   ├── protocol.ts             # Story Tool Contract
│   ├── tool/
│   │   ├── definition.ts       # 工具定义和操作分发
│   │   ├── request.ts          # 参数约束与归一化
│   │   ├── service.ts          # 协议方法实现
│   │   ├── repository.ts       # 存储接口
│   │   └── adapter.ts          # 转换为 SDK 工具
│   └── skills/
│       ├── definition.ts       # 技能包声明与所需协议
│       ├── tools.ts            # 技能与资源读取工具
│       ├── runtime.md          # 应用运行约定
│       └── story-assistant-*/  # SKILL.md、references、scripts
├── tools/                      # 项目、酒馆、应用模块工具
├── adapters/                   # 工作区绑定、Schema 转换、注册校验
└── generated/skills.ts          # 自动生成的技能数据
```

工具、技能和 Story Contract 的适配校验由故事应用负责，宿主只接收标准 SDK 定义。`main/host/registry.ts` 汇总模块工具、绑定工作区的工具和技能，通过校验后返回 `{ tools, skills }`；`index.ts` 只遍历列表调用 `ctx.tools.register` 和 `ctx.skills.register`。技能通过 `defineSkill` 定义。

`main/host/authoring/skills/` 是技能源文件；`generate:skills` 解析 YAML frontmatter，打包正文与私有资源，并生成工具依赖、子技能路由、显式资源路径和 story action 列表。`main/host/generated/skills.ts` 是自动生成的数据，不手工维护。技能所需的协议版本和方法由 `main/host/authoring/skills/definition.ts` 独立声明，不能直接引用工具提供方的版本，以免升级工具时绕过兼容检查。

`check:registry` 在应用侧校验完整列表：工具／技能重名、依赖缺失、协议版本和方法实现、适配参数、路由目标、SKILL.md 中显式资源路径及 action。动态资源路径检查其目录存在；自然语言语义、参考资料中的示例和脚本执行效果仍需集成验证。脚本资源仍按文本提供，应用不开放进程执行。

`dev`、`build`、`check` 都先生成技能数据、执行注册表校验；启动时也先校验再注册，避免适配失败时只注册部分能力。构建校验只构造定义，不访问用户工作区。新增技能或更改工具协议后，应同时运行应用测试。

## 项目版本与导入

`checkCompatibility` 按项目格式、故事类型、定义版本和文档结构检查工作区。项目格式不符、故事类型未知、版本高于当前应用或文档校验失败时，返回不兼容。

旧项目定义的版本低于当前版本，且项目文档能通过当前定义校验时，返回 `upgrade-available`。已登记项目可通过「升级版本」更新项目定义；该操作不转换不符合当前结构的旧文档。导入入口只接受检查结果为 `compatible` 的工作区，不自动执行升级。

故事列表只读取应用 storage 中的登记，不读取宿主配置库的旧 `stories` 表，也不自动接管旧工作区或转换旧助手／酒馆聊天。宿主配置库保留该表不代表旧故事登记可用；当前应用不提供旧宿主登记和聊天格式的迁移或回退恢复入口。

## 验证

`pnpm --filter @mewvis/story test` 覆盖领域内核、工具契约、原子提交、酒馆协议、应用工作区绑定、文件边界、历史 ID 兼容和列表读取无迁移副作用。宿主回归使用 server、SDK、app-dev 和客户端应用聊天测试。浏览器验收应覆盖库列表、新建／导入、资料编辑保存、助手历史、酒馆配置及章节房间；真实模型演绎需要已配置的模型。
