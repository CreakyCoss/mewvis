import { deleteApplicationAgentSessions } from "@/platform/agent";
import type { TavernAgentFlowSessionInput } from "../types";
export const tavernAgentFlowSessionRootDir = () => "session";
export const deleteTavernAgentFlowSession = ({ workspacePath }: TavernAgentFlowSessionInput) => deleteApplicationAgentSessions(workspacePath);
