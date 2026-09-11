# 协作模式

`engines/drivers/native/collaboration/modes` 提供安全、可复用的工作流预设。产品应选择模式并提供类型化参与者与上下文；只有明确需要低层 `run_collaboration` API 时才手工拼接工作流 JSON。

## 通用契约

所有模式接受：

- `workspacePath`：运行时工作区路径。
- `sessionRootDir`：可选会话目录，用于账本与追踪。
- `participants`：模式所需的类型化 Agent 角色。
- `context`：渲染到工作流提示词的产品数据。
- `options`：循环次数、阈值等模式特有选项。
- `runtime`：可选运行时覆盖，省略时使用默认值。

模式发送普通协作事件；设置 `sessionRootDir` 后写入会话追踪记录，可通过 `get_runtime_session` 或 `get_collaboration_timeline` 查询。

## supervisor.dispatch-loop

用于主管动态路由：

```text
supervisor -> select one worker -> worker -> supervisor -> ... -> end
```

参与者必须恰好有一名 `supervisor`，以及至少一名 `worker`。

- `maxRounds`：正整数，默认 `2`。
- `minScore`：0–100 阈值，默认 `1`。
- `allowNoDispatch`：布尔值，默认 `true`。

主管输出示例：

```json
{
  "status": "continue",
  "candidates": [
    {
      "targetId": "worker-a",
      "score": 91,
      "reason": "最适合接续任务的执行者。",
      "instruction": "执行下一项任务。"
    }
  ],
  "selectedTargetId": "worker-a",
  "selectedInstruction": "执行下一项任务。",
  "reason": "worker-a 得分最高。",
  "artifacts": []
}
```

归一化器兼容常用别名：`status: "done" | "end"` 和 `shouldContinue: false` 转为 `complete`；候选 ID 可用 `targetId`、`id`、`participantId`、`agentRoleId`；派发目标可用 `selectedTargetId`、`targetId`、`nextTargetId`。

退出条件：

- `complete` 或 `blocked`：结束循环，不再派发。
- 没有可派发目标且 `allowNoDispatch` 为 true：结束。
- 选中得分低于 `minScore`：结束。
- 达到 `maxRounds`：完成当前 worker 派发后结束。

产物保存在 `outputs.supervisorDecision.artifacts` 及时间线／调试载荷。产品可用其输出旁白、审查笔记、UI 提示或审计数据，而无需让通用模式绑定某个业务领域。

## producer.review-rewrite-loop

用于初稿、审查与修订：

```text
producer -> reviewer -> approved? end : producer -> ...
```

参与者必须恰好有一名 `producer` 和一名 `reviewer`。`maxRounds` 为正整数，默认 `2`。

审查输出：

```json
{
  "status": "revise",
  "score": 72,
  "reason": "需要更强的冲突。",
  "revisionInstruction": "重写并明确阻碍。"
}
```

`approved`、`complete`、`passed` 表示通过并结束；`blocked` 结束；`revise` 回到 producer，直至达到轮数上限。

## 处理器边界

编排模式可被多个产品复用时才新增模式。通用转换或路由优先放在 `handlers/builtin.ts`，产品专用解析与 UI 投影放在 `agent-runtime` 之外，消费通用输出。
