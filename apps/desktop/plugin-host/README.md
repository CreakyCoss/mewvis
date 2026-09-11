# Isle Plugin Host

`plugin-host` is Isle's application-owned plugin boundary. Isle defines package
discovery, manifests, enablement, data paths, UI contributions, and marketplace
sources. Cordis is the private runtime kernel for lifecycle and dependency
injection. DSH is one compatibility format implemented by an adapter.

## Runtime layers

```text
PluginHost
├── IslePluginAdapter ── isle.plugin entry
├── DshPluginAdapter  ── dsh.bundle.patch
└── CordisPluginHost
    ├── tools
    ├── skills
    └── namespaced settings
```

Generic consumers use `PluginHost` and `RuntimePlugin`; they do not construct a
DSH host. The agent protocol carries `resources.plugins.items`, and each item is
tagged with `kind: "isle" | "dsh"`. `DshCompatPluginHost` remains only as a
compatibility alias for focused adapter tests and older programmatic callers.

## Native Isle package

An Isle package exposes a Cordis plugin entry through an Isle-owned manifest:

```json
{
  "name": "@isle/example",
  "type": "module",
  "isle": {
    "plugin": {
      "version": 1,
      "entry": "./index.js"
    },
    "permissions": ["network", "plugin-data"]
  }
}
```

The entry may export a Cordis function, class, or `{ apply(ctx, config) }`
object. Plugin authors import `definePlugin`, `defineTool`, and `defineSkill`
from `@isle/plugin-sdk` rather than importing Cordis or DSH services directly.
The Isle-owned context exposes Cordis lifecycle semantics together with Isle's
`tools`, `skills`, and `settings` services.

`isle.permissions` declares the plugin's intended use of `network`,
`plugin-data`, `workspace-files`, `open-external`, and `process`. New native
plugins must declare the field, using an empty array when they need none. Isle
validates and displays this declaration before local installation. It is an
auditable author contract, not a Node.js security sandbox; untrusted code must
remain disabled. A new native Isle package without the field is rejected;
already-installed legacy Isle packages are forced off until their manifest is
upgraded, and bundled native packages fail validation. DSH packages can still
be imported because their format has no equivalent field, but they remain off
by default and are identified as trusted-mode compatibility packages instead
of being assigned fictitious permissions.

Source packages maintain one `isle.plugin` declaration. The packaging tool can
produce an Isle-only package or a bundled DSH-compatible package from the same
entry. The latter generates `dsh.bundle` and `cordis.patch.yml`; authors do not
maintain a second entry by hand.

## Authoring workflow

The default React scaffold is managed by [`@isle/plugin-dev`](../../../packages/plugin-dev/README.md).
Run `pnpm plugin:create -- /absolute/path/my-plugin --name @example/my-plugin --local`
from `apps/desktop`, then install dependencies in the generated project.
`--local` uses this checkout's SDK/toolchain while they are unpublished.
Develop with `pnpm dev`, check with `pnpm check`, and build with `pnpm build`.
The business entry is `main/App.tsx`; optional Node tools live in `main/host/tools.ts`.
Permissions and capabilities are declared once in `isle.config.ts`, which generates the install manifest.

Use `--template tools` for the existing JavaScript tool/skill template. Its source
continues to declare `isle.plugin` in package.json. `plugin:validate` checks native
entries/assets without evaluating the entry; for React projects it evaluates the
trusted TS configuration. `plugin:pack` bundles dependencies into `dist/<target>`
and refuses to replace directories without an Isle build marker.

The DSH target retains additive `isle` metadata and generates `dsh.bundle` and
`cordis.patch.yml`. Plugins declaring `chat` require Isle and cannot target DSH;
the toolchain does not turn a React UI into `dsh.client`.

Application builds automatically discover every first-level plugin directory
under `plugin-host/plugins`, validate it, and pack it into the bundled runtime
resources in stable directory-name order. Adding a built-in plugin therefore
does not require maintaining a separate registration list.

Plugins with persistent configuration use the SDK's `defineSettings`. Schema
defaults form the base layer, manifest-independent plugin defaults form the
composition layer, and `plugins/<namespace>/settings.yaml` contains only user
overrides plus a reserved `$version`. Ordered migrations update that user layer
before the plugin registers tools; missing migrations and newer unsupported
versions fail plugin startup explicitly.

## Built-in Chat playground

[Chat playground](./plugins/chat-playground/README.md) demonstrates workspace selection,
shared sessions, default and composed Chat, custom styling, and session inspection.
It is bundled as an Isle-only plugin and enabled by default, subject to the user's saved enablement setting. Other built-in plugins retain their DSH-compatible packages.
The example also includes a preview for the existing 1420 development server.

## DSH compatibility

External packages without `isle.plugin` are detected as DSH-compatible when they declare
`dsh.bundle.patch`. The DSH adapter parses portable top-level insert rows,
resolves package entries, and mounts them into an isolated Cordis lifecycle.
Full DSH profiles, browser Client Runtime, session, shell, agent, and LLM
services are not provided. Unsupported service dependencies fail explicitly.

The independent `dshmarketplace.dev` directory is registered as the
`dsh-community` marketplace provider. It is not Isle's native marketplace and
is not presented as an official DeepSeek registry. Its URL remains configurable
through the product-prefixed `DSH_MARKETPLACE_URL` environment variable.

## Data and UI

The application plugin root still owns `registry.json`, installed packages, and
per-namespace settings at `plugins/<namespace>/settings.yaml`. Settings reads do
not migrate shared legacy files or acquire write locks; saving creates the
namespace directory and file when needed. A package may add `isle.ui` for a sandboxed page. See
[`ISLE_UI.md`](./ISLE_UI.md) for the UI contract.

Built-in desktop conversations do not load plugins. A plugin-owned conversation
loads only its owner plugin and uses its tools alongside the assigned built-in
tools. Reopening that conversation from host history preserves the same owner.
