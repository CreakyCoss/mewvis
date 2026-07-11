import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { isJsonObject } from "../../../documents/model";
import type { JsonFieldMetadata, JsonObject, JsonObjectDefinition, JsonValue } from "../../../documents/types";

const pointerKey = (pointer: string) => (pointer.startsWith("/") ? pointer.slice(1) : pointer);

const cloneJson = (value: JsonValue): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;

const inferredEmptyValue = (value: JsonValue | undefined): JsonValue => {
  if (Array.isArray(value)) return [];
  if (isJsonObject(value)) return {};
  if (typeof value === "boolean") return false;
  if (typeof value === "number") return 0;
  return "";
};

const fieldDefaultValue = (field: JsonFieldMetadata, definitions: Record<string, JsonObjectDefinition>): JsonValue => {
  if (field.const !== undefined) return cloneJson(field.const);
  if (field.default !== undefined) return cloneJson(field.default);
  if (field.type === "boolean") return false;
  if (["integer", "number", "timestamp"].includes(field.type)) return 0;
  if (["string-list", "reference-list", "collection"].includes(field.type)) return [];
  if (field.type === "object") {
    const definition = field.definition ? definitions[field.definition] : undefined;
    return definition
      ? Object.fromEntries(
          Object.entries(definition.fields).map(([pointer, child]) => [
            pointerKey(pointer),
            fieldDefaultValue(child, definitions),
          ]),
        )
      : {};
  }
  return "";
};

const GenericObjectEditor = ({
  disabled,
  onChange,
  value,
}: {
  disabled?: boolean;
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
    <div className="space-y-3 rounded-md border bg-muted/10 p-3">
      {Object.entries(value).map(([key, child]) => (
        <div key={key} className="space-y-2 rounded-md border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="min-w-0 truncate font-mono text-xs">{key}</Label>
            {!disabled ? (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                title={`删除 ${key}`}
                onClick={() => onChange(Object.fromEntries(Object.entries(value).filter(([name]) => name !== key)))}
              >
                <Trash2 className="size-3" />
              </Button>
            ) : null}
          </div>
          <GenericJsonValueEditor
            value={child}
            disabled={disabled}
            onChange={(next) => onChange({ ...value, [key]: next })}
          />
        </div>
      ))}
      {!disabled ? (
        <div className="flex gap-2">
          <Input
            value={newKey}
            className="h-8 font-mono text-xs"
            placeholder="新增字段名"
            onChange={(event) => setNewKey(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addKey();
              }
            }}
          />
          <Button type="button" size="sm" variant="outline" disabled={!newKey.trim()} onClick={addKey}>
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
  onChange: (value: JsonValue[]) => void;
  value: JsonValue[];
}) => (
  <div className="space-y-3 rounded-md border bg-muted/10 p-3">
    {value.map((item, index) => (
      <div key={index} className="space-y-2 rounded-md border bg-background p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">第 {index + 1} 项</span>
          {!disabled ? (
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              title="删除此项"
              onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
            >
              <Trash2 className="size-3" />
            </Button>
          ) : null}
        </div>
        <GenericJsonValueEditor
          value={item}
          disabled={disabled}
          onChange={(next) => onChange(value.map((current, itemIndex) => (itemIndex === index ? next : current)))}
        />
      </div>
    ))}
    {!disabled ? (
      <Button
        type="button"
        size="sm"
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
  onChange,
  value,
}: {
  disabled?: boolean;
  onChange: (value: JsonValue) => void;
  value: JsonValue;
}) => {
  if (Array.isArray(value)) {
    return <GenericArrayEditor value={value} disabled={disabled} onChange={onChange} />;
  }
  if (isJsonObject(value)) {
    return <GenericObjectEditor value={value} disabled={disabled} onChange={onChange} />;
  }
  if (typeof value === "boolean") {
    return <Switch checked={value} disabled={disabled} onCheckedChange={onChange} />;
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
  return (
    <Textarea
      value={value === null ? "" : value}
      disabled={disabled}
      className="min-h-20"
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
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
  <div className="grid gap-3 rounded-md border bg-muted/10 p-3">
    {definition.label ? <div className="text-xs font-semibold text-muted-foreground">{definition.label}</div> : null}
    {Object.entries(definition.fields).map(([pointer, field]) => {
      const key = pointerKey(pointer);
      return (
        <MetadataFieldEditor
          key={pointer}
          compact
          field={field}
          definitions={definitions}
          disabled={disabled}
          value={value[key]}
          onChange={(next) => onChange({ ...value, [key]: next })}
        />
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
  onChange: (value: JsonValue[]) => void;
  value: JsonValue[];
}) => (
  <div className="space-y-3">
    {value.map((item, index) => {
      const object = isJsonObject(item) ? item : {};
      return (
        <div key={index} className="rounded-md border bg-background p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-muted-foreground">
              {definition.label ?? "项目"} {index + 1}
            </span>
            {!disabled ? (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
              >
                <Trash2 className="size-3" />
              </Button>
            ) : null}
          </div>
          <MetadataObjectEditor
            definition={definition}
            definitions={definitions}
            disabled={disabled}
            value={object}
            onChange={(next) => onChange(value.map((current, itemIndex) => (itemIndex === index ? next : current)))}
          />
        </div>
      );
    })}
    {!disabled ? (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          onChange([
            ...value,
            Object.fromEntries(
              Object.entries(definition.fields).map(([pointer, field]) => [
                pointerKey(pointer),
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
  onChange: (value: JsonValue) => void;
  value: JsonValue | undefined;
}) => {
  const disabled = parentDisabled || Boolean(field.readOnly || field.generated);
  const actualValue = value ?? fieldDefaultValue(field, definitions);
  const definition = field.definition ? definitions[field.definition] : undefined;
  const itemDefinition = field.itemDefinition ? definitions[field.itemDefinition] : undefined;
  let editor;

  if (field.type === "boolean") {
    editor = <Switch checked={actualValue === true} disabled={disabled} onCheckedChange={onChange} />;
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
        className={field.type === "content" ? "min-h-64" : "min-h-24"}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  } else if (["string-list", "reference-list"].includes(field.type)) {
    const items = Array.isArray(actualValue)
      ? actualValue.filter((item): item is string => typeof item === "string")
      : [];
    editor = (
      <Textarea
        value={items.join("\n")}
        disabled={disabled}
        className="min-h-24"
        placeholder="每行一项"
        onChange={(event) => onChange(event.currentTarget.value.split("\n").filter((item) => item.trim()))}
      />
    );
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
  } else {
    editor = <GenericJsonValueEditor value={actualValue} disabled={disabled} onChange={onChange} />;
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-2 rounded-lg border bg-background p-4"}>
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-sm font-semibold">{field.label}</Label>
        {field.required ? <Badge variant="secondary">必填</Badge> : null}
        {disabled ? <Badge variant="outline">只读</Badge> : null}
      </div>
      {field.description ? <p className="text-xs leading-5 text-muted-foreground">{field.description}</p> : null}
      {editor}
    </div>
  );
};
