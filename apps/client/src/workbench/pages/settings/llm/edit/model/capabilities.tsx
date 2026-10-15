import { useId } from "react";
import type { JsonSchema, ModelPurpose } from "@mewvis/chat-contracts";
import { Button } from "design-system/components/ui/button";
import { Checkbox } from "design-system/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "design-system/components/ui/popover";
import { MODEL_MODALITY_OPTIONS } from "../../options";
import { JsonField } from "./fields";

export function PurposeCapabilities({
  purpose,
  onChange,
}: {
  purpose: ModelPurpose;
  onChange: (purpose: ModelPurpose) => void;
}) {
  const id = useId();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" className="h-7 px-0 text-[11px] text-primary hover:bg-transparent">
          编辑能力
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={6}
        collisionPadding={16}
        className="z-80 max-h-[var(--radix-popover-content-available-height)] w-72 max-w-[calc(100vw-2rem)] gap-2.5 overflow-y-auto rounded-lg p-3"
        aria-labelledby={`${id}-title`}
      >
        <h4 id={`${id}-title`} className="text-[11px] leading-4 font-medium">
          用途能力
        </h4>
        {(["input", "output"] as const).map((key) => (
          <fieldset key={key} className="space-y-1">
            <legend className="text-[11px] text-muted-foreground">{key === "input" ? "输入" : "输出"}</legend>
            <div className="grid grid-cols-4 gap-1.5">
              {MODEL_MODALITY_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-1.5 py-0.5 text-[11px] leading-4"
                >
                  <Checkbox
                    className="size-3.5 [&_svg]:size-2.5"
                    checked={purpose[key].includes(option.value)}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...purpose,
                        [key]: checked
                          ? [...purpose[key], option.value]
                          : purpose[key].filter((value) => value !== option.value),
                      })
                    }
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {purpose.type === "chat" && (
          <div className="grid grid-cols-2 gap-2 border-t border-border/60 pt-2">
            {(
              [
                { key: "reasoning", label: "思考" },
                { key: "toolCalling", label: "工具调用" },
              ] as const
            ).map((option) => (
              <label key={option.key} className="flex cursor-pointer items-center gap-1.5 py-0.5 text-[11px] leading-4">
                <Checkbox
                  className="size-3.5 [&_svg]:size-2.5"
                  checked={purpose[option.key] ?? false}
                  onCheckedChange={(checked) => onChange({ ...purpose, [option.key]: checked === true })}
                />
                {option.label}
              </label>
            ))}
          </div>
        )}
        {purpose.adapter === "http-json" && (
          <details className="border-t border-border/60 pt-2">
            <summary className="cursor-pointer text-[11px] text-muted-foreground">输入结构 · JSON Schema</summary>
            <div className="pt-2">
              <JsonField
                id={`${purpose.type}-input-schema`}
                label="输入 Schema"
                optional
                rows={4}
                value={purpose.inputSchema}
                onChange={(inputSchema) => {
                  const next = { ...purpose };
                  if (inputSchema === undefined) delete next.inputSchema;
                  else next.inputSchema = inputSchema as JsonSchema;
                  onChange(next);
                }}
              />
            </div>
          </details>
        )}
      </PopoverContent>
    </Popover>
  );
}
