// Shared value contracts with no application or execution dependencies.
export const RISK_LEVELS = Object.freeze(["low", "medium", "high"]);
export const isRiskLevel = (value) => RISK_LEVELS.includes(value);
