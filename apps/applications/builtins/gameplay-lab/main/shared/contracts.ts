export interface Issue {
  path: string;
  message: string;
}
export interface SimulatorRef {
  id: string;
  version: number;
}
export interface ReadinessIssue extends Issue {
  view: "model" | "rules" | "simulator";
  nodeId?: string;
}
export function isSimulatorRef(value: unknown): value is SimulatorRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as SimulatorRef;
  return (
    typeof v.id === "string" &&
    /^[a-zA-Z0-9_-]{1,100}$/.test(v.id) &&
    Number.isInteger(v.version) &&
    v.version >= 1 &&
    v.version <= 1000
  );
}
export const simulatorKey = (ref: SimulatorRef | null) =>
  ref ? `${ref.id}@${ref.version}` : "";
