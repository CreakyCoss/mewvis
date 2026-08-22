# Agent Runtime Wire Protocol

This directory is the language-neutral source of truth for communication with
the agent runtime. Runtime implementations may be written in Node.js, Python,
or another language, but they must consume the same files and pass the same
fixtures.

## Layers

- JSON-RPC 2.0 defines requests, notifications, responses, and errors.
- OpenRPC lists the public methods and maps them to the current internal command
  names during the compatibility period.
- JSON Schema draft-07 defines the wire-level request and response shapes.
- stdio uses one compact UTF-8 JSON value per line. Protocol messages are
  written to stdout; diagnostics are written to stderr.

The schemas use draft-07 because OpenRPC 1.4 Schema Objects are defined against
that dialect. `schema/bindings.schema.json` aggregates every wire envelope for
code generation. Generated TypeScript, Rust, and Python bindings are committed
derived artifacts and must not become an independent protocol definition.

Application code must consume the stable entrypoints under `v1/sdk` rather
than importing `v1/generated` directly. TypeScript, Rust, and Python entrypoints
are available today. The TypeScript SDK adds generated request factories,
model enums, and event/result constants, type guards, and factories on top of
the generated wire types:

```ts
import { AgentRuntimeEventType, agentRuntimeEventGuards, agentRuntimeEvents } from "./v1/sdk/typescript/index.js";

const event = agentRuntimeEvents.textDelta({ taskId: "task-1", delta: "hello" });
if (agentRuntimeEventGuards.textDelta(event)) {
  console.log(AgentRuntimeEventType.TextDelta, event.delta);
}
```

The constants and helpers are generated from OpenRPC and the model, event, and
result Schemas. Adding a method, enum value, event, or result updates the SDK
instead of requiring consumers to copy names or discriminator strings.

Consumers should use wire SDK types directly when their value crosses the
runtime boundary unchanged. A semantically different application contract must
be defined independently and connected with an explicit adapter or envelope;
it must not be presented as a `Pick`/`Omit`-derived wire contract.

The generator and its Node dependencies live in this directory so the whole
protocol package can be moved without relying on repository-specific script
paths. After changing a Schema or OpenRPC method, run:

```sh
cd agent-runtime/protocol
pnpm install
pnpm generate
pnpm check
```

Rust generation also requires `rustfmt`. The desktop package keeps
`pnpm generate:agent-runtime:protocol` and
`pnpm check:agent-runtime:protocol-bindings` as convenience aliases.

## Versioning

`v1` is the first normalized wire protocol. Additive optional fields and new
methods may be introduced within v1. Removing a field, changing its meaning or
type, or making an optional field required needs a new major directory.

The stdio boundary accepts JSON-RPC 2.0 messages only. Internal runtime command
objects such as `{ "type": "run_agent", ... }` are implementation details and
must never be written directly to stdio.

Node validates the files with Ajv. A Python implementation should load the same
`request.schema.json`, `response.schema.json`, and `notification.schema.json`
with `jsonschema.Draft7Validator`; it must not translate them into a separately
maintained Pydantic contract.

## JSON-RPC behavior

- Requests with an `id` receive exactly one JSON-RPC response.
- Notifications omit `id` and do not receive a response.
- Runtime streaming events are emitted as `runtime/event` notifications.
- Additional results produced after a primary response are emitted as
  `runtime/result` notifications.
- `params` always uses by-name object parameters.
