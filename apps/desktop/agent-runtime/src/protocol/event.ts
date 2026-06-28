import type { BridgeEvent } from "../agent-engine/contracts/protocol.js";
import type { CollaborationEvent } from "../collaboration-engine/index.js";

export type AgentRuntimeEvent = BridgeEvent | CollaborationEvent;
