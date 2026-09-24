export const decisionRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["input", "question", "output"],
  properties: {
    input: {
      type: "string",
      minLength: 1,
      maxLength: 24000,
    },
    question: {
      type: "string",
      minLength: 1,
      maxLength: 4000,
    },
    output: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "options"],
          properties: {
            type: {
              const: "choice",
            },
            options: {
              type: "array",
              minItems: 2,
              maxItems: 10,
              uniqueItems: true,
              items: {
                type: "string",
                minLength: 1,
                maxLength: 300,
              },
            },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "levels"],
          properties: {
            type: {
              const: "score",
            },
            levels: {
              type: "array",
              minItems: 2,
              maxItems: 10,
              uniqueItems: true,
              items: {
                type: "string",
                minLength: 1,
                maxLength: 300,
              },
            },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type"],
          properties: {
            type: {
              const: "boolean",
            },
          },
        },
      ],
    },
  },
};
export const decisionResultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "value", "status", "reason"],
  properties: {
    type: {
      enum: ["choice", "score", "boolean"],
    },
    value: {
      anyOf: [
        { type: "string" },
        { type: "number" },
        { type: "boolean" },
        { type: "null" },
      ],
    },
    status: {
      enum: ["accepted", "review_required", "abstained"],
    },
    reason: {
      type: "string",
      minLength: 1,
      maxLength: 2000,
    },
    confidence: {
      type: "object",
      additionalProperties: false,
      required: ["value", "source"],
      properties: {
        value: {
          type: "number",
          minimum: 0,
          maximum: 1,
        },
        source: {
          enum: ["model_self_report", "calibrated", "rule"],
        },
      },
    },
  },
};
export function decisionResultMatchesRequest(input, result) {
  if (result.type !== input.output.type) return false;
  if (result.value === null) return result.status === "abstained";
  if (result.status === "abstained") return false;
  switch (input.output.type) {
    case "choice":
      return input.output.options.includes(result.value);
    case "score":
      return (
        Number.isInteger(result.value) &&
        result.value >= 0 &&
        result.value < input.output.levels.length
      );
    case "boolean":
      return typeof result.value === "boolean";
    default:
      return false;
  }
}
