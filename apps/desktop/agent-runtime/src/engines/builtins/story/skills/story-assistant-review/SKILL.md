---
name: story-assistant-review
description: >-
  Novel Claw 故事创作助手专属的结构化审稿技能。用户要求审查章节、全书、结构、人物、平台适配、事实一致性、伏笔或文字质量时必须使用。采用 oh-story-claudecode 最新多视角 rubric，但在故事弹窗中直接完成审查并写入当前故事类型的 review 角色文档；默认只审不改，不调用普通 story-review 或外部 reviewer agents。
metadata:
  novel-claw:
    assistant-only: true
    builtin-bundle: story-authoring
    required-private-tool: story
    upstream: https://github.com/worldwonderer/oh-story-claudecode
    upstream-commit: 2e9cbac20201d616d7d6f8990060a9f1d206838f
---

# 结构化故事审查

审查的职责是找问题，不是证明作品正确。当前故事弹窗不 spawn 外部 reviewer；用同一上下文依次执行结构、人物、文字和一致性视角，结果统一落为 JSON。

开始前完整读取 `../story-assistant/references/story-tool-binding.md` 并完成启动门禁，再用 `story(action="describe_structure")` 获取工作区协议并据此读写。私有工具缺失或工作区协议不兼容时停止，不得用普通文件工具生成审查兜底。

## 模式

- full：结构、人物、文字、平台、一致性全部检查；
- lean：结构 + 一致性；
- solo：与 full 相同的统一格式，但适合单章/短片段；
- 未指定默认 full。

## 收集范围

1. 用户指定章节就只审指定范围；未指定时用 `ask_user` 确认，不能默认全书。
2. 对每章调用 `story(action="read_context", scope="chapter", targetId=...)`；跨章时逐章读取并汇总。
3. 同时消费项目定位、平台、卷纲、细纲、角色状态、关系、世界规则、伏笔、时间线和已有 review。
4. 证据不足要明确记录，不能把猜测写成 finding。

按需读取最新上游：`references/quality-rubric.md`、`quality-checklist.md`、平台 `rubrics/fanqie.md|qidian.md|zhihu.md`、`character-relations.md`、`dialogue-mastery.md`、`anti-ai-writing.md`。

## 审查维度

### 结构

- 核心卖点、冲突推进、情绪曲线、钩子和期待；
- 目标→阻碍→行动→代价/反馈→新期待的最小循环；
- 高潮蓄能、假胜、崩解、兑现；
- 是否越过细纲 release guards，或用新主线掩盖细纲不足。

### 角色

- 行为是否符合动机、状态、已知信息和关系阶段；
- 对话是否有声线、潜台词和信息控制；
- 是否出现高压场景仍插科打诨、角色充当科普嘴、突然信任/敌对。

### 文字

- AI 套话、解释腔、作者总结、模板比喻和均匀节奏；
- 工程元信息、退化复读、截断、占位符；
- 段落、对话、标点和具体字数表达是否自然；
- 只在 full/solo 检查，lean 不对文字自然度下结论。

### 一致性

- 角色属性、能力边界、地点、术语、时间线和世界规则；
- 伏笔 planned/planted/resolved 状态是否与正文一致；
- 跨章因果、代价和知识边界是否断线。

### 平台

- 番茄：强开局、强冲突、高频反馈、低理解门槛；
- 起点：设定自洽、升级路径、长线期待、世界承载；
- 知乎/盐言：短篇钩子、信息差、反转密度和情绪兑现；
- 未识别平台使用 generic web-fiction。

## Finding Schema

每项必须对应 `storyReviewFindingSchema`：

- severity：S1 破坏主线/规则/信任；S2 明显影响效果；S3 局部问题；S4 建议；
- category：structure/character/prose/consistency/platform/factual/format/causal/rule-boundary；
- scopePath：对应 JSON 文件路径或字段；
- evidence：短而具体的正文/结构证据；
- issue 与 fix：可执行；事实类 fix 只写统一方向，不代写剧情；
- status 默认 open。

## Review JSON

写入 `review` 角色文档；实际 kind 与路径从本轮结构描述解析：

- `reviewType="review"`；
- mode full/lean/solo；
- rubric 为 fanqie/qidian/zhihu/generic web-fiction；
- scopePaths、summary、verdict 和 findings；
- verdict：无 S1/S2 且无关键 S3 为 approve，有问题为 concerns，需要重写/裁决为 reject。

## 落库与边界

先完整读取 `../story-assistant/references/incremental-changesets.md`。默认只维护 review，不修改章节、设定或追踪：

1. 第一批 upsert 字段齐全、findings 可为空的 review 壳；
2. 按审查维度或每 5-10 条 finding 一批，用 `upsert-items` 写入 findings；
3. 最后一批 patch summary、verdict 和最终范围，`batch.final=true`；
4. 每批最多 16 operations / 192 KiB，用 `story(action="commit_changes", changeSet={...})` 原子校验提交，随后重读 revision。已有 review 禁止整份 upsert 覆盖。

用户明确要求“审完直接修”时也先提交 review，再说明修改范围；结构修复路由长/短 write，文字修复路由 deslop。不要在一次审查 ChangeSet 中偷偷改正文。

报告 review ID、rubric、范围、S1-S4 数量、verdict 和新 revision，不把完整 JSON 重复粘贴到聊天。
