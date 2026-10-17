import assert from "node:assert/strict";
import { ApplicationHost } from "../../../../packages/app/host/dist/index.js";

/** SDK embedding: the caller owns one host and supplies declarations plus the execution callback. */
export async function applicationFixture(application, options = {}) {
  const { cwd, ...hostOptions } = options;
  const host = await ApplicationHost.create(hostOptions);
  try {
    await host.load(application);
    return {
      resources: { items: [await host.runtimeResources(application.id, { cwd })] },
      callbacks: {
        async executeApplicationTool(call, signal) {
          assert.equal(call.applicationId, application.id);
          const result = await host.executeTool({
            callId: call.callId,
            name: call.toolName,
            arguments: call.arguments,
            signal,
          });
          if (result.isError) throw new Error(result.error.message);
          return {
            value: result.value ?? null,
            content: result.content,
            meta: result.meta,
            additionalContexts: result.additionalContexts,
            concludesTurn: result.concludesTurn,
          };
        },
      },
      dispose: () => host.dispose(),
    };
  } catch (error) {
    await host.dispose();
    throw error;
  }
}
