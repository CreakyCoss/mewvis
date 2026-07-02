import { randomUUID } from "node:crypto";

export const createCollaborationRunId = () => `workflow-${randomUUID()}`;
