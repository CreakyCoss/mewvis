import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { StoryValue } from "../../../../../../../core/story-project/types";
import {
  isJsonObject,
  type JsonFieldMetadata,
  type JsonObject,
  type JsonObjectDefinition,
} from "../../../story-document";
import { documentPointerKey, fieldDefaultValue } from "../structure";

const inferredEmptyValue = (value: StoryValue | undefined): StoryValue => {
  if (Array.isArray(value)) return [];
  if (isJsonObject(value)) return {};
  if (typeof value === "boolean") return false;
  if (typeof value === "number") return 0;
  return "";
};

const shortSummary = (value: StoryValue, fallback: string) => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (isJsonObject(value)) {
    const first = Object.values(value).find((item) => typeof item === "string" && item.trim());
    if (typeof first === "string") return first;
  }
  return fallback;
};

const GenericObjectEditor = ({
  disabled,
  nested = false,
  onChange,
  value,
}: {
  disabled?: boolean;
  nested?: boolean;
  onChange: (value: JsonObject) => void;
  value: JsonObject;
}) => {
  const [newKey, setNewKey] = useState("");
  const addKey = () => {
    const key = newKey.trim();
    if (!key || key in value) return;
    onChange({ ...value, [key]: "" });
    setNewKey("");
  };

  return (
    <div
      className={
        nested
          ? "rounded-r-xl border-l-2 border-primary/15 bg-surface/30 px-3"
          : "rounded-xl border border-border/65 bg-surface/35 px-3"
      }
    >
      <div className="divide-y divide-border/60">
        {Object.entries(value).map(([key, child]) => (
          <div key={key} className="py-4 first:pt-0 last:pb-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Label className="min-w-0 truncate font-mono text-xs text-muted-foreground">{key}</Label>
              {!disabled ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title={`删除 ${key}`}
                  className="size-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onChange(Object.fromEntries(Object.entries(value).filter(([name]) => name !== key)))}
                >
                  <Trash2 className="size-3" />
                </Button>
              ) : null}
            </div>
            <GenericJsonValueEditor
              nested
              value={child}
              disabled={disabled}
              onChange={(next) => onChange({ ...value, [key]: next })}
            />
          </div>
        ))}
      </div>
      {!disabled ? (
        <div className="flex gap-2 py-4">
          <Input
            value={newKey}
            className="font-mono text-xs"
            placeholder="新增字段名"
            onChange={(event) => setNewKey(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addKey();
              }
            }}
          />
          <Button type="button" variant="outline" disabled={!newKey.trim()} onClick={addKey}>
            <Plus className="size-3.5" />
            字段
          </Button>
        </div>
      ) : null}
    </div>
  );
};

const GenericArrayEditor = ({
  disabled,
  onChange,
  value,
}: {
  disabled?: boolean;
  onChange: (value: StoryValue[]) => void;
  value: StoryValue[];
}) => (
  <div className="space-y-3">
    {value.length > 0 ? (
      <Accordion
        type="multiple"
        defaultValue={value.length === 1 ? ["item-0"] : []}
        className="rounded-xl border border-border/65 bg-card/55 px-3"
      >
        {value.map((item, index) => (
          <AccordionItem key={index} value={`item-${index}`}>
            <AccordionTrigger className="hover:no-underline">
              <span className="min-w-0 truncate">
                <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                {shortSummary(item, `第 ${index + 1} 项`)}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3">
                <GenericJsonValueEditor
                  nested
                  value={item}
                  disabled={disabled}
                  onChange={(next) =>
                    onChange(value.map((current, itemIndex) => (itemIndex === index ? next : current)))
                  }
                />
                {!disabled ? (
                  <Button
                    type="button"
                    size="default"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <Trash2 className="size-3.5" />
                    删除此项
                  </Button>
                ) : null}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    ) : (
      <p className="rounded-xl border border-dashed border-border/70 bg-surface/35 px-3 py-5 text-center text-xs text-muted-foreground">
        暂无内容
      </p>
    )}
    {!disabled ? (
      <Button
        type="button"
        size="default"
        variant="outline"
        onClick={() => onChange([...value, inferredEmptyValue(value.at(-1))])}
      >
        <Plus className="size-3.5" />
        新增一项
      </Button>
    ) : null}
  </div>
);

export const GenericJsonValueEditor = ({
  disabled,
  nested = false,
  onChange,
  value,
}: {
  disabled?: boolean;
  nested?: boolean;
  onChange: (value: StoryValue) => void;
  value: StoryValue;
}) => {
  if (Array.isArray(value)) {
    return <GenericArrayEditor value={value} disabled={disabled} onChange={onChange} />;
  }
  if (isJsonObject(value)) {
    return <GenericObjectEditor nested={nested} value={value} disabled={disabled} onChange={onChange} />;
  }
  if (typeof value === "boolean") {
    return (
      <div className="flex h-9 items-center gap-2">
        <Switch checked={value} disabled={disabled} onCheckedChange={onChange} />
        <span className="text-xs text-muted-foreground">{value ? "已启用" : "未启用"}</span>
      </div>
    );
  }
  if (typeof value === "number") {
    return (
      <Input
        type="number"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    );
  }
  const stringValue = value === null ? "" : value;
  if (stringValue.length > 100 || stringValue.includes("\n")) {
    return (
      <Textarea
        value={stringValue}
        disabled={disabled}
        className="min-h-24"
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  }
  return <Input value={stringValue} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} />;
};

const MetadataObjectEditor = ({
  definition,
  definitions,
  disabled,
  onChange,
  value,
}: {
  definition: JsonObjectDefinition;
  definitions: Record<string, JsonObjectDefinition>;
  disabled: boolean;
  onChange: (value: JsonObject) => void;
  value: JsonObject;
}) => (
  <div className="grid gap-x-5 gap-y-1 border-l-2 border-primary/15 pl-4 md:grid-cols-2">
    {definition.label ? (
      <div className="pb-2 text-xs font-medium text-muted-foreground md:col-span-2">{definition.label}</div>
    ) : null}
    {Object.entries(definition.fields).map(([pointer, field]) => {
      const key = documentPointerKey(pointer);
      const wide = ["textarea", "content", "object", "collection", "string-list", "reference-list"].includes(
        field.type,
      );
      return (
        <div key={pointer} className={wide ? "md:col-span-2" : undefined}>
          <MetadataFieldEditor
            compact
            field={field}
            definitions={definitions}
            disabled={disabled}
            value={value[key]}
            onChange={(next) => onChange({ ...value, [key]: next })}
          />
        </div>
      );
    })}
  </div>
);

const MetadataCollectionEditor = ({
  definition,
  definitions,
  disabled,
  onChange,
  value,
}: {
  definition: JsonObjectDefinition;
  definitions: Record<string, JsonObjectDefinition>;
  disabled: boolean;
  onChange: (value: StoryValue[]) => void;
  value: StoryValue[];
}) => (
  <div className="space-y-3">
    {value.length > 0 ? (
      <Accordion
        type="multiple"
        defaultValue={value.length === 1 ? ["item-0"] : []}
        className="rounded-xl border border-border/65 bg-card/55 px-3"
      >
        {value.map((item, index) => {
          const object = isJsonObject(item) ? item : {};
          return (
            <AccordionItem key={index} value={`item-${index}`}>
              <AccordionTrigger className="hover:no-underline">
                <span className="min-w-0 truncate">
                  <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                  {shortSummary(object, `${definition.label ?? "项目"} ${index + 1}`)}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <MetadataObjectEditor
                  definition={definition}
                  definitions={definitions}
                  disabled={disabled}
                  value={object}
                  onChange={(next) =>
                    onChange(value.map((current, itemIndex) => (itemIndex === index ? next : current)))
                  }
                />
                {!disabled ? (
                  <Button
                    type="button"
                    size="default"
                    variant="ghost"
                    className="mt-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <Trash2 className="size-3.5" />
                    删除此项
                  </Button>
                ) : null}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    ) : (
      <p className="rounded-xl border border-dashed border-border/70 bg-surface/35 px-3 py-5 text-center text-xs text-muted-foreground">
        暂无内容
      </p>
    )}
    {!disabled ? (
      <Button
        type="button"
        size="default"
        variant="outline"
        onClick={() =>
          onChange([
            ...value,
            Object.fromEntries(
              Object.entries(definition.fields).map(([pointer, field]) => [
                documentPointerKey(pointer),
                fieldDefaultValue(field, definitions),
              ]),
            ),
          ])
        }
      >
        <Plus className="size-3.5" />
        新增{definition.label ?? "项目"}
      </Button>
    ) : null}
  </div>
);

const StringListEditor = ({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
  onChange: (value: StoryValue) => void;
  value: string[];
}) => (
  <div className="space-y-2">
    {value.map((item, index) => (
      <div key={index} className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/55 p-2">
        <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
        <Input
          value={item}
          disabled={disabled}
          onChange={(event) =>
            onChange(value.map((current, itemIndex) => (itemIndex === index ? event.currentTarget.value : current)))
          }
        />
        {!disabled ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            title="删除此项"
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
          >
            <Trash2 className="size-3.5" />
          </Button>
        ) : null}
      </div>
    ))}
    {!disabled ? (
      <Button type="button" variant="outline" onClick={() => onChange([...value, ""])}>
        <Plus className="size-3.5" />
        新增一项
      </Button>
    ) : null}
  </div>
);

export const MetadataFieldEditor = ({
  compact = false,
  definitions,
  disabled: parentDisabled = false,
  field,
  onChange,
  value,
}: {
  compact?: boolean;
  definitions: Record<string, JsonObjectDefinition>;
  disabled?: boolean;
  field: JsonFieldMetadata;
  onChange: (value: StoryValue) => void;
  value: StoryValue | undefined;
}) => {
  const disabled =
    parentDisabled || Boolean(field.readOnly || field.generated || field.immutable || field.const !== undefined);
  const actualValue = value ?? fieldDefaultValue(field, definitions);
  const definition = field.definition ? definitions[field.definition] : undefined;
  const itemDefinition = field.itemDefinition ? definitions[field.itemDefinition] : undefined;
  let editor;

  if (field.type === "boolean") {
    const checked = actualValue === true;
    editor = (
      <div className="flex h-9 items-center gap-2">
        <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
        <span className="text-xs text-muted-foreground">{checked ? "已启用" : "未启用"}</span>
      </div>
    );
  } else if (field.type === "enum" && field.options?.length) {
    editor = (
      <Select value={typeof actualValue === "string" ? actualValue : ""} disabled={disabled} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="请选择" />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else if (field.type === "timestamp" && disabled) {
    const timestamp = typeof actualValue === "number" ? actualValue : 0;
    editor = (
      <Input value={timestamp ? new Date(timestamp).toLocaleString("zh-CN", { hour12: false }) : "尚未生成"} disabled />
    );
  } else if (["integer", "number", "timestamp"].includes(field.type)) {
    editor = (
      <Input
        type="number"
        value={typeof actualValue === "number" ? actualValue : ""}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    );
  } else if (["textarea", "content"].includes(field.type)) {
    editor = (
      <Textarea
        value={typeof actualValue === "string" ? actualValue : ""}
        disabled={disabled}
        className={field.type === "content" ? "min-h-64 leading-6" : "min-h-24 leading-6"}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  } else if (["string-list", "reference-list"].includes(field.type)) {
    const items = Array.isArray(actualValue)
      ? actualValue.filter((item): item is string => typeof item === "string")
      : [];
    editor = <StringListEditor value={items} disabled={disabled} onChange={onChange} />;
  } else if (field.type === "object" && definition) {
    editor = (
      <MetadataObjectEditor
        definition={definition}
        definitions={definitions}
        disabled={disabled}
        value={isJsonObject(actualValue) ? actualValue : {}}
        onChange={onChange}
      />
    );
  } else if (field.type === "collection" && itemDefinition) {
    editor = (
      <MetadataCollectionEditor
        definition={itemDefinition}
        definitions={definitions}
        disabled={disabled}
        value={Array.isArray(actualValue) ? actualValue : []}
        onChange={onChange}
      />
    );
  } else if (["text", "reference"].includes(field.type) || typeof actualValue === "string") {
    editor = (
      <Input
        value={typeof actualValue === "string" ? actualValue : ""}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  } else {
    editor = <GenericJsonValueEditor value={actualValue} disabled={disabled} onChange={onChange} />;
  }

  return (
    <div className={compact ? "space-y-2 py-3" : "space-y-2 py-4"}>
      <div className="flex min-w-0 items-center gap-2">
        <Label className="text-sm font-medium">
          {field.label}
          {field.required && !disabled ? <span className="ml-0.5 text-destructive">*</span> : null}
        </Label>
        {disabled ? (
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs leading-4 text-muted-foreground">只读</span>
        ) : null}
      </div>
      {field.description ? <p className="text-xs leading-5 text-muted-foreground">{field.description}</p> : null}
      {editor}
    </div>
  );
};
