import type { ToolParameterDefinition } from "../definition.js";
/** Adapt the original contract descriptor to the SDK's JSON Schema boundary. */
export function toolSchema(
  definition: ToolParameterDefinition,
): Record<string, unknown> {
  const description =
    "description" in definition ? { description: definition.description } : {};
  switch (definition.type) {
    case "literal":
      return { const: definition.value, type: "string" };
    case "json":
      return { ...description };
    case "union":
      return { ...description, anyOf: definition.anyOf.map(toolSchema) };
    case "array":
      return {
        ...description,
        type: "array",
        items: toolSchema(definition.items),
      };
    case "object":
      return {
        ...description,
        type: "object",
        properties: Object.fromEntries(
          Object.entries(definition.properties).map(([name, value]) => [
            name,
            toolSchema(value),
          ]),
        ),
        required: Object.entries(definition.properties)
          .filter(([, value]) => !value.optional)
          .map(([name]) => name),
      };
    default:
      return { ...description, type: definition.type };
  }
}
