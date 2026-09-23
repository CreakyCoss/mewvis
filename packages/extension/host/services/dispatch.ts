import { Ajv } from "ajv";
import {
  extensionHostMethods,
  type ExtensionHostCapability,
  type ExtensionHostMethods,
  type ExtensionHostRequirements,
  type ExtensionHostSupport,
} from "./contracts.js";
import { HostServiceError as ServiceError } from "./error.js";

export interface ExtensionHostContext {
  target: { workspacePath: string; chatId: string };
  signal: AbortSignal;
}
export type ExtensionHostAdapter = {
  [M in ExtensionHostCapability]?: (
    input: ExtensionHostMethods[M]["input"],
    context: ExtensionHostContext,
  ) => Promise<ExtensionHostMethods[M]["output"]>;
};
const ajv = new Ajv({ allErrors: true });
const validators = Object.fromEntries(
  Object.entries(extensionHostMethods).map(([method, contract]) => [
    method,
    ajv.compile(contract.requestSchema),
  ]),
);

/** One protocol dispatch boundary. Transports and plugins cannot invoke arbitrary internal services. */
export class ExtensionHost {
  constructor(private readonly adapter: ExtensionHostAdapter = {}) {}
  describe(
    requirements: ExtensionHostRequirements = {},
  ): ExtensionHostSupport[] {
    const granted = new Set([
      ...(requirements.required ?? []),
      ...(requirements.optional ?? []),
    ]);
    return (Object.keys(extensionHostMethods) as ExtensionHostCapability[]).map(
      (capability) => ({
        capability,
        status: !granted.has(capability)
          ? "denied"
          : this.adapter[capability]
            ? "available"
            : "unsupported",
      }),
    );
  }
  check(requirements: ExtensionHostRequirements = {}) {
    const support = this.describe(requirements);
    for (const capability of requirements.required ?? []) {
      if (
        support.find((item) => item.capability === capability)?.status !==
        "available"
      )
        throw new ServiceError(
          501,
          "HOST_UNSUPPORTED",
          `宿主未实现插件所需能力：${capability}`,
        );
    }
    return support;
  }
  async invoke(
    method: string,
    input: unknown,
    requirements: ExtensionHostRequirements | undefined,
    context: ExtensionHostContext,
  ) {
    const support = this.describe(requirements).find(
      (item) => item.capability === method,
    );
    if (!support || support.status === "denied")
      throw new ServiceError(403, "HOST_DENIED", "插件未获得此能力");
    if (support.status === "unsupported")
      throw new ServiceError(501, "HOST_UNSUPPORTED", "宿主未实现此能力");
    if (!validators[method]?.(input))
      throw new ServiceError(
        400,
        "HOST_INVALID_REQUEST",
        "宿主能力请求参数无效",
      );
    try {
      context.signal.throwIfAborted();
      // Correlation is guaranteed by the protocol method and its request schema above.
      const handler = this.adapter[method as ExtensionHostCapability] as (
        input: unknown,
        context: ExtensionHostContext,
      ) => Promise<unknown>;
      const result = await handler(input, context);
      context.signal.throwIfAborted();
      return result;
    } catch (error) {
      if (context.signal.aborted)
        throw new ServiceError(409, "HOST_CANCELLED", "请求已取消");
      if (error instanceof ServiceError && error.code.startsWith("HOST_"))
        throw error;
      throw new ServiceError(500, "HOST_FAILED", "宿主服务执行失败");
    }
  }
}
