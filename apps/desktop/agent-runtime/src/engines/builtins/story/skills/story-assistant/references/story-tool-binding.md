# Story 私有工具绑定

本技能属于 agent-runtime 的 `story-authoring` 内置能力包。技能依赖版本化的 Story Tool Contract；Story 模块只在私有 `story` 工具实现完整接口时才会导出 `STORY_BUILTIN` 成品。运行时会加载完整的 `story-assistant-*` 技能集合并注入该工具。这个工具不会出现在前端公共工具目录中，也不由用户单独启用或关闭。

## 启动门禁

1. 读取或写入故事前，确认当前会话提供 `story` 工具。
2. 如果工具不存在，立即停止故事工作流并报告“story-authoring 内置能力绑定失败”。不要使用 write/edit/bash 修改 `story/`，不要生成普通 JSON 兜底，也不要声称已经落库。
3. 首次进入工作流调用 `story(action="describe_structure")`。工具会读取工作区固定保存的 `story/.novel-claw/contract.json`，根据 `$format` 选择受信任的 `StoryContractCompiler`，并只在 Compiler 完整实现 Story Project Protocol、编译成功且锁校验通过后返回结构。从 `structure.contract` 读取 `contractId`、`contractVersion`、`documents`、`objectDefinitions`、字段定义和校验 profile；这里拿到的是 Compiler 标准化后的结构描述，不是原始 contract 源码。编译后的工作区协议是唯一权威要求。技能中的路径和字段示例只用于规划，发生差异时以工具返回值为准。
4. 调用 `story(action="read_context", scope="project")`。如果项目尚未初始化，再调用 `story(action="initialize", storyId="...", title="...")`，然后重新读取上下文。
5. `action="initialize"` 遇到已有 JSON 时默认拒绝替换。只有用户明确确认这些文件可被替换，才能传 `replaceExistingJson=true`。

## 写入边界

- 所有正式变更使用小批次 `story(action="commit_changes", changeSet={...})`。
- 本技能只依赖 Story Tool Contract 中稳定的结构描述、初始化、上下文读取、变更校验和原子提交方法。默认 Story Tool 实现只依赖 Story Project Protocol 中稳定的项目模型、上下文、校验和原子变更方法；这些要求是强类型接口及运行时实现校验，不由技能动态传入，也不由 contract.json 中的字符串声明。`describe_structure` 失败时报告 Tool API、Story Project API、Compiler 或协议格式问题，不要猜测目录或字段。
- `read_context` 返回 `contextView`，说明本次数据由协议中的哪个视图组合。只使用返回的数据和 `sources`，不要额外按默认目录猜测并读取遗漏内容。
- 每个 ChangeSet 必须原样携带本轮 `describe_structure` 返回的 `contractId` 与 `contractVersion`。不要记忆、猜测或自行升级版本；版本不匹配时重新 describe 并按新 contract 构造当前批。
- 创建文档前按 kind 查 `structure.contract.documents[kind]`，只提交其中声明的普通数据字段；嵌套对象按 `definition` / `itemDefinition` 查 `objectDefinitions`。字段 label、描述、路径、默认值、只读字段和校验规则由工具及 contract 维护，技能不得另造一套 Schema。
- 磁盘中的 JSON 由工具编码为 `$contract` / `$document` / `$schema` / `data` 自描述信封。ChangeSet 的 `value`、`patch` 和数组 items 始终只提交普通业务 data，不提交或复制这些信封字段；工具会生成字段 label、描述和所需对象定义。
- `action="validate_changes"` 只用于用户明确要求预览或诊断，不作为每批固定前置步骤。
- 不使用普通文件工具维护正式故事内容，也不自行修改 manifest。
- 技能不定义、复制或升级项目协议。协议由故事工作区提供；工具通过受信任 Compiler 将它实现为 Story Project API。不要在会话参数里临时传入 Schema；ChangeSet 的 `validationProfile` 只控制完整度校验。
