/** Protocol source. Run `pnpm --filter @isle/extension-host generate` after editing. */
const identifier = {
  type: "string",
  pattern: "^[a-z][a-z0-9-]*$",
  maxLength: 64,
};
const payload = (properties, required) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});

/** Serializable payload contracts, independent of host framework and placement. */
export const uiSlotTypes = Object.freeze({
  settings: Object.freeze({
    type: "settings",
    schema: payload(
      {
        title: { type: "string", minLength: 1, maxLength: 64 },
        view: {
          ...payload({ id: identifier }, ["id"]),
          title: "UIViewReference",
        },
      },
      ["title", "view"],
    ),
  }),
  status: Object.freeze({
    type: "status",
    schema: payload(
      { title: { type: "string", minLength: 1, maxLength: 64 } },
      ["title"],
    ),
  }),
  action: Object.freeze({
    type: "action",
    schema: payload(
      {
        title: { type: "string", minLength: 1, maxLength: 64 },
        icon: {
          enum: ["activity", "chart", "files", "git-branch", "info", "puzzle", "sparkles"],
        },
        trigger: payload(
          { kind: { const: "dialog" }, id: identifier },
          ["kind", "id"],
        ),
      },
      ["title", "icon", "trigger"],
    ),
  }),
  text: Object.freeze({
    type: "text",
    schema: payload(
      {
        text: { type: "string", maxLength: 8000 },
        tone: { enum: ["neutral", "info", "warning"] },
      },
      ["text"],
    ),
  }),
  dialog: Object.freeze({
    type: "dialog",
    schema: payload(
      {
        title: { type: "string", minLength: 1, maxLength: 64 },
        size: { enum: ["sm", "md", "lg"] },
        view: {
          ...payload({ id: identifier }, ["id"]),
          title: "UIViewReference",
        },
      },
      ["title", "size", "view"],
    ),
  }),
  sidebar: Object.freeze({
    type: "sidebar",
    schema: payload(
      {
        title: { type: "string", minLength: 1, maxLength: 64 },
        icon: {
          enum: ["chart", "files", "git-branch", "activity", "puzzle", "info"],
        },
        view: {
          ...payload({ id: identifier }, ["id"]),
          title: "UIViewReference",
        },
      },
      ["title", "icon", "view"],
    ),
  }),
});

const slot = (key, kind, scope) =>
  Object.freeze({ key, type: kind.type, scope });
/** Use these references in code; stable keys are only serialized at the protocol boundary. */
export const uiSlotDefinitions = Object.freeze({
  pluginSettings: slot("plugin.settings", uiSlotTypes.settings, "application"),
  composerStatus: slot(
    "session.composer-status",
    uiSlotTypes.status,
    "session",
  ),
  composerActions: slot("session.composer-actions", uiSlotTypes.action, "session"),
  headerActions: slot("session.header-actions", uiSlotTypes.action, "session"),
  sessionStatus: slot("session.status", uiSlotTypes.text, "session"),
  pluginDialog: slot("plugin.dialog", uiSlotTypes.dialog, "application"),
  sessionDialog: slot("session.dialog", uiSlotTypes.dialog, "session"),
  sessionSidebar: slot("session.sidebar", uiSlotTypes.sidebar, "session"),
});

export function defineUIContribution(definition, contribution) {
  return { ...contribution, slot: definition.key, type: definition.type };
}
