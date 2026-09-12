import { Loader2, Play, Wrench } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { executeApplicationUiTool, type ApplicationUiApplication, type ApplicationUiTool } from "@/api/apps";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const initialValues = (tool: ApplicationUiTool) =>
  Object.fromEntries(Object.keys(tool.parameters.properties ?? {}).map((name) => [name, ""]));

const toolArguments = (tool: ApplicationUiTool, values: Record<string, string | boolean>) => {
  const result: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(tool.parameters.properties ?? {})) {
    const value = values[name];
    if (value === "" || value === undefined) continue;
    if (schema.type === "integer" || schema.type === "number") {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) throw new Error(`${name} 必须是数字。`);
      result[name] = parsed;
    } else if (schema.type === "boolean") {
      result[name] = Boolean(value);
    } else if (schema.type === "object" || schema.type === "array") {
      result[name] = JSON.parse(String(value));
    } else {
      result[name] = value;
    }
  }
  return result;
};

export const ApplicationToolWorkbench = ({ application }: { application: ApplicationUiApplication }) => {
  const [selectedName, setSelectedName] = useState(application.tools[0]?.name ?? "");
  const selectedTool = useMemo(
    () => application.tools.find((tool) => tool.name === selectedName) ?? application.tools[0],
    [application.tools, selectedName],
  );
  const [values, setValues] = useState<Record<string, string | boolean>>(
    selectedTool ? initialValues(selectedTool) : {},
  );
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<unknown>();

  useEffect(() => {
    setSelectedName(application.tools[0]?.name ?? "");
  }, [application.id, application.tools]);

  useEffect(() => {
    setValues(selectedTool ? initialValues(selectedTool) : {});
    setError("");
    setResult(undefined);
  }, [selectedTool]);

  if (!selectedTool) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/80 bg-card/30 p-8 text-center">
        <Wrench className="size-6 text-muted-foreground" />
        <div>
          <h2 className="font-semibold">没有可交互工具</h2>
          <p className="mt-1 text-sm text-muted-foreground">这个应用可能只提供技能，或依赖尚未兼容的 UI 服务。</p>
        </div>
      </div>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setIsRunning(true);
    setError("");
    try {
      const response = await executeApplicationUiTool(application.id, selectedTool.name, toolArguments(selectedTool, values));
      setResult(response.value);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="grid min-h-0 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav className="space-y-1 rounded-2xl border border-border/70 bg-card/45 p-2" aria-label={`${application.name} 工具`}>
        {application.tools.map((tool) => (
          <button
            key={tool.name}
            type="button"
            className={`min-h-11 w-full rounded-xl px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none ${
              selectedTool.name === tool.name
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
            onClick={() => setSelectedName(tool.name)}
          >
            <span className="block truncate font-mono text-xs font-semibold">{tool.name}</span>
          </button>
        ))}
      </nav>

      <div className="min-w-0 rounded-2xl border border-border/70 bg-card/55 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-mono text-sm font-semibold">{selectedTool.name}</h2>
          <Badge variant="outline">工具</Badge>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{selectedTool.description}</p>

        <form className="mt-5 space-y-4" onSubmit={submit}>
          {Object.entries(selectedTool.parameters.properties ?? {}).map(([name, schema]) => {
            const required = selectedTool.parameters.required?.includes(name) ?? false;
            const id = `application-tool-${selectedTool.name}-${name}`;
            return (
              <div key={name} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor={id}>{name}</Label>
                  {required ? <span className="text-xs text-destructive">必填</span> : null}
                </div>
                {schema.type === "boolean" ? (
                  <div className="flex min-h-11 items-center justify-between rounded-xl border border-border px-3">
                    <span className="text-sm text-muted-foreground">{schema.description || name}</span>
                    <Switch
                      id={id}
                      checked={Boolean(values[name])}
                      onCheckedChange={(checked) => setValues((current) => ({ ...current, [name]: checked }))}
                    />
                  </div>
                ) : schema.type === "object" || schema.type === "array" ? (
                  <Textarea
                    id={id}
                    value={String(values[name] ?? "")}
                    required={required}
                    rows={5}
                    placeholder={schema.type === "array" ? "[]" : "{}"}
                    onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
                  />
                ) : (
                  <Input
                    id={id}
                    value={String(values[name] ?? "")}
                    required={required}
                    type={schema.type === "integer" || schema.type === "number" ? "number" : "text"}
                    onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
                  />
                )}
                {schema.description && schema.type !== "boolean" ? (
                  <p className="text-xs leading-5 text-muted-foreground">{schema.description}</p>
                ) : null}
              </div>
            );
          })}

          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription className="break-words">{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" disabled={isRunning} className="min-h-11">
            {isRunning ? (
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Play className="size-4" />
            )}
            {isRunning ? "正在执行" : "执行工具"}
          </Button>
        </form>

        {result !== undefined ? (
          <div className="mt-5 space-y-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">执行结果</h3>
            <pre className="max-h-96 overflow-auto rounded-xl border border-border/70 bg-muted/45 p-4 text-xs leading-5 whitespace-pre-wrap break-words">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
};
