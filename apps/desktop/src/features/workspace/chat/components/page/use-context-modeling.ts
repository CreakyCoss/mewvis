import { useCallback, useMemo } from "react";
import {
  resolveAppContextWindow,
} from "@/features/ai/runtime";
import {
  resolveRuntimeModelInput,
  type RuntimeModelOption,
} from "@/features/ai/components/llm-setting/store";

type UseContextModelingInput = {
  effectiveRuntimeModel?: RuntimeModelOption | null;
};

export const useContextModeling = ({
  effectiveRuntimeModel,
}: UseContextModelingInput) => {
  const contextModelFor = useCallback((
    runtimeModel?: RuntimeModelOption | null,
  ) => {
    const modelInput = runtimeModel
      ? resolveRuntimeModelInput(runtimeModel.id)
      : null;
    const contextWindow = resolveAppContextWindow(modelInput);

    return modelInput
      ? { ...modelInput, contextWindow }
      : { contextWindow };
  }, []);

  const effectiveAppContextWindow = useMemo(
    () => contextModelFor(effectiveRuntimeModel).contextWindow,
    [contextModelFor, effectiveRuntimeModel],
  );

  return {
    contextModelFor,
    effectiveAppContextWindow,
  };
};
