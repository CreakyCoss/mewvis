const empty = { type: "object", additionalProperties: false, properties: {} };
export const extensionHostMethods = Object.freeze({
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
