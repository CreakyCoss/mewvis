import { useId, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import type { ModelParameter } from "@mewvis/chat-contracts";
import { Button } from "design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "design-system/components/ui/dialog";
import { Label } from "design-system/components/ui/label";
import { Textarea } from "design-system/components/ui/textarea";
import { parseParameterJson } from "./parameter-json";

export function ParameterEditor({
  parameter,
  parameters,
  index,
  onChange,
}: {
  parameter: ModelParameter;
  parameters: ModelParameter[];
  index: number;
  onChange: (parameter: ModelParameter) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          aria-label={`编辑参数 ${parameter.name}`}
          title="编辑参数 JSON"
        >
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      {open && (
        <ParameterJsonDialog
          parameter={parameter}
          parameters={parameters}
          index={index}
          onClose={() => setOpen(false)}
          onConfirm={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      )}
    </Dialog>
  );
}

function ParameterJsonDialog({
  parameter,
  parameters,
  index,
  onClose,
  onConfirm,
}: {
  parameter: ModelParameter;
  parameters: ModelParameter[];
  index: number;
  onClose: () => void;
  onConfirm: (parameter: ModelParameter) => void;
}) {
  const id = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const [raw, setRaw] = useState(() => JSON.stringify(parameter, null, 2));
  const result = parseParameterJson(raw, parameters, index);
  return (
    <DialogContent
      overlayClassName="z-80 bg-overlay/30"
      className="!flex z-90 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[600px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[600px]"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        input.current?.focus();
      }}
    >
      <DialogHeader className="shrink-0 space-y-1 px-4 pt-4 pr-14">
        <div className="flex min-w-0 items-baseline gap-2">
          <DialogTitle className="truncate font-mono text-[13px]">{parameter.name}</DialogTitle>
          <span className="text-[11px] text-muted-foreground">{parameter.type}</span>
        </div>
        <DialogDescription className="sr-only">编辑完整参数定义，结构与预设一致。</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 space-y-2 overflow-y-auto p-4 pt-3">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${id}-json`} className="text-xs font-normal">
            参数 JSON
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-muted-foreground"
            disabled={!result.formatted}
            onClick={() => setRaw(result.formatted!)}
          >
            格式化
          </Button>
        </div>
        <Textarea
          ref={input}
          id={`${id}-json`}
          aria-label={`${parameter.name} 参数 JSON`}
          aria-invalid={!!result.error}
          aria-describedby={result.error ? `${id}-error` : undefined}
          className="field-sizing-fixed max-h-[55dvh] min-h-72 resize-y font-mono text-xs leading-6 shadow-none md:text-xs"
          rows={16}
          wrap="off"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          value={raw}
          onChange={(event) => setRaw(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.stopPropagation();
          }}
        />
        <p className="text-[11px] text-muted-foreground">
          删除 default 表示不设置默认值；askWhenMissing: true 表示缺少时询问用户。
        </p>
        {result.error && (
          <p id={`${id}-error`} className="text-xs text-destructive" role="alert">
            {result.error}
          </p>
        )}
      </div>
      <DialogFooter className="shrink-0 flex-row justify-end border-t border-border/70 px-4 py-3">
        <Button type="button" variant="outline" className="h-8 min-w-16 text-xs shadow-none" onClick={onClose}>
          取消
        </Button>
        <Button
          type="button"
          className="h-8 min-w-16 text-xs shadow-none"
          disabled={!result.parameter}
          onClick={() => {
            if (result.parameter) onConfirm(result.parameter);
          }}
        >
          完成
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
