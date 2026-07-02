# Collaboration Modes

`engines/drivers/native/collaboration/modes` contains safe, reusable workflow presets. Product
code should choose a mode and provide typed participants/context; it should not
assemble arbitrary workflow JSON unless it is intentionally using the lower-level
`run_collaboration` API.

## Common Contract

Every mode accepts:

- `workspacePath`: runtime workspace path.
- `sessionRootDir`: optional runtime session directory used for ledger/trace.
- `participants`: typed agent roles used by the mode.
- `context`: product data rendered into the workflow prompt.
- `options`: mode-specific controls such as loop limits or thresholds.
- `runtime`: optional runtime override, otherwise the runtime default is used.

Every mode emits normal collaboration events and writes runtime session trace
records when `sessionRootDir` is present. Query the resulting session with
`get_runtime_session` or `get_collaboration_timeline`.

## supervisor.dispatch-loop

Use this for dynamic supervisor routing:

```text
supervisor -> select one worker -> worker -> supervisor -> ... -> end
```

Participants:

- exactly one `supervisor`
- one or more `worker`

Options:

- `maxRounds`: positive integer, default `2`.
- `minScore`: 0-100 threshold, default `1`.
- `allowNoDispatch`: boolean, default `true`.

Supervisor output:

```json
{
  "status": "continue",
  "candidates": [
    {
      "targetId": "worker-a",
      "score": 91,
      "reason": "Best next worker.",
      "instruction": "Do the next task."
    }
  ],
  "selectedTargetId": "worker-a",
  "selectedInstruction": "Do the next task.",
  "reason": "worker-a has the strongest score.",
  "artifacts": []
}
```

The normalizer accepts common aliases:

- `status: "done" | "end"` becomes `complete`.
- `shouldContinue: false` becomes `complete`.
- candidate target ids may use `targetId`, `id`, `participantId`, or `agentRoleId`.
- `selectedTargetId`, `targetId`, or `nextTargetId` can select a dispatch target.

Exit behavior:

- `complete` or `blocked` ends the loop without dispatching a worker.
- no selected dispatchable target ends the loop when `allowNoDispatch` is true.
- selected score below `minScore` ends the loop.
- reaching `maxRounds` ends the loop after the current worker dispatch.

Artifacts are preserved in `outputs.supervisorDecision.artifacts` and in
timeline/debug payloads. A product can use this to emit narrator text, review
notes, UI hints, or audit data without binding the mode to a specific domain.

## producer.review-rewrite-loop

Use this for draft/review/revise workflows:

```text
producer -> reviewer -> approved? end : producer -> ...
```

Participants:

- exactly one `producer`
- exactly one `reviewer`

Options:

- `maxRounds`: positive integer, default `2`.

Reviewer output:

```json
{
  "status": "revise",
  "score": 72,
  "reason": "Needs a stronger conflict.",
  "revisionInstruction": "Rewrite with a clearer obstacle."
}
```

Exit behavior:

- `approved`, `complete`, or `passed` ends the loop.
- `blocked` ends the loop.
- `revise` routes back to the producer until `maxRounds` is reached.

## Handler Policy

Add a new mode when the orchestration pattern is reusable across products.
Prefer mode-specific transforms/routers in `handlers/builtin.ts` when they are
generic. Product-specific parsing or UI projection should live outside
`agent-runtime` and consume the generic mode output.
