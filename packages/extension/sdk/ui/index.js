/** Runs only in the UI extension host, never in an Agent worker. */
export const defineUIExtension = (definition) => definition;

export { uiSlotDefinitions, uiSlotTypes, defineUIContribution } from "./slots.js";
