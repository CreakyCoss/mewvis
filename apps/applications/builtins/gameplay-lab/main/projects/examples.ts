import { copy } from "../shared/utils";
import { validateModel, type Model } from "../turn/model";
import combination from "./templates/combination.json";
import development from "./templates/development.json";

export type TemplateId = "development" | "combination";
export const templates: readonly Model[] = [
  development,
  combination,
] as Model[];
export function isTemplateId(value: unknown): value is TemplateId {
  return value === "development" || value === "combination";
}
export function makeTemplate(id: TemplateId = "development"): Model {
  const template = templates.find((item) => item.id === id);
  if (!template || validateModel(template).length)
    throw new Error("内置模板无法读取，请更新应用后重试。");
  return copy(template);
}
