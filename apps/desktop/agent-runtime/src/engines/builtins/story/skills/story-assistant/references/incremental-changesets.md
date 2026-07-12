# Story ChangeSet 增量批次协议

本协议适用于 `story-authoring` 内置能力包。进入协议前先完成 `story-tool-binding.md` 的启动门禁并调用 `story(action="describe_structure")`；其返回的限制与结构高于本文示例。目标是让模型只提交本次真正变化的字段，让工具只重写本批变化的 JSON 文件，并用 revision 防止并发覆盖。

## 单批限制

- 单个 ChangeSet 最多 16 个 operations，序列化后最多 192 KiB；接近任一上限就提前拆批。
- 每个 ChangeSet 必须包含 `contractId` 与 `contractVersion`，值取自当前会话 `describe_structure` 返回的 `structure.contract`；工具会在解析 ChangeSet 时强制校验。
- 每批只承担一个可命名目的，例如“核心定位”“主要角色 1-4”“第 1-3 章细纲”。
- 每批都带 `batch={workflowId,index,total?,label,final}`。同一工作流保持 workflowId 不变；最后一批 `final=true`。
- 每批直接调用一次 `story(action="commit_changes", changeSet={...})`：工具内部先执行与预检相同的完整校验，只有通过才事务性写盘。`action="validate_changes"` 只用于用户明确要求预览或定位失败，不作为固定前置步骤。
- 每次提交成功后重新调用 `story(action="read_context", ...)`，下一批必须使用返回的新 revision。revision 过期时重读并基于最新内容重建该批，不能改 baseRevision 后盲重放。

## 操作选择

- `upsert`：只用于创建新文件，或用户明确要求完整替换单个文件。value 是符合当前 contract 的普通业务对象：提供 kind、稳定 ID 和没有默认值的业务必填字段；不要包 `$contract/$document/$schema/data`。工具按 contract 补齐 const、generated、default 与嵌套默认值，再编码自描述 JSON，并执行 Schema、引用和完整度校验。不得自行提交字段 label/描述，也不得提交 contract 未声明字段。
- `patch`：深合并已有文件的少数字段；未出现字段保持原值，`null` 表示删除可选字段。禁止修改 `schemaVersion/kind/id/storyId/revision/files`。
- `upsert-items`：更新已有文件中的顶层对象数组，按条目 `id` 合并；适合 review.findings、analysis.plotModules、relationships.relationships、foreshadows.foreshadows、timeline.entries、graph.nodes/edges 等带 id 数组。
- `remove-items`：从顶层对象数组按 ids 删除。
- `add-values` / `remove-values`：增删顶层字符串数组并自动去重；适合 volumeIds、chapterIds、notes、gaps 等。对象数组不能使用这两个操作。
- `append-text`：向已有顶层字符串字段末尾追加新内容，可传 separator；适合续写 chapter.content，不能用来重复写回已有正文。
- `replace-text`：用唯一 oldText 锚点替换顶层字符串字段中的局部文本；适合修订一段正文。oldText 不存在或出现多次会拒绝，必须提供更长且唯一的上下文锚点。
- `delete`：只删除明确指定的非 manifest 文件；删除前同批或更早批次必须清理对它的引用。

示例：

```json
{
  "contractId": "<describe_structure 返回的工作区 contractId>",
  "contractVersion": 1,
  "storyId": "story-1",
  "baseRevision": 7,
  "validationProfile": "draft",
  "batch": {
    "workflowId": "open-book-20260711",
    "index": 3,
    "total": 6,
    "label": "补充主角与核心关系",
    "final": false
  },
  "operations": [
    {
      "type": "patch",
      "path": "story/book.json",
      "value": { "protagonistId": "char-protagonist" }
    },
    {
      "type": "upsert-items",
      "path": "story/relationships.json",
      "field": "relationships",
      "items": [
        {
          "id": "rel-protagonist-rival",
          "fromCharacterId": "char-protagonist",
          "toCharacterId": "char-rival",
          "type": "竞争者",
          "emotionalDirection": "从戒备到尊重",
          "currentState": "互相试探",
          "conflict": "争夺同一条线索",
          "evolution": []
        }
      ]
    }
  ]
}
```

数组条目的首次追加仍必须包含该条目 Schema 的全部必填字段；只有命中已有 id 时才允许只提供需修改的字段。

## 校验策略

- 中间批次用 `validationProfile="draft"`，但每一批原子提交后都必须保持 Schema 与引用有效，不能留下引用尚未创建对象的悬空 ID。
- 最终批使用目标场景的完整 profile：开书/导入为 `openBook`，正文落库为 `chapterWrite`，纯分析/审查/检测为 `draft`。
- `final=true` 不是跳过校验的标志。最终批必须包含真实的收尾变更，并通过目标 profile 后提交。
- 不把超长正文、完整分析和几十章细纲塞进同一 ChangeSet；按章节、实体组或分析阶段分批。

## 推荐依赖顺序

开书：

1. book/positioning/style 核心字段，book 暂不引用未创建主角；
2. characters/world；
3. patch book.protagonistId，补 relationships；
4. volumes；
5. patch book-arc 并引用已存在 volumes；
6. chapter plans 每批 3-5 章；
7. patch volumes.chapterIds 与 progress，最终用 openBook 校验。

导入：

1. 创建 partial analysis 与 import 跟踪记录；
2. 核心设定；
3. 角色、关系、世界；
4. 卷和全书结构；
5. 章节 plan/chapter 按 1-3 章一批；
6. tracking；
7. patch analysis/import 为 complete/committed，最终用 openBook 校验。

分析/审查：先 upsert 一个合法的 draft 壳，再用 patch、upsert-items、add-values 按阶段或 finding 小组补充；最后 patch status/verdict/summary。去 AI 味用 replace-text 做唯一锚点局部替换；续写用 append-text 添加新正文并 patch wordCount/summary。正文按单章提交，不跨章聚合超长文本。
