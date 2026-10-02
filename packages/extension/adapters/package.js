import { Ajv } from "ajv";
import manifestSchema from "@mewvis/extension-sdk/manifest.schema.json" with { type: "json" };
import contributionSchema from "@mewvis/extension-sdk/ui/contribution.schema.json" with { type: "json" };
const ajv = new Ajv({ allErrors: true });
ajv.addSchema(contributionSchema);
const validate = ajv.compile(manifestSchema);

/** Metadata translation only; executable entries are adapted independently inside their execution environment. */
export function adaptMewvisPackage(packageJson) {
  if (!validate(packageJson))
    throw new Error(`Mewvis 插件清单无效：${ajv.errorsText(validate.errors)}`);
  const source = packageJson["mewvis.extension"];
  const modules = {};
  if (source.modules.agent)
    modules.agent = {
      entry: source.modules.agent.entry,
      capabilities: [...source.modules.agent.capabilities],
    };
  if (source.modules.ui)
    modules.ui = {
      ...(source.modules.ui.entry && { entry: source.modules.ui.entry }),
      // Current SDK and host UI payloads share a serializable shape. The host
      // validates its own schema after translation, so new slot types need no switch here.
      contributions: structuredClone(source.modules.ui.contributions),
    };
  const { "mewvis.extension": _external, ...metadata } = packageJson;
  return {
    ...metadata,
    "mewvis.plugin": {
      id: source.id,
      ...(source.displayName && { displayName: source.displayName }),
      schemaVersion: 1,
      protocolVersion: 1,
      modules,
      ...(source.host && { host: structuredClone(source.host) }),
      ...(source.configuration && {
        configuration: structuredClone(source.configuration),
      }),
    },
  };
}
