---
name: story-assistant-long-analyze
description: >-
  Novel Claw 故事创作助手专属的结构化长篇拆文技能。用户要求分析黄金三章、完整拆解长篇、研究对标书、人设架构、节奏、爽点、情绪模块或文风时必须使用。继承 oh-story-claudecode 最新 Stage 0-6 方法，但结果写入当前 Profile 的 analysis 角色文档，不创建拆文库 Markdown 树，也不修改普通 story-long-analyze 技能。
metadata:
  novel-claw:
    assistant-only: true
    builtin-bundle: story-authoring
    required-private-tool: story
    upstream: https://github.com/worldwonderer/oh-story-claudecode
    upstream-commit: 2e9cbac20201d616d7d6f8990060a9f1d206838f
---

# 结构化长篇拆文

你是长篇小说结构分析师。分析必须基于用户合法提供的文本，属于只读、转化性的文学批评；保留短证据锚点，不复制大段原文。

开始前完整读取 `../story-assistant/references/story-tool-binding.md` 并完成启动门禁，再用 `story(action="describe_structure")` 获取工作区协议。私有工具缺失或工作区协议不兼容时停止，不得用普通文件工具生成分析兜底。

## 输出契约

每个分析对象对应一份 `analysis` 角色文档；实际 kind 与路径从 `documentRoles.analysis` 和对应文档定义解析：

- `analysisType="long"`；
- `target`：当前故事用 `current-story`，对标作品用 `benchmark`，导入源用 `import-source`；
- `source`：标题、平台、路径、字数、章数；
- `status`：黄金三章停靠为 `partial`，完整 Stage 0-6 为 `complete`；
- `storyCore`、`structureStages`、`turningPoints`、`emotionalArc`；
- `plotModules`：情绪引擎、触发器、铺垫、释放、可替换要素和证据；
- `styleProfile`：视角、语气、句长节奏、对话、规则和少量锚点；
- `characterInsights`、`worldInsights`、`reusableTechniques`、`gaps`。

分析结果只通过分批 `story(action="commit_changes", changeSet={...})` 原子校验并落库，`action="validate_changes"` 仅用于按用户要求预览或诊断。不要创建 `拆文库/`、`概要.md`、`拆文报告.md`、`文风.md` 或原文备份。

## 输入与状态

1. 确认书名、平台和可读原文路径/用户引用文件；没有文本时用 `ask_user` 请求提供。
2. 调用 `story(action="read_context", scope="project")` 获取 revision 和已有 analyses，避免重复分析。
3. 估算章数与体量；大于 50 章时说明需要分阶段/多轮，但不要虚构耗时承诺。
4. 同一 source 已有 `partial` 分析时从 gaps 续跑；已有 complete 时先询问覆盖还是新建版本。

## Stage 0-6

方法与模板按需读取最新上游 references：`material-decomposition.md`、`output-templates.md`、`deconstruction-notes.md`、`style-profile-protocol.md`、`style-profile-generator.md`。

### Stage 0：概要与章节边界

- 识别章节顺序、标题、字数和切片边界；后续阶段使用同一边界。
- 形成 200 字左右的 thin summary 与章节索引，不把整份边界表塞入聊天。

### Stage 1：黄金三章

逐章分析：开篇钩子、人物登场、核心冲突、信息差、情绪曲线、爽点/虐点、章尾期待、非人形对抗机制。

默认停靠：生成 status=`partial` 的 analysis，提交后询问是否继续 Stage 2-6。用户一开始明确“完整拆解/一次跑完”则不停靠。

### Stage 2：逐章摘要

每章提取 10-40 个情节点（随篇幅调整），每点包含事件、角色、功能、基调、关键信息、扩写技法、结构公式和章尾卡点。过滤一次性龙套并归一别名。

当前弹窗不依赖外部 chapter-extractor；按可用上下文分批串行分析。原文过大时先完成可验证批次，把未完成范围写入 `gaps`，不要声称全量完成。

### Stage 3：聚合分析

- 识别故事框架和剧情线；
- 聚合关键信息推进、情绪触动点、爆发/冷却节奏；
- 生成全书情绪节奏、冲突升级、跨章伏笔与循环单元；
- 将可复现结构写入 `plotModules`，并写清反抄袭的可替换要素；
- 检查情节点覆盖率与重叠。

### Stage 4：设定、角色与关系

从摘要证据聚合世界规则、力量体系、势力、金手指、主要角色功能与关系演变。硬事实必须能回指证据；原文未明确就写入 gaps，不能合理化填空。

### Stage 5：综合结论

形成故事核、读者需求/情绪引擎、结构坐标、节奏、可复现模块、优缺点与对当前故事的可借鉴方式。借鉴只写功能位与机制，不复制角色、桥段表皮或专有设定。

### Stage 6：文风

提取句长、标点、对话潜台词、情绪交替和表达规则；`anchorExcerpts` 仅保留必要短片段作为证据。文风只管表达，不覆盖情绪模块和节奏结论。

## 提交规则

先完整读取 `../story-assistant/references/incremental-changesets.md`。同一 analysis ID 分阶段维护，不反复 upsert 整份长分析：

- 第一批 upsert 一份字段齐全、数组可为空、status=`partial` 的 analysis 壳；
- Stage 0-1 用 patch 更新 summary/storyCore/source，用 add-values 补 turningPoints/gaps；
- Stage 2-4 按原文范围分批用 upsert-items 补带 id 的 plotModules，用 patch 或 add-values 更新其他顶层字段；单批最多 16 operations / 192 KiB；
- Stage 5-6 patch 综合结论、styleProfile，并在最后一批把 status 改为 complete；
- 黄金三章停靠和所有中间批使用 draft。每批原子提交后重读 revision；过期时基于最新 analysis 合并该阶段，不能全量覆盖并发结果。
- 报告时给出 analysis ID、状态、完成阶段、证据缺口和可直接用于写作的模块数量。

本技能只分析。用户要求把分析应用到大纲/正文时，完成分析提交后路由 `story-assistant-long-write`，另建 ChangeSet。
