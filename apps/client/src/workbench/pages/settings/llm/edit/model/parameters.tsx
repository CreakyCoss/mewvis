import { Plus, Trash2 } from "lucide-react";
import type { ModelParameter, ModelPurpose } from "@mewvis/chat-contracts";
import { MODEL_PARAMETER_TYPES } from "@mewvis/chat-contracts/model-configuration";
import { Button } from "design-system/components/ui/button";
import { Checkbox } from "design-system/components/ui/checkbox";
import { Input } from "design-system/components/ui/input";
import { Choice, useEditorBuffers } from "./fields";
import { ConfirmDelete } from "../confirm-delete";
import { ParameterEditor } from "./parameter-editor";
import { ParameterDefault } from "./parameter-default";

export function ParametersEditor({
  purpose,
  onChange,
}: {
  purpose: ModelPurpose;
  onChange: (value: ModelPurpose) => void;
}) {
  const buffers = useEditorBuffers();
  const prefix = `${purpose.type}-param-default-`;
  const update = (index: number, next: ModelParameter) =>
    onChange({ ...purpose, parameters: purpose.parameters.map((param, i) => (i === index ? next : param)) });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-medium">可调参数</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">直接设置默认值，通过行末编辑修改参数定义。</p>
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
                { name: `parameter_${i}`, type: "string", description: "", overridable: true },
              ],
            });
          }}
        >
          <Plus className="size-3.5" />
          添加参数
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border border-border/70">
        <div className="hidden grid-cols-[minmax(0,1fr)_6.5rem_minmax(0,1.1fr)_3.5rem_7.5rem_4rem] gap-3 border-b border-border/60 bg-muted/25 px-3 py-2 text-[11px] text-muted-foreground sm:grid">
          <span>参数名</span>
          <span>类型</span>
          <span>默认值</span>
          <span>可覆盖</span>
          <span>缺少时</span>
          <span className="pl-[7px]">操作</span>
        </div>
        {purpose.parameters.length === 0 && (
          <p className="px-3 py-5 text-center text-xs text-muted-foreground">
            暂无参数，点击「添加参数」直接新增一行。
          </p>
        )}
        {purpose.parameters.map((param, index) => (
          <div
            key={index}
            className="grid grid-cols-[minmax(0,1fr)_6.5rem_4rem] items-center gap-2 border-b border-border/50 px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_6.5rem_minmax(0,1.1fr)_3.5rem_7.5rem_4rem] sm:gap-3"
          >
            <Input
              autoFocus={param.name.startsWith("parameter_") && index === purpose.parameters.length - 1}
              className="h-8 min-w-0 px-2 font-mono text-xs shadow-none"
              aria-label={`参数 ${index + 1} 名称`}
              title={(param.description?.trim() ?? "") || undefined}
              value={param.name}
              onChange={(event) => {
                update(index, { ...param, name: event.currentTarget.value });
              }}
            />
            <Choice
              label={`参数 ${index + 1} 类型`}
              value={param.type}
              options={MODEL_PARAMETER_TYPES.map((value) => ({ value, label: value }))}
              onChange={(type) => {
                buffers.clear(`${prefix}${index}`, true);
                update(index, { ...param, type });
              }}
            />
            <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
              <ParameterDefault parameter={param} id={`${prefix}${index}`} onChange={(next) => update(index, next)} />
            </div>
            <label
              className="col-start-3 row-start-2 flex h-8 items-center justify-start sm:col-start-auto sm:row-start-auto"
              title="允许应用覆盖"
            >
              <Checkbox
                aria-label={`允许覆盖 ${param.name}`}
                checked={param.overridable}
                onCheckedChange={(checked) => {
                  const next = { ...param, overridable: checked === true };
                  if (!next.overridable) delete next.askWhenMissing;
                  update(index, next);
                }}
              />
            </label>
            <div
              className="col-span-3 row-start-3 flex min-w-0 items-center gap-2 sm:col-span-1 sm:row-start-auto sm:block"
              title={!param.overridable ? "开启可覆盖后可设置缺少时的处理方式" : undefined}
            >
              <span className="shrink-0 text-[11px] text-muted-foreground sm:hidden">缺少时</span>
              <Choice
                label={`${param.name} 缺少时`}
                value={param.askWhenMissing ? "ask" : "default"}
                disabled={!param.overridable}
                options={[
                  { value: "default", label: "使用默认值" },
                  { value: "ask", label: "缺少时询问" },
                ]}
                onChange={(value) => update(index, { ...param, askWhenMissing: value === "ask" })}
              />
            </div>
            <div className="col-start-3 row-start-1 flex items-center justify-start gap-1 sm:col-start-auto sm:row-start-auto">
              <ParameterEditor
                parameter={param}
                parameters={purpose.parameters}
                index={index}
                onChange={(next) => {
                  buffers.clear(`${prefix}${index}`, true);
                  update(index, next);
                }}
              />
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
                  className="size-7 text-muted-foreground hover:text-destructive"
                  aria-label={`删除参数 ${param.name}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </ConfirmDelete>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
