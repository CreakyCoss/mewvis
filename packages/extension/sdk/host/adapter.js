import { extensionCapabilities } from "../agent/index.js";

const modes = new Set(["direct", "simulate", "ignore", "noop", "error"]);
function validateAdapter(adapter) {
  if (
    !adapter ||
    adapter.protocolVersion !== 1 ||
    typeof adapter.id !== "string" ||
    !adapter.id.trim() ||
    typeof adapter.adapt !== "function"
  )
    throw new Error("无效的插件适配器或不支持的协议版本");
  if (
    !adapter.capabilities ||
    typeof adapter.capabilities !== "object" ||
    Array.isArray(adapter.capabilities)
  )
    throw new Error("插件适配器必须声明能力映射");
  for (const [capability, mapping] of Object.entries(adapter.capabilities)) {
    if (
      !extensionCapabilities.includes(capability) ||
      !mapping ||
      !modes.has(mapping.mode)
    )
      throw new Error(`无效的插件能力映射：${capability}`);
    if (
      mapping.mode !== "direct" &&
      (typeof mapping.reason !== "string" || !mapping.reason.trim())
    )
      throw new Error(`插件能力映射必须说明原因：${capability}`);
  }
}

export function defineExtensionAdapter(adapter) {
  validateAdapter(adapter);
  const { protocolVersion, adapt } = adapter;
  return Object.freeze({
    ...adapter,
    adapt(bindings, context) {
      if (bindings.protocolVersion !== protocolVersion)
        throw new Error("插件绑定与适配器协议版本不一致");
      return adapt(bindings, context);
    },
    capabilities: Object.freeze(
      Object.fromEntries(
        Object.entries(adapter.capabilities).map(([key, value]) => [
          key,
          Object.freeze({ ...value }),
        ]),
      ),
    ),
  });
}

export function resolveExtensionAdaptation(adapter, sources) {
  validateAdapter(adapter);
  const mappings = [];
  for (const source of sources) {
    for (const capability of source.capabilities ?? extensionCapabilities) {
      const mapping = Object.hasOwn(adapter.capabilities, capability)
        ? adapter.capabilities[capability]
        : undefined;
      if (!mapping || mapping.mode === "error")
        throw new Error(
          `${adapter.id} 不支持插件 ${source.id} 所需能力：${capability}${mapping?.reason ? `（${mapping.reason}）` : ""}`,
        );
      mappings.push({ extensionId: source.id, capability, ...mapping });
    }
  }
  return {
    adapterId: adapter.id,
    protocolVersion: 1,
    degraded: mappings.some(({ mode }) => mode === "ignore" || mode === "noop"),
    mappings,
  };
}
