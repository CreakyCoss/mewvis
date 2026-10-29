import type { DoudizhuModel } from "./model";
import { resolveDoudizhuComposition } from "./composition/catalog";
import { validateDoudizhuCore } from "./validation-core";
export { validateDoudizhuCore } from "./validation-core";
export function validateDoudizhu(input: unknown, draft = false) {
  return [
    ...validateDoudizhuCore(input, draft),
    ...resolveDoudizhuComposition(input as DoudizhuModel, draft).issues,
  ];
}
