# Story 私有工具绑定

本技能属于 agent-runtime 的 `story-authoring` 内置能力包。技能只依赖版本化的 Story Tool Contract；运行时仅在私有 `story` 工具完整实现这五个方法时加载整套 `story-assistant-*` 技能。这个工具不进入前端公共工具目录，也不由用户单独启用或关闭。

## 启动门禁

1. 读取或写入故事前，确认当前会话提供 `story` 工具。
2. 如果工具不存在，停止故事工作流并报告“story-authoring 内置能力绑定失败”。不要使用普通文件工具修改 `story/`，也不要生成未校验的 JSON 兜底。
3. 首次进入工作流调用 `story(action="describe_structure")`。工具从工作区故事类型定义返回轻量目录。从 `structure.storyType` 读取故事类型 ID 和版本，从 `structure.roles` 解析语义角色，从 `structure.documents`、`structure.contexts` 和 `structure.validationModes` 读取路径、上下文和校验能力。不要要求一次返回全部字段。
4. 构造每个批次前，把本批需要的语义角色解析为 kind，再调用 `story(action="describe_structure", documentKinds=[...])`。完整字段位于 `structure.schemas.documents[kind].fields`，递归嵌套定义位于 `structure.schemas.objectDefinitions`；一次只请求本批需要的 kind。
5. 调用 `story(action="read_context", scope="project")`。如果项目尚未初始化，再调用 `story(action="initialize", storyId="...", title="...")`，然后重新读取上下文。
6. `initialize` 遇到已有故事记录时默认拒绝替换。只有用户明确确认可替换，才能传 `replaceExisting=true`。

## 写入边界

- 所有正式变更使用小批次 `story(action="commit_changes", changeSet={...})`。
- 本技能只消费 Story Tool Contract 的结构描述、初始化、上下文读取、变更校验和原子提交方法，不依赖工具内部的故事类型解析、文件存储或事务实现。`describe_structure` 失败时报告工具或工作区故事类型问题，不要猜测目录和字段。
- `read_context` 返回 `{text,sections,sources,revision}`。写作时以已经按中文 label 格式化的 `text` 为唯一正文上下文；Agent 工具结果里的 `sections` 只保留分区 ID、优先级和来源元数据，正文不再重复一份，用 `sources` 追踪来源。`scope="chapter"` 返回的是按目标细纲引用和章节邻接关系定向筛选后的写作简报，不是全项目文档转储；不要额外按默认目录猜测、扫描 Markdown 或读取遗漏内容。
- 每个 ChangeSet 携带本轮 `describe_structure` 返回的 `structure.storyType.id` 与 `structure.storyType.version`，字段分别为 `storyTypeId` 与 `storyTypeVersion`。版本不匹配时重新 describe，并只重建失败批次。
- 任何工作流先通过 `structure.roles[role]` 取得 kind，再读取 `structure.documents[kind].identityFields`，构造 `{ kind, identity }` 文档引用，并按需请求该 kind 的 schema。角色不存在表示当前故事类型没有该能力；停止对应工作流并说明缺少的角色，不得猜 kind 或替代文档。
- 创建文档前按 kind 查 `structure.schemas.documents[kind].fields`，只提交其中声明的业务字段；嵌套对象按 `definition` / `itemDefinition` 查 `structure.schemas.objectDefinitions`。字段 label、描述、路径、默认值、只读字段和校验规则均由故事类型维护。
- 磁盘中的结构化资料是普通 JSON。章节正文使用 `chapterContent` 角色指向的 Markdown 文档，章节摘要、引用和状态变化使用 `chapterResult` 角色指向的结构化文档；实际 kind 和路径只从本轮结构描述解析。
- `validate_changes` 只用于用户明确要求预览或诊断，不作为每批固定前置步骤。
- 不使用普通文件工具维护正式故事内容，也不自行修改 manifest 或 `story/.isle-claw/project.json`。
- 技能不定义、复制或升级具体故事类型。Stories 创建工作区时选择故事类型，工具按工作区定义实现统一处理。新增文档只要已进入故事类型定义，技能就按 `describe_structure` 使用；`validationMode` 只能选择 `structure.validationModes` 已声明的值。
