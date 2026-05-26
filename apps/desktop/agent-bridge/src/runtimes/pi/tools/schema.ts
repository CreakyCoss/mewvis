import {
  Type,
  type TSchema,
} from "@earendil-works/pi-ai";
import type { ToolParameterDefinition } from "../../../tools/types.js";

export const toPiToolParameters = (definition: ToolParameterDefinition): TSchema => {
  let schema: TSchema;

  switch (definition.type) {
    case "string":
      schema = Type.String({ description: definition.description }) as TSchema;
      break;
    case "literal":
      schema = Type.Literal(definition.value) as TSchema;
      break;
    case "union":
      schema = Type.Union(
        definition.anyOf.map((item) => toPiToolParameters(item)),
        { description: definition.description },
      ) as TSchema;
      break;
    case "array":
      schema = Type.Array(
        toPiToolParameters(definition.items),
        { description: definition.description },
      ) as TSchema;
      break;
    case "object":
      schema = Type.Object(
        Object.fromEntries(
          Object.entries(definition.properties).map(([name, property]) => [
            name,
            toPiToolParameters(property),
          ]),
        ),
        definition.description ? { description: definition.description } : undefined,
      ) as TSchema;
      break;
  }

  return definition.optional ? Type.Optional(schema) as TSchema : schema;
};
