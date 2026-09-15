---
name: story-assistant
description: >-
  Mewvis 故事弹窗的专属路由技能。只在故事创作助手中使用；当用户提出开书、长短篇写作、拆文分析、导入、审稿或去 AI 味请求时，必须从 story-assistant-* 技能中选择匹配流程。不要路由到普通 story-* 技能，也不提供扫榜、扫版或浏览器采集。
metadata:
  isle-claw:
    assistant-only: true
    builtin-bundle: story-authoring
    required-private-tool: story
    upstream: https://github.com/worldwonderer/oh-story-claudecode
    upstream-commit: 2e9cbac20201d616d7d6f8990060a9f1d206838f
---

# Mewvis 故事创作助手路由

本技能只负责判断意图和选择专属技能，不直接生成故事文件。路由前完整读取 `references/story-tool-binding.md` 并完成启动门禁；私有 `story` 工具缺失时停止，不得降级写入普通文件。

## 路由表

| 用户意图                               | 专属技能                        |
| -------------------------------------- | ------------------------------- |
| 长篇开书、卷纲、细纲、写章、日更、回炉 | `story-assistant-long-write`    |
| 长篇拆文、黄金三章、对标结构分析       | `story-assistant-long-analyze`  |
| 短篇构思、盐言/番茄短篇、写完整短篇    | `story-assistant-short-write`   |
| 短篇拆文、情绪/反转/手法分析           | `story-assistant-short-analyze` |
| 去 AI 味、自然化、只检测 AI 腔         | `story-assistant-deslop`        |
| 导入已有小说、反向建立结构             | `story-assistant-import`        |
| 审稿、查结构/角色/一致性问题           | `story-assistant-review`        |

## 路由规则

1. 用户明确长篇或短篇时直接选择对应技能。
2. 用户只说“写小说”时，用 `ask_user` 确认长篇还是短篇。
3. “分析当前故事”按篇幅进入 analyze；“审查当前故事的问题”进入 review。
4. “润色/去 AI 味”进入 deslop，不把结构性重写混进润色。
5. 导入后续写先进入 import；成功提交后再按篇幅进入 write。
6. 不启用 `story-long-scan`、`story-short-scan`、`browser-cdp`，也不建议用户从本弹窗调用它们。

## 数据边界

- 正式故事内容只存在于 `story(action="describe_structure")` 返回的路径中。
- 路由到任何会落库的专属技能后，必须先读取 `references/incremental-changesets.md` 并遵守分批与字段级增量协议。
- 先用 `action="describe_structure"` 读取结构要求，再用 `action="read_context"` 获取 revision 和上下文；项目不存在时调用 `action="initialize"`。
- 每个小批次直接用 `story(action="commit_changes", changeSet={...})` 原子校验并提交；它会先完整校验，失败绝不写盘。`action="validate_changes"` 只用于用户明确要求预览或诊断失败，不得作为每批固定前置步骤。提交后重读新 revision 再开始下一批。
- 禁止把整本书、完整导入、几十章细纲或全部审查结果放进一个 ChangeSet，也禁止为改一个字段而 upsert 整个已有文件。
- 不使用 `write`、`edit`、`bash` 直接改故事目录，不创建 Markdown 故事资产，也不提供无工具兜底格式。
- analyze/review/import 的结果分别写入 `analysis`、`review`、`import` 角色对应的文档；角色未启用时对应流程不可用。
