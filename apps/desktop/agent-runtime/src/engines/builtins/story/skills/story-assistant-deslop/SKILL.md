---
name: story-assistant-deslop
description: >-
  Novel Claw 故事创作助手专属的结构化去 AI 味技能。用户要求检测 AI 腔、自然化、润色指定章节、去模板感或只标注问题时必须使用。继承 oh-story-claudecode 最新 7 Gate 方法，只修改 Story Project 中指定章节的 content，并将诊断写入 story/reviews/*.json；不修改普通 story-deslop 技能或 Markdown 文件。
metadata:
  novel-claw:
    assistant-only: true
    builtin-bundle: story-authoring
    required-private-tool: story
    upstream: https://github.com/worldwonderer/oh-story-claudecode
    upstream-commit: 2e9cbac20201d616d7d6f8990060a9f1d206838f
---

# 结构化去 AI 味

目标是用最小修改降低过度圆滑、工整、解释充分和模板化的读感，同时保留剧情事实、角色声线、伏笔、钩子、关系、时间线和章节功能。

开始前完整读取 `../story-assistant/references/story-tool-binding.md` 并完成启动门禁，再用 `story(action="describe_structure")` 获取工作区协议并据此读写。私有工具缺失或工作区协议不兼容时停止，不得用普通文件工具修改章节或审查记录。

## 模式

- “检测/只标注/不要改”：只生成 review，不改 chapter。
- “去 AI 味/润色”：先增量记录 review，再按单章 patch 修订后的 chapter。
- 去 AI 味不处理剧情逻辑问题；发现结构问题写 finding，建议交给 review/write，不擅自改剧情。

## 读取范围

1. 用 `story(action="read_context", scope="chapter", targetId="章节 ID 或章节号")` 获取当前正文、细纲、上一章、角色状态、世界规则、关系和伏笔。
2. 未指定章节时用 `ask_user` 确认，不能默认批量改全书。
3. 单轮最多修改 3 章，并逐章串行重新读取 revision。

## 诊断分级

参考最新上游 `references/anti-ai-writing.md` 与 `banned-words.md`：

- 轻度：少量套话/套路句，只处理 Gate A-B；
- 中度：多处套路、抽象心理、均匀节奏，处理 A-D 与 G；
- 重度：四个以上 Gate 明显异常，完整处理 A-G，但仍不能越过剧情边界。

删除比例上限：轻度 15%、中度 25%、重度 35%。超限应分段处理或标记需复核，不能删完再用新废话补字。

## 7 Gate

1. A 禁用词：高频套词改为具体动作/场内细节，不能只换同义形容词。
2. B 句式：清理“不是…而是…/声音不大却…/带着…”等模板；比喻保留少数有角色感、生活感且有功能的。
3. C 心理：抽象情绪落回动作、选择、物件或身体反应；相邻重复只留最有功能的一次。
4. D 节奏：打破机械排比和等长段落；保留自然虚词，不改成电报体。
5. E 对话：减少说明书式台词和同声线；质问、爆发、答非所问必须符合角色状态。
6. F 结尾：删除作者总结和强行升华，用场景内动作/物件/短话收束。
7. G 解释腔：删叙述者替读者解释、定性、剧透和意义尾巴；不能删掉事件因果所需证据。

长停顿符号、随机标点堆砌、写作工程词、具体字数误判也要检查；标点改法服从角色语气，不机械改成全句号。

## Review JSON

写入 `story/reviews/{reviewId}.json`：

- `reviewType="deslop"`；
- mode 为 detect 或 rewrite；
- scopePaths 指向 `story/chapters/{id}.json`；
- rubric 写 `oh-story-claudecode 7 Gate @ 2e9cbac`；
- findings 每项记录 severity、category=`prose|format`、scopePath、短证据、问题、修法和状态；
- verdict 检测无问题为 approve，有问题为 concerns，正文严重退化/截断为 reject。

## 提交

先完整读取 `../story-assistant/references/incremental-changesets.md`。检测模式：先 upsert review 壳，再按 Gate 分批用 upsert-items 追加 findings，最终 patch summary/verdict。

改写模式按单章拆批：

- 先提交 review findings；
- 对已有 `story/chapters/{id}.json` 优先用唯一锚点 replace-text 局部改写，再 patch wordCount、summary 以及确实变化的引用；保持 id、planId、number 和事件事实；
- 再用 upsert-items 按 finding id patch status：已修标 resolved，无法确定项保持 open；
- 一批只含一章正文，超 192 KiB 时按用户指定片段处理，不能截断正文后提交。

每批只调用一次 `story(action="commit_changes", changeSet={...})` 原子校验提交并重读 revision；失败时根据 issues 修正当前批，且不要使用 write/edit/bash。不把完整润色正文重复贴回聊天；报告修改数、净字数变化、review ID、完成批次和 revision。
