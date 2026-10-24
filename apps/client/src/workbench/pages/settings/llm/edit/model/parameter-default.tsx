import { isEqual } from "lodash-es";
import type { ModelParameter } from "@mewvis/chat-contracts";
import { Input } from "design-system/components/ui/input";
import { NativeSelect, NativeSelectOption } from "design-system/components/ui/native-select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "design-system/components/ui/tooltip";
import { useEditorBuffers } from "./fields";
import { parameterValueText, summarizeParameterSchema } from "./parameter-json";
import {
  getParameterDefaultControl,
  getParameterDefaultError,
  parameterDefaultInput,
  parseParameterDefault,
  withParameterDefault,
} from "./parameter-defaults";

export function ParameterDefault({
  parameter,
  id,
  onChange,
}: {
  parameter: ModelParameter;
  id: string;
  onChange: (parameter: ModelParameter) => void;
}) {
  const buffers = useEditorBuffers();
  const buffer = buffers.values[id];
  const control = getParameterDefaultControl(parameter);
  const summary = summarizeParameterSchema(parameter.schema);
  const error =
    buffer?.error || (parameter.default === undefined ? "" : getParameterDefaultError(parameter, parameter.default));
  const raw = buffer?.raw ?? parameterDefaultInput(parameter);
  const selected =
    control.type === "select" ? control.options.findIndex((option) => isEqual(option.value, parameter.default)) : -1;
  return (
    <div className="min-w-0 space-y-1">
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="min-w-0">
              {control.type === "select" ? (
                <NativeSelect
                  size="sm"
                  className="w-full [&_select]:px-2 [&_select]:pr-7 [&_select]:font-mono [&_select]:text-xs"
                  aria-label={`${parameter.name} 默认值`}
                  aria-invalid={!!error}
                  aria-describedby={error ? `${id}-error` : undefined}
                  value={selected >= 0 ? `option-${selected}` : parameter.default === undefined ? "" : "unmatched"}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (value === "unmatched") return;
                    buffers.clear(id, true);
                    onChange(
                      withParameterDefault(
                        parameter,
                        value ? control.options[Number(value.slice(7))].value : undefined,
                      ),
                    );
                  }}
                >
                  <NativeSelectOption value="">未设置</NativeSelectOption>
                  {selected < 0 && parameter.default !== undefined && (
                    <NativeSelectOption value="unmatched" disabled>
                      {parameterValueText(parameter.default)}（无效）
                    </NativeSelectOption>
                  )}
                  {control.options.map((option, index) => (
                    <NativeSelectOption key={index} value={`option-${index}`} disabled={option.disabled}>
                      {parameterValueText(option.value)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              ) : (
                <Input
                  type={control.type === "number" ? "number" : "text"}
                  min={control.type === "number" ? control.min : undefined}
                  max={control.type === "number" ? control.max : undefined}
                  step={control.type === "number" ? control.step : undefined}
                  aria-label={`${parameter.name} 默认值`}
                  aria-invalid={!!error}
                  aria-describedby={error ? `${id}-error` : undefined}
                  placeholder={
                    parameter.default === ""
                      ? "空字符串"
                      : parameter.type === "object" || parameter.type === "array"
                        ? "JSON 值（可不设置）"
                        : "未设置"
                  }
                  className="h-8 min-w-0 px-2 font-mono text-xs shadow-none"
                  value={raw}
                  onChange={(event) => {
                    const text = event.currentTarget.value;
                    const result = event.currentTarget.validity.badInput
                      ? { error: "请输入有效数字" }
                      : parseParameterDefault(parameter, text);
                    buffers.set(id, { raw: text, error: result.error });
                    if (!result.error) onChange(withParameterDefault(parameter, result.value));
                  }}
                />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            align="start"
            className="z-100 block max-h-64 max-w-[min(320px,calc(100vw-3rem))] space-y-1 overflow-y-auto [overflow-wrap:anywhere]"
          >
            {summary.length ? summary.map((line, i) => <p key={i}>{line}</p>) : <p>未设置结构要求</p>}
            <p className="opacity-70">{parameter.askWhenMissing ? "缺少时询问用户" : "缺少时使用默认值"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {error && (
        <p id={`${id}-error`} className="text-[11px] text-destructive" role="alert">
          {error}
        </p>
      )}
      {parameter.askWhenMissing && <p className="text-[11px] text-muted-foreground">缺少时询问</p>}
    </div>
  );
}
