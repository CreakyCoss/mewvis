import { Plus, Trash2 } from "lucide-react";
import type { ModelParameter, ModelPurpose, JsonSchema } from "@mewvis/chat-contracts";
import { MODEL_PARAMETER_TYPES } from "@mewvis/chat-contracts/model-configuration";
import { Button } from "design-system/components/ui/button";
import { Checkbox } from "design-system/components/ui/checkbox";
import { Input } from "design-system/components/ui/input";
import { Choice, JsonField, ParameterValue, useEditorBuffers } from "./fields";
import { ConfirmDelete } from "../confirm-delete";

export function ParametersEditor({
  purpose,
  onChange,
}: {
  purpose: ModelPurpose;
  onChange: (value: ModelPurpose) => void;
}) {
  const buffers = useEditorBuffers();
  const prefix = `${purpose.type}-param-`;
  const update = (index: number, next: ModelParameter) =>
    onChange({ ...purpose, parameters: purpose.parameters.map((param, i) => (i === index ? next : param)) });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-medium">可调参数</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">设置默认值，并决定应用能否在调用时覆盖。</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 text-xs shadow-none"
          onClick={() => {
            let i = 1;
            while (purpose.parameters.some((p) => p.name === `parameter_${i}`)) i++;
            onChange({
              ...purpose,
              parameters: [
                ...purpose.parameters,
                { name: `parameter_${i}`, type: "string", default: "", overridable: true },
              ],
            });
          }}
        >
          <Plus className="size-3.5" />
          添加参数
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border border-border/70">
        <div className="hidden grid-cols-[minmax(0,1fr)_6rem_minmax(0,1.2fr)_3rem_2rem] gap-2 border-b border-border/60 bg-muted/25 px-3 py-2 text-[11px] text-muted-foreground sm:grid">
          <span>参数名</span>
          <span>类型</span>
          <span>默认值</span>
          <span className="text-center">可覆盖</span>
          <span />
        </div>
        {purpose.parameters.length === 0 && (
          <p className="px-3 py-5 text-center text-xs text-muted-foreground">
            暂无参数，点击「添加参数」直接新增一行。
          </p>
        )}
        {purpose.parameters.map((param, index) => (
          <div
            key={index}
            className="grid grid-cols-[minmax(0,1fr)_6rem_2rem] items-center gap-2 border-b border-border/50 px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1.2fr)_3rem_2rem]"
          >
            <Input
              autoFocus={param.name.startsWith("parameter_") && index === purpose.parameters.length - 1}
              className="h-8 min-w-0 px-2 font-mono text-xs shadow-none"
              aria-label={`参数 ${index + 1} 名称`}
              value={param.name}
              onChange={(event) => {
                buffers.clear(`${prefix}schema`);
                update(index, { ...param, name: event.currentTarget.value });
              }}
            />
            <Choice
              label={`参数 ${index + 1} 类型`}
              value={param.type}
              options={MODEL_PARAMETER_TYPES.map((value) => ({ value, label: value }))}
              onChange={(type) => {
                buffers.clear(`${prefix}${index}`);
                buffers.clear(`${prefix}schema`);
                const next = {
                  ...param,
                  type,
                  default:
                    type === "string"
                      ? ""
                      : type === "boolean"
                        ? false
                        : type === "array"
                          ? []
                          : type === "object"
                            ? {}
                            : 0,
                };
                delete next.schema;
                update(index, next);
              }}
            />
            <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
              <ParameterValue
                id={`${prefix}${index}`}
                label={`参数 ${index + 1} 默认值`}
                type={param.type}
                value={param.default}
                onChange={(value) => {
                  const next = { ...param };
                  if (value === undefined) delete next.default;
                  else next.default = value;
                  update(index, next);
                }}
              />
            </div>
            <label
              className="col-start-3 row-start-2 flex justify-center sm:col-start-auto sm:row-start-auto"
              title="允许应用覆盖"
            >
              <Checkbox
                aria-label={`允许覆盖 ${param.name}`}
                checked={param.overridable}
                onCheckedChange={(checked) => update(index, { ...param, overridable: checked === true })}
              />
            </label>
            <ConfirmDelete
              title={`删除参数“${param.name}”？`}
              description="此参数的默认值和结构要求将被移除，请同时检查请求模板中的参数引用。"
              onConfirm={() => {
                buffers.removeRow(prefix, index);
                onChange({ ...purpose, parameters: purpose.parameters.filter((_, i) => i !== index) });
              }}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="col-start-3 row-start-1 size-7 text-muted-foreground hover:text-destructive sm:col-start-auto sm:row-start-auto"
                aria-label={`删除参数 ${param.name}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </ConfirmDelete>
          </div>
        ))}
      </div>
      <details className="rounded-lg border border-border/70 p-3">
        <summary className="cursor-pointer text-xs font-medium">参数结构要求 · JSON Schema</summary>
        <div className="pt-3">
          <JsonField
            id={`${prefix}schema`}
            label="参数 Schema"
            objectOnly
            value={Object.fromEntries(
              purpose.parameters
                .filter((param) => param.schema !== undefined)
                .map((param) => [param.name, param.schema]),
            )}
            onChange={(value) => {
              const schemas = value as Record<string, JsonSchema>;
              if (Object.keys(schemas).some((name) => !purpose.parameters.some((param) => param.name === name)))
                throw new Error();
              onChange({
                ...purpose,
                parameters: purpose.parameters.map((param) => {
                  const next = { ...param };
                  if (schemas[param.name] === undefined) delete next.schema;
                  else next.schema = schemas[param.name];
                  return next;
                }),
              });
            }}
            hint={
              '按参数名填写约束，例如 {"n":{"minimum":1,"maximum":9}}。对象和数组可定义 properties、required、items 等。'
            }
          />
        </div>
      </details>
    </div>
  );
}
