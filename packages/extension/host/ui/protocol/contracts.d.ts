import type {
  UIContribution,
  uiSlotDefinitions,
  uiSlotTypes,
} from "./contracts.generated.js";
export { uiSlotDefinitions, uiSlotTypes } from "./contracts.generated.js";
export type { UIContribution, UIViewReference } from "./contracts.generated.js";

/** Host target only. Plugins receive scoped services instead of filesystem/session identifiers. */
export interface UISessionContext {
  workspacePath: string;
  chatId: string;
}
export type UIHostContext = Partial<UISessionContext>;
export interface UIScopeContexts {
  application: { workspacePath?: never; chatId?: never };
  session: UISessionContext;
}
export type UISlotDefinition =
  (typeof uiSlotDefinitions)[keyof typeof uiSlotDefinitions];
export type UISlotKey = UISlotDefinition["key"];
export type UISlotType = UISlotDefinition["type"];
export type UISlotTypeDefinition =
  (typeof uiSlotTypes)[keyof typeof uiSlotTypes];
export type UISlotContext<D extends UISlotDefinition> =
  UIScopeContexts[D["scope"]];
export type UIContributionFor<D extends UISlotDefinition> = Extract<
  UIContribution,
  { slot: D["key"] }
>;
export function defineUIContribution<D extends UISlotDefinition>(
  definition: D,
  contribution: Omit<UIContributionFor<NoInfer<D>>, "slot" | "type">,
): UIContributionFor<D>;

export interface UISlotStatus {
  key: UISlotKey;
  type: UISlotType;
  /** Mounted host surfaces, independently of opened plugin views. */
  surfaces: number;
}
