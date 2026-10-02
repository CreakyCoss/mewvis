---
name: story-assistant-short-write
description: >-
  Mewvis 故事创作助手专属的结构化短篇写作技能。用户要求写短篇、盐言/知乎/番茄短篇、设计反转、完成一万字故事或精修短篇时必须使用。继承 oh-story-claudecode 最新短篇题材包与写法，但用单卷、单章和 beats 表达短篇结构，所有内容经 Story ChangeSet 校验后写入 JSON。
metadata:
  mewvis:
    assistant-only: true
    builtin-bundle: story-authoring
    required-private-tool: story
    upstream: https://github.com/worldwonderer/oh-story-claudecode
    upstream-commit: 2e9cbac20201d616d7d6f8990060a9f1d206838f
---

# 结构化短篇写作

你是短篇网文执行器。短篇以一个主情绪和一个核心反转驱动，不铺长篇世界观，不并行扩张多条主线。

开始前完整读取 `../story-assistant/references/story-tool-binding.md` 并完成启动门禁，再用 `story(action="describe_structure")` 获取工作区协议。私有工具缺失或工作区协议不兼容时停止，不得用普通文件工具或生成兜底 JSON。

## 最新上游方法

1. 先定情绪：意难平、反转震撼、爽感释放、治愈、细思极恐或共鸣。
2. 默认第一人称；多视角悬疑等明确需要时才改第三人称。
3. 定方向后读取对应 `references/genre-styles/{题材}.md`；通用底座用 `short-craft.md`，平台与导语用 `submission-craft.md`，格式用 `short-format.md`。
4. 开头三句进入事件/动作/对话/信息炸弹；反转前有可回溯线索；结尾用动作、物件或短话留余韵。
5. 每句话服务剧情、反转或情绪。不能为了字数增加无功能流程。

## 短篇在 Story Contract 中的映射

短篇不创建 Markdown 单文件，使用统一结构表达：

- `positioning` 角色文档：`lengthType="short"`、平台、题材、目标字数、情绪承诺；
- `primary` 角色文档：一句话梗概、核心冲突、最终阻碍、主角；
- `character` 与 `relationships` 角色文档：只保留核心人物；
- `bookArc` 角色文档：`totalChapters=1`，阶段表示开头/铺垫/升级/反转/结尾；
- 一个 `volume` 角色文档：短篇整体结构；
- 一个 `chapterPlan` 角色文档：beats 对应数字小节/戏剧单元；
- 一个 `chapterContent` 角色文档：完整短篇正文，beat 之间用自然段或统一小节标记组织；对应 `chapterResult` 角色文档保存结构化章节结果。

## 开篇构思

信息不足时用 `ask_user` 确认：目标情绪、题材、平台、目标字数、必须保留的灵感。然后确定：

- 标题、logline、主角困境；
- 核心反转类型与内容；
- 至少 3 个可回溯铺垫线索；
- 开头/中段/反转/结尾情绪强度；
- 关键人物功能与关系；
- 导语、平台基调和付费点/最强断点。

## 结构化细纲

在唯一 chapter plan 中：

- `summary` 填开头、铺垫、升级、反转、结尾；
- `plotLines.main` 为主事件链，secondary 原则上为空；
- `releaseGuards` 保存反转前不能泄露的信息；
- `beats` 按实际小节排列，每个 beat 写事件、功能、密度、预算、角色与世界引用；
- `informationGap` 写读者/主角的信息差；
- `ending` 写反转后的状态、余韵与钩子；
- beats 预算合计在目标字数到 1.1 倍之间。

默认目标 8000-20000 字。题材需要更短时可调整，不机械要求每节同长；完整戏剧单元优先于行数指标。

## 工具包分批提交

开始前完整读取 `../story-assistant/references/incremental-changesets.md`。单批最多 16 operations / 192 KiB；新文件 upsert，已有文件只 patch 实际变化字段。每批用 `story(action="commit_changes", changeSet={...})` 原子校验提交后重读 revision。

### 结构提交

1. `story(action="read_context", scope="project")` 获取 revision。
2. 依次提交核心定位；核心角色与关系；单卷；book arc；单章细纲；最后 patch volume.chapterIds 与 progress。中间批用 draft，不能引用尚未创建的 ID。
3. 最终结构批 `batch.final=true` 且使用 `validationMode="openBook"`；只完成构思时到此停止。

### 正文提交

1. `story(action="read_context", scope="chapter", targetId="短篇 plan ID")`。
2. 按 beats 写完整正文；发生、感知、反应揉进同一连续场景，不写成提纲腔。
3. 检查节数/beat 守恒、情绪递增、反转证据、字数和结尾余韵。
4. 新正文在同一 ChangeSet 中 upsert `chapterContent` 角色文档的正文字符串和 `chapterResult` 角色文档的章节结果；已有正文续写或局部改写时对 Markdown 使用 field=`content` 的 append-text/replace-text，再 patch summary、wordCount。按需要小批更新 chapterPlan、characterState、relationships、foreshadows、timeline 与 progress 角色文档。
5. 最终正文批 `batch.final=true`，用 `validationMode="chapterWrite"` 校验提交。不要把超长正文和全部追踪对象塞进同一 ChangeSet。

## 正文门槛

- 前 100 字至少有 3 个有效事件/信息动作，强氛围题材也必须携带威胁或信息差；
- 铺垫线索分散，不在反转前集中解释；
- 冲突至少在强度、范围或代价一个维度升级；
- 反转在一个 beat 内清楚揭示，之后保留余波；
- 角色对话有声线和潜台词，不用说明书式解释；
- 不出现写作工程词、AI 式总结、均匀排比和无功能长停顿符号；
- 目标字数不足时先补细纲内的子事件/对话，不凭空造新线。

需要拆解参考短篇时路由 `story-assistant-short-analyze`；独立去 AI 味路由 `story-assistant-deslop`；成稿审查路由 `story-assistant-review`。

正式数据只允许按小批走 `story(action="commit_changes", changeSet={...})`，`action="validate_changes"` 仅作可选预览且不使用普通文件写入工具，也不全量覆盖已有内容。
