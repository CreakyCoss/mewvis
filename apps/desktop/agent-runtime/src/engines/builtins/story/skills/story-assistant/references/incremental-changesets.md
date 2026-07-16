# Story ChangeSet 增量批次协议

本协议适用于 `story-authoring` 内置能力包。进入协议前先完成 `story-tool-binding.md` 的启动门禁并调用 `story(action="describe_structure")`；构造批次前再用 `documentKinds` 请求本批需要的完整字段，其返回的限制与结构高于本文示例。目标是让模型只提交本次真正变化的字段，让工具只更新本批变化的结构化或 Markdown 文档，并用 revision 防止并发覆盖。

## 单批限制

- 单个 ChangeSet 最多 16 个 operations，序列化后最多 192 KiB；接近任一上限就提前拆批。
- 每个 ChangeSet 必须包含 `storyTypeId` 与 `storyTypeVersion`，值取自当前会话 `describe_structure` 返回的 `structure.storyType`；工具会在解析 ChangeSet 时强制校验。
- 每批只承担一个可命名目的，例如“核心定位”“主要角色 1-4”“第 1-3 章细纲”。
- 每批都带 `batch={workflowId,index,total?,label,final}`。同一工作流保持 workflowId 不变；最后一批 `final=true`。
- 每批直接调用一次 `story(action="commit_changes", changeSet={...})`：工具内部先执行与预检相同的完整校验，只有通过才事务性写盘。`action="validate_changes"` 只用于用户明确要求预览或定位失败，不作为固定前置步骤。
- 每次提交成功后重新调用 `story(action="read_context", ...)`，下一批必须使用返回的新 revision。revision 过期时重读并基于最新内容重建该批，不能改 baseRevision 后盲重放。
- 数组字段始终提交原生 JSON 数组，空数组使用 `[]`。不得主动构造 `{ "item": ... }` 信封；工具对单层信封、字符串化 JSON 和空值的接收只用于容忍传输偏差，嵌套信封或带其他字段的对象会被协议拒绝。

## 操作选择

- 每个 operation 都使用 `ref={kind,identity}` 定位逻辑文档；单例文档的 identity 为 `{}`，多例文档的 identity 字段取自 `describe_structure.documents[kind].identityFields`。不得猜测或提交文件路径。
- `upsert`：只用于创建新文档，或用户明确要求完整替换单个文档。structured value 是符合当前故事类型的普通业务对象；`chapterContent` 角色文档为 Markdown 时，value 直接使用正文字符串。工具补齐 const、generated、default，校验文档身份与章节 ID，并执行引用和完整度校验。不得自行提交字段 label/描述，也不得提交未声明字段。
- `patch`：深合并已有文档的少数字段；未出现字段保持原值，`null` 表示删除可选字段。禁止修改 `schemaVersion/kind/id/storyId/revision`。
- `upsert-items`：更新已有文档中的顶层对象数组，按条目 `id` 合并；适合 review.findings、analysis.plotModules、relationships.relationships、foreshadows.foreshadows、timeline.entries 等带 id 数组。
- `remove-items`：从顶层对象数组按 ids 删除。
- `add-values` / `remove-values`：增删顶层字符串数组并自动去重；适合 volumeIds、chapterIds、notes、gaps 等。对象数组不能使用这两个操作。
- `append-text`：向已有顶层字符串字段末尾追加新内容，可传 separator；续写章节时使用 `chapterContent` 角色文档的 ref，且 field 使用 `content`。
- `replace-text`：用唯一 oldText 锚点替换顶层字符串字段中的局部文本；修订 `chapterContent` 角色文档时同样使用 field=`content`。oldText 不存在或出现多次会拒绝，必须提供更长且唯一的上下文锚点。
- `delete`：只删除明确指定的非 manifest 文档；删除前同批或更早批次必须清理对它的引用。

示例：

```json
{
  "storyTypeId": "<describe_structure 返回的 storyType.id>",
  "storyTypeVersion": 4,
  "storyId": "story-1",
  "baseRevision": 7,
  "validationMode": "draft",
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
      "ref": { "kind": "story-book", "identity": {} },
      "value": { "protagonistId": "char-protagonist" }
    },
    {
      "type": "upsert-items",
      "ref": { "kind": "story-relationships", "identity": {} },
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

- 中间批次用 `validationMode="draft"`，但每一批原子提交后都必须保持 Schema 与引用有效，不能留下引用尚未创建对象的悬空 ID。
- 最终批使用目标场景的校验模式：开书/导入为 `openBook`，正文落库为 `chapterWrite`，纯分析/审查/检测为 `draft`。
- `final=true` 不是跳过校验的标志。最终批必须包含真实的收尾变更，并通过目标校验模式 后提交。
- 不把超长正文、完整分析和几十章细纲塞进同一 ChangeSet；按章节、实体组或分析阶段分批。

## 失败恢复

- 一次提交可能返回多个 `issues`；先按 `path` 阅读并同时修正本批列出的全部字段，不要只修第一条后立即重试。
- 同一批首次出现结构错误时，重新调用 `describe_structure` 并用 `documentKinds` 只获取受影响文档的字段定义，然后仅重建失败批次；已经成功的批次不得重放。
- 同一文档连续两次出现结构错误时，将失败批拆成单文档 ChangeSet。每个拆分批成功后重读 revision，并为后续批使用新的唯一 `batch.index`；拆批后 `total` 不确定时可以省略，最后实际收尾批才设置 `final=true`。
- 单文档批再次出现相同结构错误时停止自动重试，向用户报告当前 revision、已落库范围及完整 issues。禁止无上限盲重试，也不能把失败内容包装成更深层对象尝试绕过校验。

## 推荐依赖顺序

开书：

1. `primary/positioning/style` 角色文档的核心字段，primary 暂不引用未创建主角；
2. `character/worldEntry` 角色文档；
3. patch primary.protagonistId，补 `relationships` 角色文档；
4. `volume` 角色文档；
5. patch `bookArc` 角色文档并引用已存在 volume；
6. `chapterPlan` 角色文档每批 3-5 章；
7. patch volume.chapterIds 与 `progress` 角色文档，最终用 openBook 校验。

导入：

1. 创建 `analysis` 与 `import` 角色对应的 partial 跟踪记录；
2. 核心设定；
3. 角色、关系、世界；
4. 卷和全书结构；
5. `chapterPlan/chapterContent/chapterResult` 角色文档按 1-3 章一批；
6. tracking；
7. patch analysis/import 角色文档为 complete/committed，最终用 openBook 校验。

分析/审查：先在对应语义角色文档中 upsert 一个合法的 draft 壳，再用 patch、upsert-items、add-values 按阶段或 finding 小组补充；最后 patch status/verdict/summary。去 AI 味用 replace-text 修改 `chapterContent` 的 `content`；续写用 append-text 添加正文，同时 patch `chapterResult` 的 wordCount/summary。正文按单章提交，不跨章聚合超长文本。
