import {
  getApplicationChatClient,
  type ApplicationModelOption,
} from "@isle/app-sdk/chat";
export type RuntimeModelOption = ApplicationModelOption;
export type RuntimeModelInput = { modelId: string };
export type RuntimeSessionRef = { id: string };
export const listModels = () => getApplicationChatClient().listModels();
export const buildRuntimeModelInputs = (
  models: ApplicationModelOption[],
): Record<string, RuntimeModelInput> =>
  Object.fromEntries(models.map((model) => [model.id, { modelId: model.id }]));
