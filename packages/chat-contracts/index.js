// Shared value contracts with no application or execution dependencies.
// Risk levels are ordered from least to most severe.
export const RISK_LEVELS = Object.freeze(["low", "medium", "high"]);
export const isRiskLevel = (value) => RISK_LEVELS.includes(value);
