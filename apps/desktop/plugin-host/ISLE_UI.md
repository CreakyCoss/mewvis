# Isle Plugin UI v1

`isle.ui` is an Isle-owned UI contribution for native and compatible plugins.
It is independent from `dsh.client`: a dual-target package may ship both UI
declarations and remain publishable to the DSH ecosystem.

The machine-readable schema is [`schema/isle-ui.schema.json`](./schema/isle-ui.schema.json).

React projects can use [`@isle/plugin-dev`](../../../packages/plugin-dev/README.md):
export the page from `main/App.tsx`, declare optional tools in `main/host/tools.ts`
and skills in `main/host/skills.ts` (via `host.tools` / `host.skills`),
and keep permissions/UI settings in `isle.config.ts`. The toolchain generates the
JavaScript entries and manifest below. Browser code calls its host tools through
`getPluginHost()` from `@isle/plugin-sdk/browser`; no manual bridge code is needed.

## Package-owned page

An Isle UI contribution consists of one package-local JavaScript entry and an
optional stylesheet. Isle owns the plugin catalog, detail header, sandbox,
permission bridge, and generic tool fallback. The plugin owns all
capability-specific markup, styling, and interaction.

```json
{
  "isle": {
    "plugin": { "version": 1, "entry": "./index.js" },
    "ui": {
      "version": 1,
      "kind": "sandbox",
      "entry": "./isle-ui.js",
      "style": "./isle-ui.css",
      "title": "My Plugin",
      "layout": "full"
    }
  }
}
```

Source packages only maintain the `isle` declaration. Running
`pnpm plugin:pack -- <package> --target dsh` preserves this UI metadata and
adds the generated `dsh.bundle` declaration and `cordis.patch.yml` to the
distribution package.

Paths must start with `./`, resolve inside the package, and may not cross a
symlink boundary out of it. `layout` is optional:

- `contained` (default) places the page in a titled sandbox card, suitable for
  compact tools.
- `full` gives the iframe the entire plugin detail surface, suitable for readers,
  editors, and other application-like experiences.

If a plugin omits `isle.ui`, Isle generates a generic form from its registered
tool JSON Schemas. Plugins therefore do not need to ship a page unless they need
a custom workflow.

The entry executes after the bridge is installed. It may render ordinary DOM
inside its iframe and call only tools registered by the same plugin:

```js
const response = await window.islePlugin.executeTool("my_tool", { input: "value" });
console.log(response.value);
```

`executeTool()` resolves to `{ value, content, meta }`. The bridge also exposes:

- `window.islePlugin.version` — currently `1`.
- `window.islePlugin.getHost()` — the last host descriptor, containing safe
  plugin metadata, theme (`light` / `dark`), and tool schemas.
- `window.islePlugin.openExternal(url)` — from a user action, asks the host to
  open an HTTP(S) URL in the system browser; other schemes are rejected.
- `isle:ready` — window event fired after the host descriptor arrives.
- `isle:theme` — window event fired when the application theme changes.

## Isolation and limits

The sandbox uses an opaque origin and a fixed Content Security Policy:

- fetches and external subresources such as images, media, fonts, frames, and objects are blocked;
- forms, popups, downloads, same-origin access, and top navigation are not granted;
- inline script and CSS are allowed only because the audited host document embeds
  the package sources directly;
- tool arguments are JSON objects capped at 256 KiB, with at most four concurrent
  calls per frame;
- tool ownership is checked in the browser bridge and again in the Node host.

The iframe stops displaying a contribution after it navigates away from the host
document. JavaScript entries are capped at 512 KiB and stylesheets at 256 KiB.
UI load or runtime failures stay isolated from the plugin's tools and skills;
invalid UI declarations fall back to the generic tool workbench.

This browser sandbox isolates DOM and application privileges; it does not turn
an installed package into untrusted data. The package's host-side Cordis entry
is executable Node.js and must be installed only from a trusted source.

## Relationship to `dsh.client`

Upstream `dsh.client` bundles target DeepSeek's browser module table, React
identity, Cordis client runner, and typed slots. Isle detects that declaration
but does not execute the bundle in its application context. A dual-target
package may keep its upstream `./client` export for DSH and add a separate small
`isle.ui` entry for Isle. Both UI halves can call the same host tools, so
business behavior remains in one portable Cordis plugin. Isle's DSH pack target
currently generates the host-side Cordis declaration; an existing custom
`dsh.client` build remains an advanced package-owned artifact.
