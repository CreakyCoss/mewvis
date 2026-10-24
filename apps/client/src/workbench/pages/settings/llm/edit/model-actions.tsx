import { ArrowDown, ArrowUp, Copy, Pencil, Trash2 } from "lucide-react";
import type { ProviderModelConfig } from "@/agent-client/runtime-model";
import { Button } from "design-system/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "design-system/components/ui/tooltip";
import { ConfirmDelete } from "./confirm-delete";

export function ModelActions({
  model,
  index,
  count,
  disabled,
  onEdit,
  onDuplicate,
  onMove,
  onDelete,
  onDeleteCloseAutoFocus,
}: {
  model: ProviderModelConfig;
  index: number;
  count: number;
  disabled: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onDeleteCloseAutoFocus: (event: Event) => void;
}) {
  const name = model.modelName || model.modelId || "未命名模型";
  const actions = [
    { label: "编辑模型", icon: Pencil, onClick: onEdit, disabled, id: `llm-model-${model.id}` },
    { label: "复制模型", icon: Copy, onClick: onDuplicate, disabled },
    {
      label: "上移",
      icon: ArrowUp,
      onClick: () => onMove(-1),
      disabled: disabled || index === 0,
      id: `llm-model-${model.id}-up`,
    },
    {
      label: "下移",
      icon: ArrowDown,
      onClick: () => onMove(1),
      disabled: disabled || index === count - 1,
      id: `llm-model-${model.id}-down`,
    },
  ];

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-0.5" role="group" aria-label={`${name}的操作`}>
        {actions.map(({ label, icon: Icon, ...props }) => (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={`size-7 shrink-0 ${label === "编辑模型" ? "text-primary" : "text-muted-foreground"}`}
                aria-label={`${label} ${name}`}
                {...props}
              >
                <Icon className="size-3.5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
        <span className="ml-1 border-l border-border/70 pl-1">
          <Tooltip>
            <ConfirmDelete
              title={`删除“${name}”？`}
              description="此模型及其全部用途配置将从供应商中移除，更改随供应商配置保存。"
              onConfirm={onDelete}
              onCloseAutoFocus={onDeleteCloseAutoFocus}
            >
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`删除模型 ${name}`}
                  disabled={disabled}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
            </ConfirmDelete>
            <TooltipContent>删除模型</TooltipContent>
          </Tooltip>
        </span>
      </div>
    </TooltipProvider>
  );
}
