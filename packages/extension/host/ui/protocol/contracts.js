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
  sessionStatus: slot("session.status", uiSlotTypes.text, "session"),
  sessionSidebar: slot("session.sidebar", uiSlotTypes.sidebar, "session"),
});

export function defineUIContribution(definition, contribution) {
  return { ...contribution, slot: definition.key, type: definition.type };
}
