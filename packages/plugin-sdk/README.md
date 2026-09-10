# @isle/plugin-sdk

The public authoring surface for Isle plugins.

For a managed React project, use [`@isle/plugin-dev`](../plugin-dev/README.md).
It owns startup, preview and build; business code stays in `main/`.
Its `isle.config.ts` generates the manifest permissions described below.

Browser business code imports `getPluginHost` from `@isle/plugin-sdk/browser`.
`getPluginHost().executeTool(name, args)` invokes this plugin's own Node tool and
returns `{ value, content, meta }`. The SDK delegates to Isle's authenticated
sandbox bridge; it does not expose Tauri or require postMessage boilerplate.
`getHost()` returns safe metadata/theme; `openExternal()` requires a user action.
The example project demonstrates real Node crypto execution from a React button.

Runtime permissions are declared in the package's `isle.permissions` manifest
field, not inside `definePlugin`. Supported values are `network`,
`plugin-data`, `workspace-files`, `open-external`, `process`, `chat`, and
`chat-knowledge`; use an empty
array when the plugin needs none. Native packages without the field fail new
installation. The declaration is shown during installation and is not a
replacement for a Node.js sandbox.

Plugins use Cordis lifecycle and dependency-injection semantics through an
Isle-owned context containing `tools`, `skills`, and `settings`. Plugin source
does not need to import Cordis or any DeepSeek Harness service package.

```js
import { definePlugin, defineTool, schema } from "@isle/plugin-sdk";

export default definePlugin({
  name: "@example/hello",
  inject: ["tools"],
  apply(ctx) {
    ctx.tools.register(
      defineTool({
        name: "hello",
        description: "Return a greeting.",
        parameters: { type: "object", properties: {} },
        output: {
          schema: {
            type: "object",
            properties: { message: { type: "string" } },
            required: ["message"],
            additionalProperties: false,
          },
          render: (_args, value) => [{ type: "text", text: value.message }],
        },
        execute: () => ({ message: "hello" }),
      }),
    );
  },
});
```

Agent execution safety is controlled by the host at execution time. Tool definitions
do not declare permissions or risk levels. Host and plugin chats share the same
permission modes and approval flow; custom tools with unclassified effects require
approval in `ask` and `auto`. Direct plugin Node/UI execution is outside this Agent
execution gate. Manifest permissions remain separate.

The SDK also exports Isle's settings `schema` builder. This keeps the backing
schema implementation on the private host side of the authoring contract.

Versioned settings keep schema defaults, plugin defaults, and persisted user
overrides as separate layers:

```js
import { defineSettings, schema } from "@isle/plugin-sdk";

const settings = defineSettings({
  namespace: "example-plugin",
  version: 2,
  schema: schema.object({ endpoint: schema.string().default("") }),
  defaults: { endpoint: "https://example.com" },
  migrations: {
    1: (user) => user,
    2: (user) => ({ ...user, endpoint: user.url ?? user.endpoint }),
  },
});

export async function apply(ctx) {
  const values = await settings.register(ctx);
  console.log(values.get().endpoint);
}
```

Migration `N` transforms the raw persisted user layer from version `N-1` to
`N`. The reserved `$version` field is stored in the same
`plugins/<namespace>/settings.yaml` document but is hidden from plugin reads.
An older plugin refuses settings written by a newer schema instead of silently
downgrading them.

Use Isle's plugin tooling to validate and bundle source packages. The DSH
target bundles this SDK into the output and generates its Cordis patch, so a
plugin can be authored once and distributed to either host.

## Chat

See [Plugin Chat](chat/README.md) for the UI-independent client, default and composable React Chat, desktop `ctx.chat` connection, permissions, lifecycle, and build/test workflow. The root SDK entry does not load the chat UI; use the explicit `/chat` or `/chat/react` subpath.
