// @ts-check
/** @template T @param {T} value @returns {T} */

const copy = (value) => structuredClone(value);
/** @param {import("@isle/extension-sdk/agent").ExtensionToolResult} value @returns {import("@isle/extension-host/agent").ExtensionToolResult} */
const toolResult = (value) => ({
  content: value.content.map(({ type, text }) => ({ type, text })),
  details: copy(value.details),
});

/** SDK callbacks are registered through native host ports; no Agent-native API enters this boundary.
 * @param {import("@isle/extension-sdk/agent").ExtensionDefinition} definition
 * @returns {import("@isle/extension-host/agent").ExtensionDefinition}
 */
export function adaptAgentExtension(definition) {
  if (definition?.apiVersion !== 1 || typeof definition.setup !== "function")
    throw new Error("不支持的 Isle Agent 插件入口");
  return {
    id: definition.id,
    protocolVersion: 1,
    setup(native) {
      return definition.setup({
        workspacePath: native.workspacePath,
        config: native.config,
        session: {
          get: (key) => copy(native.session.get(key)),
          set: (key, value) => native.session.set(key, copy(value)),
          delete: (key) => native.session.delete(key),
        },
        registerTool(tool) {
          native.registerTool({
            name: tool.name,
            label: tool.label,
            description: tool.description,
            parameters: copy(tool.parameters),
            execute: async (input, context) =>
              toolResult(
                await tool.execute(copy(input), {
                  callId: context.callId,
                  signal: context.signal,
                  progress: (value) => context.progress(toolResult(value)),
                }),
              ),
          });
        },
        registerCommand(command) {
          native.registerCommand({
            name: command.name,
            description: command.description,
            parameters: copy(command.parameters),
            execute: async (input, context) =>
              copy(
                await command.execute(copy(input), { signal: context.signal }),
              ),
          });
        },
        registerSkill: (skill) =>
          native.registerSkill({
            name: skill.name,
            description: skill.description,
            content: skill.content,
          }),
        use: (type, handler) =>
          native.use(type, async (input, context) =>
            copy(await handler(copy(input), { signal: context.signal })),
          ),
        on: (type, handler) =>
          native.on(type, (event, context) =>
            handler(copy(event), { signal: context.signal }),
          ),
        own: (dispose) => native.own(dispose),
        onActivate: (activate) => native.onActivate(activate),
      });
    },
  };
}

/** Owns SDK service names and browser context shape. The native view host only knows services.
 * @param {import("@isle/extension-sdk/ui").ExtensionUIDefinition} definition
 * @returns {import("@isle/extension-host/ui").ExtensionUIDefinition}
 */
export function adaptUIExtension(definition) {
  if (definition?.apiVersion !== 1 || typeof definition.mount !== "function")
    throw new Error("不支持的 Isle UI 插件入口");
  return {
    id: definition.id,
    protocolVersion: 1,
    mount(root, native) {
      /** @type {import("@isle/extension-sdk/host").ExtensionHostServices} */
      const host = {
        capabilities: Object.freeze(
          native.services.capabilities.map(({ capability, status }) =>
            Object.freeze({ capability, status }),
          ),
        ),
        supports: (capability) => native.services.supports(capability),
        session: {
          read: async (options) =>
            copy(await native.services.session.read(options)),
          ledger: {
            read: async (options) =>
              copy(await native.services.session.ledger.read(options)),
          },
          summarize: async (input, options) =>
            copy(await native.services.session.summarize(copy(input), options)),
        },
      };
      Object.freeze(host.session.ledger);
      Object.freeze(host.session);
      Object.freeze(host);
      return definition.mount(
        root,
        Object.freeze({
          input: copy(native.input),
          ui: Object.freeze({
            dialog: Object.freeze({
              get available() {
                return native.ui.dialog.available;
              },
              /** @param {{ id: string, input?: import("@isle/extension-sdk").JsonObject }} request */
              open: (request) => native.ui.dialog.open(copy(request)),
              close: () => native.ui.dialog.close(),
            }),
          }),
          contributionId: native.contributionId,
          viewId: native.viewId,
          config: native.config,
          signal: native.signal,
          host,
        }),
      );
    },
  };
}
