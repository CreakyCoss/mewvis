import { useEffect, useMemo, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  inspectStructuredJsonDocument,
  isJsonObject,
  replaceStructuredDocumentData,
  storyDocumentLabel,
} from "../../../documents/model";
import type { JsonValue, StoryJsonDocument } from "../../../documents/types";
import { useStoryState } from "../../use-story-state";
import { GenericJsonValueEditor, MetadataFieldEditor } from "./field-editor";

const pointerKey = (pointer: string) => (pointer.startsWith("/") ? pointer.slice(1) : pointer);

export const StoryDocumentEditor = ({ document }: { document: StoryJsonDocument }) => {
  const saveDocument = useStoryState((state) => state.saveDocument);
  const deleteDocument = useStoryState((state) => state.deleteDocument);
  const isSaving = useStoryState((state) => state.isSaving);
  const [rawText, setRawText] = useState(() => JSON.stringify(document.value, null, 2));
  const [draft, setDraft] = useState<JsonValue>(document.value);
  const [rawError, setRawError] = useState("");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  useEffect(() => {
    setDraft(document.value);
    setRawText(JSON.stringify(document.value, null, 2));
    setRawError("");
  }, [document]);

  const inspected = useMemo(() => inspectStructuredJsonDocument({ ...document, value: draft }), [document, draft]);

  const updateData = (key: string, value: JsonValue) => {
    if (!inspected) return;
    const next = replaceStructuredDocumentData(draft, { ...inspected.data, [key]: value });
    setDraft(next);
    setRawText(JSON.stringify(next, null, 2));
  };

  const updateFriendlyValue = (value: JsonValue) => {
    const next = inspected && isJsonObject(value) ? replaceStructuredDocumentData(draft, value) : value;
    setDraft(next);
    setRawText(JSON.stringify(next, null, 2));
  };

  const parseRaw = () => {
    try {
      const value = JSON.parse(rawText) as JsonValue;
      setDraft(value);
      setRawError("");
      return { valid: true as const, value };
    } catch {
      setRawError("JSON 格式无效，无法保存。");
      return { valid: false as const };
    }
  };

  const save = async () => {
    const result = parseRaw();
    if (!result.valid) return;
    const saved = await saveDocument({ ...document, value: result.value });
    if (saved) toast.success("JSON 已保存。");
  };

  const remove = async () => {
    if (await deleteDocument(document.path)) {
      setIsDeleteOpen(false);
      toast.success("JSON 文件已删除。");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b bg-background px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-semibold">{inspected?.label ?? storyDocumentLabel(document)}</h3>
            {inspected?.kind ? (
              <Badge variant="outline">{inspected.kind}</Badge>
            ) : (
              <Badge variant="secondary">普通 JSON</Badge>
            )}
          </div>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{document.path}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={isSaving} onClick={() => setIsDeleteOpen(true)}>
            <Trash2 className="size-4" />
            删除
          </Button>
          <Button type="button" size="sm" disabled={isSaving} onClick={() => void save()}>
            <Save className="size-4" />
            {isSaving ? "保存中" : "保存"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="form" className="min-h-0 flex-1 gap-0 overflow-hidden">
        <TabsList variant="line" className="mx-5 mt-3 shrink-0">
          <TabsTrigger value="form">友好编辑</TabsTrigger>
          <TabsTrigger value="source">JSON 源码</TabsTrigger>
        </TabsList>
        <TabsContent value="form" className="min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="mx-auto grid w-full max-w-5xl gap-3 p-5">
              {inspected && Object.keys(inspected.fields).length > 0 ? (
                Object.entries(inspected.fields).map(([pointer, field]) => (
                  <MetadataFieldEditor
                    key={pointer}
                    definitions={inspected.definitions}
                    field={field}
                    value={inspected.data[pointerKey(pointer)]}
                    onChange={(value) => updateData(pointerKey(pointer), value)}
                  />
                ))
              ) : (
                <GenericJsonValueEditor value={inspected?.data ?? draft} onChange={updateFriendlyValue} />
              )}
            </div>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="source" className="min-h-0 overflow-hidden">
          <div className="flex h-full flex-col gap-2 p-5">
            <Textarea
              value={rawText}
              className="min-h-0 flex-1 resize-none font-mono text-xs leading-5"
              spellCheck={false}
              onChange={(event) => {
                setRawText(event.currentTarget.value);
                setRawError("");
              }}
              onBlur={() => void parseRaw()}
            />
            {rawError ? <p className="text-xs text-destructive">{rawError}</p> : null}
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 JSON 文件？</AlertDialogTitle>
            <AlertDialogDescription>
              将永久删除 {document.path}。通用编辑器不会自动修复其他文件中的引用。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isSaving}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
