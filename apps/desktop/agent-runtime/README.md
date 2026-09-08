# Agent Runtime

`agent-runtime` is the reusable runtime boundary for Mewvis agents. External
adapters choose CLI or SDK mode and normalize inputs; the engine layer owns the
standard runtime protocol and can switch the concrete implementation behind it.

## Layering

```text
agent-runtime/
  src/
    index.ts                  Public SDK exports.
    sdk/                      Public in-process SDK facade.
    cli/                      stdio CLI entrypoint and CLI-only helpers.
    engines/
      index.ts                Engine factory and implementation selection.
      runtime.ts              Standard AgentRuntimeEngine abstract class.
      protocol/               Standard command, result, event, and session protocol.
      native/                 Built-in engine implementation.
        session/              Shared ledger, trace, manifest, and projection.
        agent/                Single-agent runtime implementation.
        collaboration/        Multi-agent workflow orchestration.
          commands/           Collaboration run orchestration.
          handlers/           Transform, condition, and router handlers.
          modes/              Reusable workflow presets.
          runtimes/           Pluggable workflow runtimes.
```

The intended dependency direction is:

```text
index -> sdk -> engines/index -> engines/runtime
cli   -> engines/index
      -> engines/protocol
      -> engines/drivers/native -> engines/drivers/native/agent
                                -> engines/drivers/native/session
                                -> engines/drivers/native/collaboration -> engines/drivers/native/agent
                                                                   -> runtimes/native
```

Application code should normally call `createAgentClient()` from the desktop
frontend. Hosts such as Tauri should call the CLI over stdio. Tests and embedded
Node integrations can call the SDK directly.

Application-specific business logic should not be imported from `agent-runtime`.
The bundled desktop runtime uses `agent-runtime/src/cli/index.ts` directly. If a
product needs custom transforms, conditions, or routers, that product should
create its own small process entrypoint around the SDK or engine command protocol.

## Public Modes

### SDK

Use the SDK when the caller already runs in Node.js and wants direct in-process
access.

```ts
import { createAgentRuntime } from "./src/index.js";
import { AgentRuntimeCommandType } from "./src/engines/protocol/index.js";

const runtime = createAgentRuntime({
  callbacks: {
    requestUserInput,
  },
});

await runtime.runCollaboration({
  type: AgentRuntimeCommandType.RunCollaboration,
  requestId: "request-1",
  input: {
    requestId: "request-1",
    workspacePath: "/path/to/workspace",
    sessionRootDir: "agent-runtime/session",
    agents: [
      {
        id: "planner",
        label: "Planner",
        agentId: "mock",
        systemPrompt: "You plan the work.",
      },
    ],
    workflow: {
      id: "example.workflow",
      steps: [
        {
          id: "plan",
          type: "agent",
          agentRoleId: "planner",
          userMessage: "Create a short plan.",
          outputKey: "plan",
        },
      ],
    },
  },
});
```

Direct SDK methods follow the standard `AgentRuntimeEngine` capability surface:

```ts
await runtime.chat(command);
await runtime.runAgent(command);
await runtime.getRuntimeSession(command);
await runtime.runCollaboration(command);
await runtime.runCollaborationMode(command);
await runtime.listCollaborationModes(command);
```

Collaboration handlers do not own a question protocol. Agent steps run through the
host-provided agent runner. SDK hosts can pass `callbacks.requestUserInput` to
`createAgentRuntime`; stdio hosts use the agent question protocol internally.

### stdio

Use stdio when the runtime is owned by another process. The host starts
`agent-runtime/dist/cli.js`, writes one JSON command per line to stdin, and reads
one JSON event or result per line from stdout.

The stdio transport accepts engine commands such as single-agent commands and
`run_collaboration`.

## Command Shape

The new collaboration command is:

```json
{
  "type": "run_collaboration",
  "requestId": "request-1",
  "input": {
    "requestId": "request-1",
    "workspacePath": "/path/to/workspace",
    "sessionRootDir": "agent-runtime/session",
    "agents": [],
    "workflow": {
      "id": "workflow-id",
      "steps": []
    }
  }
}
```

`workflow.steps` supports these generic step types:

- `agent`: call an agent role through `engines/drivers/native/agent`
- `dispatch`: dynamically call one or more agent invocations from structured input
- `transform`: run a registered data transformer
- `condition`: run a registered boolean condition and store the result
- `router`: run a registered router and store the selected route

Only `agent` steps and `dispatch` invocations reference an agent role by
`agentRoleId`. Business-specific handlers can be registered by host code through
collaboration extensions; workflow JSON only refers to handler ids such as
`product.normalizeDecision`.

Use `dispatch` when an earlier step decides which agents should run. Its input
can be an array of invocations or an object with an `invocations` array:

```json
{
  "id": "dispatch-speakers",
  "type": "dispatch",
  "input": {
    "invocations": [
      {
        "id": "speaker-a",
        "agentRoleId": "character-a",
        "outputKey": "reply:character-a",
        "userMessage": "Reply to {{ input.topic }}."
      }
    ]
  },
  "outputKey": "speakerDispatch"
}
```

Each invocation accepts the same agent-facing fields as an `agent` step:
`userMessage`, `systemPrompt`, `requestContext`, `runtimeInstruction`,
`runtimeModel`, `allowedTools`, `enabledSkills`, `resources`, and `maxRetries`.
The dispatch step itself stores a summary at its own `outputKey`; each dynamic
agent also writes its own `outputKey` into `outputs`. Invocation strings are
rendered when that dynamic agent starts, so serial invocations can reference
outputs produced by earlier invocations in the same dispatch.

`workflow.executionMode` controls scheduling:

- omitted or `"serial"`: run steps in array order
- `"parallel"`: run all dependency-ready steps concurrently

Serial workflows can use `router.routes` to jump to another step id or to
`"__end__"`. This supports bounded loops such as
`director -> speaker -> director -> "__end__"`. Dynamic router jumps are not
available in parallel mode because parallel scheduling is dependency-based.

Set `workflow.maxSteps` to bound serial router loops. When omitted, the runtime
uses a conservative default based on the number of steps. Both the LangGraph and
native runtimes enforce this limit.

```json
{
  "id": "decide-next",
  "type": "router",
  "router": "app.nextRoute",
  "input": { "$ref": "outputs.routeDecision" },
  "routes": {
    "continue": "speaker",
    "end": "__end__"
  },
  "outputKey": "nextRoute"
}
```

In parallel mode, a step can declare dependencies:

```json
{
  "id": "review",
  "type": "agent",
  "agentRoleId": "reviewer",
  "dependsOn": ["draft", "facts"],
  "userMessage": "Review {{ output.draft }} using {{ output.facts }}",
  "outputKey": "review"
}
```

Each step can also set `maxRetries`. A value of `1` means one initial attempt
plus one retry. Retry attempts reuse the same step id and receive a distinct
agent task id.

Steps can be conditional through `when`. Conditions are deliberately structured
instead of eval-based:

```json
{
  "id": "optional-review",
  "type": "agent",
  "agentRoleId": "reviewer",
  "when": {
    "ref": "input.needsReview",
    "truthy": true
  },
  "userMessage": "Review the draft.",
  "outputKey": "review"
}
```

Supported condition operators:

- `exists`
- `truthy`
- `equals`
- `notEquals`
- `includes`

When no operator is provided, the referenced value is treated as a truthy check.
Skipped steps emit `step_skipped`, appear in `result.skippedSteps`, and count as
settled for `dependsOn` scheduling.

String fields on a step support small template references:

```text
{{ input.topic }}
{{ output.plan }}
{{ steps.planner.text }}
```

Templates are resolved when the step starts. When a step needs another step's
output in parallel mode, declare that dependency through `dependsOn`.

Structured step inputs can use `{ "$ref": "outputs.plan" }` to pass the
referenced value without stringifying it. Both `output.foo` and `outputs.foo`
are accepted.

Tool and skill resources are merged in this order:

1. global input resources
2. role resources
3. step resources

Step-level `allowedTools` and `enabledSkills` override role-level values.

`role.systemPrompt` and `step.systemPrompt` are agent-role scoped inside
collaboration runs. They are rendered into the step runtime instruction instead
of being written as the shared session system prompt, so multiple roles with
different prompts can safely share the same workflow session.

## Collaboration Runtimes

Pi also offers an opt-in `subagent` tool for delegation during a turn, and a bash
sandbox extension. See [Pi sandbox and subagents](src/engines/drivers/native/agent/runtimes/pi/README.md)
for configuration, supported platforms and the isolation boundaries.

`engines/drivers/native/collaboration` has a thin engine facade and pluggable runtimes. The
default runtime is `"langgraph"`, which uses `@langchain/langgraph` to run the
shared workflow contract as a StateGraph. `"native"` is also registered as a
built-in TypeScript implementation for serial and dependency-aware parallel
workflows. Callers normally omit the field:

```json
{
  "workflow": {
    "id": "workflow-id",
    "steps": []
  }
}
```

To route a workflow through another registered implementation, set
`workflow.runtime`:

```json
{
  "workflow": {
    "id": "workflow-id",
    "runtime": "native",
    "steps": []
  }
}
```

The engine protocol does not change when the runtime changes. The engine still
emits `workflow_started`, `workflow_done`, and `error`, and the runtime emits
step and nested agent events. `workflow_started` and `collaboration_result`
include `runtimeId` so debug surfaces can show which backend handled a run.

There is no separate host or CLI default runtime setting; set
`workflow.runtime` on the workflow when a run needs a non-default runtime.

## Event Stream

Single-agent events are forwarded unchanged from `engines/drivers/native/agent`.

Collaboration emits these events:

```text
workflow_started
step_started
agent_event
step_done
step_skipped
workflow_done
error
```

`agent_event` wraps the nested single-agent event:

```json
{
  "type": "agent_event",
  "workflowRunId": "workflow-...",
  "stepId": "plan",
  "agentRoleId": "planner",
  "agentTaskId": "workflow-...:plan",
  "event": {
    "type": "text_delta",
    "delta": "..."
  }
}
```

The stdio router also writes a final `collaboration_result` line for
`run_collaboration`, followed by a `task_result` line so the Rust supervisor can
mark the task complete.

## Frontend Integration

The desktop frontend exposes a small client facade:

```ts
import { createAgentClient } from "@/agent-client/runtime";

const client = createAgentClient();
const task = await client.run({
  type: "collaboration",
  workspacePath,
  agents,
  workflow,
});

const unlisten = await client.subscribe((event) => {
  if ("taskId" in event && event.taskId === task.taskId) {
    // Handle workflow_started, agent_event, workflow_done, etc.
  }
});
```

In Tauri builds, `createAgentClient()` calls Rust commands that submit work to
the shared Node runtime supervisor. In web preview builds, it returns a preview
client that does not start Node.

## Naming

Use these names consistently:

- `agent-runtime` for the whole reusable runtime package.
- `engines/drivers/native/agent` for single-agent execution.
- `engines/drivers/native/collaboration` for multi-agent orchestration.
- `session` for shared runtime session storage, traces, manifests, and projections.
- `createAgentClient()` for the frontend-facing client facade.
