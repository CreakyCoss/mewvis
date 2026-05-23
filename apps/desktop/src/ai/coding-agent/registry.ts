import type { CodingAgentAdapter } from "./base";
import { PiRpcCodingAgentAdapter } from "./adapters/pi-rpc";

export type CodingAgentAdapterId = "pi-rpc";

const adapters = {
  "pi-rpc": () => new PiRpcCodingAgentAdapter(),
} satisfies Record<CodingAgentAdapterId, () => CodingAgentAdapter>;

export const createCodingAgentAdapter = (
  adapterId: CodingAgentAdapterId = "pi-rpc",
) => adapters[adapterId]();
