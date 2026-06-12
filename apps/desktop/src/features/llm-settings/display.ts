import type { ProviderModel } from "./types";

const oneMillionContextSuffix = "[1m]";

export const formatProviderModelName = (model: Pick<ProviderModel, "modelId" | "modelName" | "isOneMillionContext">) => {
  const name = model.isOneMillionContext
    ? model.modelId
    : model.modelName || model.modelId;

  if (!model.isOneMillionContext || name.endsWith(oneMillionContextSuffix)) {
    return name;
  }

  return `${name}${oneMillionContextSuffix}`;
};
