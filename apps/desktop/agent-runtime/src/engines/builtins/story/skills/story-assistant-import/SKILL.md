---
name: story-assistant-import
description: >-
  Novel Claw 故事创作助手专属的结构化小说导入技能。用户要求导入已有小说、反向解析半成品/完本、把旧稿变成可续写项目时必须使用。继承 oh-story-claudecode 最新长短篇分流和逆向工程方法，直接生成 Story Project JSON、analysis 与 import 记录，不创建 Markdown 项目树，也不修改普通 story-import 技能。
metadata:
  novel-claw:
    assistant-only: true
    builtin-bundle: story-authoring
    required-private-tool: story
    upstream: https://github.com/worldwonderer/oh-story-claudecode
    upstream-commit: 2e9cbac20201d616d7d6f8990060a9f1d206838f
---

# 结构化小说导入

交付物是可续写的 Story Project，而不是一份分析报告。先分析，再把有证据的内容迁移成结构文件；不能为了填 Schema 编造原文没有的信息。

开始前完整读取 `../story-assistant/references/story-tool-binding.md` 并完成启动门禁，再用 `story(action="describe_structure")` 读取工作区协议，项目不存在时用 `action="initialize"`。私有工具缺失或工作区协议不兼容时停止，不得用普通文件工具生成导入兜底。

## Phase 1：识别导入源

1. 请求用户引用当前故事工作区内可读的 `.txt/.md` 文件，或粘贴文本。没有可读源时停止，不声称已导入。
2. 检测书名、章数、字数、章节格式、题材、平台、完本状态和最后一章是否完整。
3. 篇幅分流按 `references/length-routing.md`：用户声明优先，其次结构信号，最后字数。
4. 最后一章残稿时用 `ask_user` 确认“保留残章继续写”还是“只导入完整章”。
5. 调用 `story(action="read_context", scope="project")`；当前项目已有正式内容时，确认覆盖、合并或取消。默认不覆盖。

## Phase 2：结构化分析

- 长篇采用 `story-assistant-long-analyze` Stage 0-6 方法；
- 短篇采用 `story-assistant-short-analyze` Stage 2-6 方法；
- 分析结果写入 `story/analysis/{analysisId}.json`，target=`import-source`；
- 不创建原文备份或拆文库文件；源路径只记录在 import.sourcePath。

如果文本过大无法在当前轮可靠完成，提交 status=`partial` 的 import/analysis 记录与 gaps，不生成看似完整的故事结构。

## Phase 3-L：长篇迁移

从原文和 analysis 构造：

- `book.json`、`positioning.json(lengthType="long")`、`style.json`；
- 主要 `characters/*.json`、`relationships.json`、`world/*.json`；
- `outline/book-arc.json`、按原卷界或证据充分的候选卷生成 `outline/volumes/*.json`；
- 每个完整原文章节对应一个 `outline/chapters/{planId}.json` 与 `chapters/{chapterId}.json`；
- `tracking/character-states/*.json`、`foreshadows.json`、`timeline/*.json`、`progress.json`。

迁移规则按需读取最新上游 `references/structure-mapping-long.md`、`character-state-reverse.md`、`state-tracking.md`。

要求：

- 章节号、标题、正文内容和稳定事实保持原样；
- 细纲从原文反推，无法判断的钩子/关系/代价用空值，不写“待补充”；
- 原文有卷界则直接使用；无卷界且候选不可靠时，将候选写入 import warnings，先只建一个覆盖已导入范围的卷；
- progress.lastCompletedChapterId 指向最后完整章；残稿策略写进 notes。

## Phase 3-S：短篇迁移

使用统一短篇映射：

- `positioning.lengthType="short"`；
- 一个 book arc、一个 volume、一个 chapter plan、一个 chapter；
- 功能段/数字小节映射为 plan.beats；
- 核心反转、情绪设计和人设映射到 book、positioning、plan 与 characters；
- 正文完整写入 `story/chapters/{id}.md`；章节摘要、字数、引用和状态变化写入对应的 `story/tracking/chapter-results/{id}.json`。

细节参考最新上游 `references/structure-mapping-short.md` 与 `format-and-structure.md`，但存储格式以 Story Contract 为准。

## Import JSON

写入 `story/imports/{importId}.json`：sourceTitle/sourcePath、lengthType、status、wordCount、chapterCount、lastCompleteChapterNumber、analysisId、generatedFileIds、warnings。

状态含义：检测完成 detected，分析中 analyzing，结构可提交 ready，已落库 committed，未完成 partial，失败 failed。

## 增量导入提交

先完整读取 `../story-assistant/references/incremental-changesets.md`。导入必须是可恢复的分批工作流，不能把 analysis、import 和全书文件塞进一个 ChangeSet。

1. 创建 status=`partial` 的 analysis 和 status=`analyzing` 的 import 记录；
2. 提交 book/positioning/style；
3. 分批提交角色、关系和世界；
4. 提交卷，再 patch book arc 建立有效引用；
5. 长篇按 1-3 个完整原文章节一批提交 plan/chapter，短篇正文独立一批；
6. 分批补 character states、伏笔、时间线和 progress；
7. 最后 patch analysis/import 为 complete/committed，并补全 generatedFileIds。

每批最多 16 operations / 192 KiB，只调用一次 `story(action="commit_changes", changeSet={...})` 原子校验提交后重读 revision。`action="validate_changes"` 仅作可选预览。中间批使用 draft 且任何引用都必须指向已落库对象；最后一批 `batch.final=true` 并用 `validationProfile="openBook"`。某批失败只修该批，不得重放已提交批次或全量覆盖项目。

提交后报告篇幅分流、完成批次、生成文件数、最后完整章、warnings、import ID、analysis ID 和 revision。partial 工作流必须在 import.warnings/gaps 标明未完成范围，后续从该批继续。

用户随后要求续写时，长篇路由 `story-assistant-long-write`，短篇路由 `story-assistant-short-write`。
