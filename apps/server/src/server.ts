import type { NativePicker } from "./infrastructure/dialogs/native-picker.js";
import {
  runtimeConfig,
  assertRuntimeAvailable,
  type RuntimeConfig,
} from "./config/runtime.js";
import { ServerServices } from "./bootstrap/services.js";
import { registerCommands } from "./bootstrap/commands.js";
import { startHttpServer } from "./transport/http/server.js";

export interface ServerOptions {
  token: string;
  nativePicker?: NativePicker;
  port?: number;
  allowedOrigins?: string[];
  webRoot?: string;
  runtime?: Partial<RuntimeConfig>;
}

/** Public startup API; bootstrap/ owns composition, transport/ owns the HTTP lifecycle. */
export async function startServer(options: ServerOptions) {
  if (
    !options.token ||
    Buffer.byteLength(options.token) < 24 ||
    /[\r\n]/.test(options.token)
  ) {
    throw new Error("Server token 至少需要 24 字节，不能包含换行");
  }
  const config = runtimeConfig(options.runtime);
  assertRuntimeAvailable(config);
  const resources = new ServerServices(config, options.nativePicker);
  try {
    const services = await resources.initialize();
    const http = await startHttpServer({
      ...options,
      supervisor: resources.supervisor,
      commands: registerCommands(services),
      shutdown: () => resources.shutdown(),
      dispose: () => resources.dispose(),
    });
    return { ...http, supervisor: resources.supervisor, host: services.agent };
  } catch (error) {
    try {
      await resources.shutdown();
    } finally {
      resources.dispose();
    }
    throw error;
  }
}
