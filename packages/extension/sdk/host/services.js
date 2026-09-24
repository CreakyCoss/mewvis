const empty = { type: "object", additionalProperties: false, properties: {} };
export const extensionHostMethods = Object.freeze({
  "configuration.read": { requestSchema: empty },
  "configuration.write": {
    requestSchema: {
      type: "object",
      additionalProperties: false,
      required: ["value"],
      properties: { value: { type: "object" } },
    },
  },
  "tasks.run": {
    requestSchema: {
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: {
        tools: { const: "none" },
        title: { type: "string", minLength: 1, maxLength: 256 },
        avatar: { type: "string", maxLength: 32768, pattern: "^(https?://|data:image/)" },
        systemPrompt: { type: "string", maxLength: 16384 },
        text: { type: "string", minLength: 1, maxLength: 96000 },
      },
    },
  },
  "activity.publish": {
    requestSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id", "title", "state", "steps"],
      properties: {
        id: { type: "string", minLength: 1, maxLength: 128 },
        title: { type: "string", minLength: 1, maxLength: 128 },
        pausable: { type: "boolean" },
        state: { enum: ["running", "completed", "failed", "cancelled"] },
        detail: { type: "string", maxLength: 1000 },
        steps: {
          type: "array",
          maxItems: 32,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "title", "state"],
            properties: {
              id: { type: "string", maxLength: 128 },
              title: { type: "string", maxLength: 128 },
              actor: {
                type: "object",
                additionalProperties: false,
                required: ["name"],
                properties: {
                  name: { type: "string", minLength: 1, maxLength: 128 },
                },
              },
              state: {
                enum: [
                  "pending",
                  "running",
                  "completed",
                  "failed",
                  "cancelled",
                ],
              },
            },
          },
        },
      },
    },
  },
  "activity.read": { requestSchema: empty },
  "activity.cancel": {
    requestSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: { type: "string", minLength: 1, maxLength: 128 } },
    },
  },
  "activity.pause": {
    requestSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: { type: "string", minLength: 1, maxLength: 128 } },
    },
  },
  "activity.resume": {
    requestSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: { type: "string", minLength: 1, maxLength: 128 } },
    },
  },
  "activity.checkpoint": {
    requestSchema: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: { id: { type: "string", minLength: 1, maxLength: 128 } },
    },
  },

  "session.read": { requestSchema: empty },
  "session.ledger.read": { requestSchema: empty },
  "session.summarize": {
    requestSchema: {
      type: "object",
      additionalProperties: false,
      required: ["scope"],
      properties: {
        scope: {
          oneOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["kind"],
              properties: { kind: { const: "session" } },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["kind", "runId"],
              properties: {
                kind: { const: "run" },
                runId: { type: "string", minLength: 1, maxLength: 256 },
              },
            },
          ],
        },
      },
    },
  },
});

/** Self-contained so a transport host can also install this client inside an isolated browser frame. */
export function createExtensionHostClient(transport, capabilities) {
  const support = Object.freeze(
    capabilities.map((item) => Object.freeze({ ...item })),
  );
  const supports = (capability) =>
    support.some(
      (item) => item.capability === capability && item.status === "available",
    );
  const call = (method, input, options) => {
    const status =
      support.find((item) => item.capability === method)?.status ?? "denied";
    if (status !== "available")
      return Promise.reject(
        Object.assign(
          new Error(
            status === "unsupported" ? "宿主未实现此能力" : "插件未获得此能力",
          ),
          {
            code: status === "unsupported" ? "HOST_UNSUPPORTED" : "HOST_DENIED",
          },
        ),
      );
    return transport(method, input, options);
  };
  return Object.freeze({
    capabilities: support,
    configuration: Object.freeze({
      read: (options) => call("configuration.read", {}, options),
      write: (value, options) =>
        call("configuration.write", { value }, options),
    }),
    tasks: Object.freeze({
      run: (input, options) => call("tasks.run", input, options),
    }),
    activity: Object.freeze({
      publish: (input, options) => call("activity.publish", input, options),
      read: (options) => call("activity.read", {}, options),
      cancel: (id, options) => call("activity.cancel", { id }, options),
      pause: (id, options) => call("activity.pause", { id }, options),
      resume: (id, options) => call("activity.resume", { id }, options),
      checkpoint: (id, options) => call("activity.checkpoint", { id }, options),
    }),

    supports,
    session: Object.freeze({
      read: (options) => call("session.read", {}, options),
      ledger: Object.freeze({
        read: (options) => call("session.ledger.read", {}, options),
      }),
      summarize: (input, options) => call("session.summarize", input, options),
    }),
  });
}
