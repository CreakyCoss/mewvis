import { Ajv } from "ajv";
import manifestSchema from "@isle/extension-sdk/manifest.schema.json" with { type: "json" };
import contributionSchema from "@isle/extension-sdk/ui/contribution.schema.json" with { type: "json" };
const ajv = new Ajv({ allErrors: true });
ajv.addSchema(contributionSchema);
const validate = ajv.compile(manifestSchema);

/** Metadata translation only; executable entries are adapted independently inside their execution environment. */
export function adaptIslePackage(packageJson) {
  if (!validate(packageJson))
    throw new Error(`Isle 插件清单无效：${ajv.errorsText(validate.errors)}`);
  const source = packageJson["isle.extension"];
  const modules = {};
  if (source.modules.agent)
    modules.agent = {
      entry: source.modules.agent.entry,
      capabilities: [...source.modules.agent.capabilities],
    };
  if (source.modules.ui)
    modules.ui = {
      ...(source.modules.ui.entry && { entry: source.modules.ui.entry }),
      contributions: source.modules.ui.contributions.map((item) =>
        item.type === "sidebar" ||
        item.type === "dialog" ||
        item.type === "settings"
          ? {
              id: item.id,
              slot: item.slot,
              type: item.type,
              title: item.title,
              ...(item.type === "sidebar"
                ? { icon: item.icon }
                : item.type === "dialog"
                  ? { size: item.size }
                  : {}),
              view: { id: item.view.id },
            }
          : item.type === "status"
            ? {
                id: item.id,
                slot: item.slot,
                type: item.type,
                title: item.title,
              }
            : {
                id: item.id,
                slot: item.slot,
                type: item.type,
                text: item.text,
                ...(item.tone && { tone: item.tone }),
              },
      ),
    };
  const { "isle.extension": _external, ...metadata } = packageJson;
  return {
    ...metadata,
    "isle.plugin": {
      id: source.id,
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
