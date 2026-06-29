import type { BridgeEvent } from "../engine/agent/contracts/protocol.js";
import type { CollaborationEvent } from "../engine/collaboration/index.js";

export type AgentRuntimeEvent = BridgeEvent | CollaborationEvent;
