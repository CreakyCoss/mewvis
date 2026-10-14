import Ajv from "ajv";
import schema from "@mewvis/chat-contracts/model-capabilities.schema.json" with { type: "json" };
import type {
  RuntimeModelCapabilities,
  RuntimeModelLimits,
} from "@mewvis/chat-contracts";
import { invalid } from "../../shared/validation.js";
import { getModelConfigurationError } from "@mewvis/chat-contracts/model-configuration";
import type { ModelConfiguration } from "@mewvis/chat-contracts";

export const normalizeModelConfiguration = (
  value: unknown,
): ModelConfiguration | null => {
  if (value == null) return null;
  const error = getModelConfigurationError(value);
  if (error) invalid(error);
  const configuration = structuredClone(value) as ModelConfiguration;
  if (configuration.connection.apiKey)
    configuration.connection.apiKey = configuration.connection.apiKey.trim();
  if (configuration.connection.apiEndpoint)
    configuration.connection.apiEndpoint =
      configuration.connection.apiEndpoint.trim();
  return configuration;
};

const validator = new Ajv.default({ strict: false }).addSchema(
  schema,
  "model-config",
);
const capabilitiesValidator = validator.compile<RuntimeModelCapabilities>({
  $ref: "model-config#/definitions/RuntimeModelCapabilities",
});
const limitsValidator = validator.compile<RuntimeModelLimits>({
  $ref: "model-config#/definitions/RuntimeModelLimits",
});

export const normalizeModelCapabilities = (
  value: unknown,
): RuntimeModelCapabilities | null => {
  if (value == null) return null;
  if (!capabilitiesValidator(value))
    invalid("模型能力配置无效，请检查用途、输入输出类型和能力开关");
  return structuredClone(value);
};

export const normalizeModelLimits = (
  value: unknown,
): RuntimeModelLimits | null => {
  if (value == null) return null;
  if (!limitsValidator(value)) invalid("上下文和最大输出必须是有效的正整数");
  if (
    value.contextWindow &&
    value.maxTokens &&
    value.maxTokens > value.contextWindow
  )
    invalid("最大输出不能超过上下文窗口");
  return structuredClone(value);
};
