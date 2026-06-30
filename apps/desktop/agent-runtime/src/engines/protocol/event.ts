import type { AgentEvent } from "./agent.js";
import type { CollaborationEvent } from "./collaboration.js";

export type AgentRuntimeEvent = AgentEvent | CollaborationEvent;
