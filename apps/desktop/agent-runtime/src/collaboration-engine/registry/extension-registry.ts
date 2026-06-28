import type {
  CollaborationConditionHandler,
  CollaborationExtension,
  CollaborationExtensionRegistry,
  CollaborationRouterHandler,
  CollaborationTransformHandler,
} from "../contracts.js";

type HandlerKind = "transform" | "condition" | "router";

type HandlerMaps = {
  transforms: Map<string, CollaborationTransformHandler>;
  conditions: Map<string, CollaborationConditionHandler>;
  routers: Map<string, CollaborationRouterHandler>;
};

export const createCollaborationExtensionRegistry = (
  extensions: readonly CollaborationExtension[] = [],
): CollaborationExtensionRegistry => {
  const handlers: HandlerMaps = {
    transforms: new Map(),
    conditions: new Map(),
    routers: new Map(),
  };

  for (const extension of extensions) {
    registerHandlers(
      handlers.transforms,
      "transform",
      extension.namespace,
      extension.transforms,
    );
    registerHandlers(
      handlers.conditions,
      "condition",
      extension.namespace,
      extension.conditions,
    );
    registerHandlers(
      handlers.routers,
      "router",
      extension.namespace,
      extension.routers,
    );
  }

  return {
    getTransform: (id) => handlers.transforms.get(normalizeHandlerId(id)),
    requireTransform: (id) => requireHandler(handlers.transforms, "transform", id),
    getCondition: (id) => handlers.conditions.get(normalizeHandlerId(id)),
    requireCondition: (id) => requireHandler(handlers.conditions, "condition", id),
    getRouter: (id) => handlers.routers.get(normalizeHandlerId(id)),
    requireRouter: (id) => requireHandler(handlers.routers, "router", id),
    list: () => ({
      transforms: Array.from(handlers.transforms.keys()).sort(),
      conditions: Array.from(handlers.conditions.keys()).sort(),
      routers: Array.from(handlers.routers.keys()).sort(),
    }),
  };
};

const registerHandlers = <THandler>(
  target: Map<string, THandler>,
  kind: HandlerKind,
  namespace: string | null | undefined,
  source: Record<string, THandler> | null | undefined,
) => {
  if (!source) {
    return;
  }

  for (const [rawId, handler] of Object.entries(source)) {
    const ids = resolveRegistrationIds(namespace, rawId);
    for (const id of ids) {
      if (target.has(id)) {
        throw new Error(`协作 ${kind} handler 重复注册：${id}`);
      }
      target.set(id, handler);
    }
  }
};

const resolveRegistrationIds = (
  namespace: string | null | undefined,
  rawId: string,
) => {
  const id = normalizeHandlerId(rawId);
  if (!id) {
    throw new Error("协作 extension handler id 不能为空");
  }

  const normalizedNamespace = namespace?.trim();
  if (!normalizedNamespace || id.includes(".")) {
    return [id];
  }

  return [`${normalizedNamespace}.${id}`];
};

const requireHandler = <THandler>(
  source: Map<string, THandler>,
  kind: HandlerKind,
  rawId: string,
) => {
  const id = normalizeHandlerId(rawId);
  const handler = source.get(id);
  if (!handler) {
    throw new Error(`协作 workflow 引用了未注册的 ${kind} handler：${id || "<empty>"}`);
  }
  return handler;
};

export const normalizeHandlerId = (id: string) => id.trim();
