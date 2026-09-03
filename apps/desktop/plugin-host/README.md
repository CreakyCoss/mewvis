# Plugin Host

`plugin-host` is the application-lifetime boundary for installable Isle plugins.
It is intentionally separate from `agent-runtime`: agent workers are task-owned
and may be reaped while idle, whereas product plugins may own background work.

## Compatibility milestones

The initial `dsh-compat` surface mounts the real DeepSeek Harness implementations
of:

- Cordis plugin lifecycle and dependency injection;
- `ctx.tools`, including DSH schema validation and execution;
- `ctx.skills`, including embedded runtime skill registration.

It does not yet load DSH profiles or client plugins, nor does it expose filesystem,
shell, session, agent, or LLM services. `DshCompatPluginHost` is programmatic so a
future long-lived process entry and the Tauri bridge can share the same tested
composition.

The second milestone adds a serializable Agent Runtime input at
`resources.plugins.dsh`: each entry contains only `id`, an ESM `specifier`, and
an optional JSON object `config`. The Pi adapter rehydrates those plugins for an
agent session, projects DSH tool JSON Schemas into Pi tools, materializes embedded
DSH skills, and disposes the Cordis fibers and temporary skill files with the
session. This rehydration makes idle worker recycling safe; application-lifetime
background plugins still belong in the future long-lived host process.
Loading a DSH entry activates its projected tools and its model-invocable skills;
the plugin entry itself is the capability boundary.

`plugins/story-scene-card` is the first portable Isle business plugin. Its source
is a standard DSH bundle, while the desktop build also creates a self-contained
copy under `agent-runtime/dist/plugins` for bundled use.

The third milestone adds a desktop-owned registry. Bundled packages are
discovered from `agent-runtime/dist/plugins`; locally installed packages and
`registry.json` live below the product application-data `plugins` directory.
Tauri commands can list, install from a local directory, enable, disable, and
remove installed packages. Enabled entries are merged into every Agent and
Collaboration request, while a same-ID entry explicitly supplied in
`resources.plugins.dsh` wins for that request.

The settings UI exposes this registry as a plugin management page. It separates
bundled and externally installed packages, gives each mutation its own loading
state, confirms removal, and warns before enabling externally supplied executable
code.

The fifth milestone adds discovery through the independent
`dshmarketplace.dev` community directory. This source is replaceable through
the product-prefixed `DSH_MARKETPLACE_URL` environment variable and is never
presented as an official DeepSeek registry. Remote installation accepts only a
structured npm package name, downloads from the fixed public npm registry with
the bundled pnpm, disables all package lifecycle scripts, enforces size limits,
and stores an exact lockfile plus origin metadata. Market packages are installed
disabled unless the user explicitly chooses otherwise.

Standard `dsh.bundle.patch` files are now the runtime entry point for registered
plugins. The host loads top-level inserted Cordis rows (including nested groups),
resolves package self-references and dependencies from the installed package,
and starts sibling rows together so ordinary Cordis service injection can settle.
Patch overrides for a full DSH base profile are ignored because Isle intentionally
starts from a smaller tools/skills host. `!!js` expressions are rejected rather
than evaluated, and unresolved service dependencies fail explicitly instead of
remaining as silent pending Cordis fibers.

The sixth milestone mounts the upstream DSH settings contract. Desktop-launched
Plugin UI and Agent Runtime sessions receive the application plugins data root;
an Isle provider maps each standard DSH namespace to
`plugins/<namespace>/settings.yaml` with owner-only, atomic writes. Existing
sections in the former shared `plugins/settings.yaml` are migrated once, with a
pre-migration backup and conflict-safe retention. Explicit `.yaml`, `.yml`, or
`.json` paths still select the official monolithic file provider for portable
hosts and tests. Programmatic hosts without a path keep an in-memory provider.
This makes ordinary `ctx.settings` + `ctx.tools` packages such as `dsh-rss`
durable without adding plugin-specific storage code or breaking DSH packages.

`resources/skills/story-deslop` is the first migrated capability that remains a
plain Isle `SKILL.md` and is also a publishable Cordis/DSH package. Its build
artifact includes the Skill and its `references` directory. Local installation
currently expects a self-contained package (or packaged dependencies); loading
a plugin executes its Node.js code with the desktop runtime's authority, so the
installer is only exposed as a user-invoked settings command.

The compatibility surface still excludes full DSH profiles, Client plugins,
GitHub-source builds, attachment-backed image tool results, and application
background services. Session, shell, filesystem, client, agent, and LLM services
are not yet mounted. DSH `additionalContexts` are retained in Pi
tool details but are not yet injected as separate follow-up messages, and
non-directory Skill resource bases do not yet provide relative resource loading.

The seventh milestone adds the first portable plugin UI contract. A package may
keep its standard `dsh.bundle` and optional upstream `dsh.client` declaration,
then add `isle.ui` for Isle. Capability-specific pages are package-owned and load
from one package-local JavaScript file plus optional CSS into an opaque-origin
iframe. Plugins without a page receive a JSON-Schema-generated tool workbench.
A fixed CSP blocks fetches and external subresources, while iframe permissions
omit forms, popups, same-origin access, and top navigation. Application access
is limited to the versioned tool and external-link bridges; the application and
Node host both verify that requested tools belong to that plugin. See
[`ISLE_UI.md`](./ISLE_UI.md) for the authoring contract.

The eighth milestone adds `plugins/rss-reader`, a disabled-by-default portable
adapter around the community `dsh-rss` package. It keeps the upstream settings
and seven `rss_*` tool contracts, adds a model-invocable skill with explicit
untrusted-feed guidance, and ships its own sandboxed RSS reader page.
The same package can be published as a normal DSH bundle; Isle's additive UI
metadata is ignored by DeepSeek Harness.
