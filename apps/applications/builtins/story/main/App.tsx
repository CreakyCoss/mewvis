import "./styles.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getApplicationHost } from "@isle/app-sdk/browser";
import { getApplicationDataClient, type ApplicationWorkspace } from "@isle/app-sdk/data";
import { getApplicationChatClient, type ApplicationChatSession } from "@isle/app-sdk/chat";
import { Chat } from "@isle/app-sdk/chat/react";
import type {
  JsonFieldMetadata, JsonObjectDefinition, StoryContext, StoryDocument, StoryDocumentIdentity, StoryOverview,
  StoryProjectCompatibility, StoryProjectStructure, StoryValue,
} from "../shared/project/types";

type StoryType = { id: string; label: string; description: string };
type DocumentSummary = Pick<StoryDocument, "ref" | "displayName" | "updatedAt">;
type Snapshot = {
  status: "empty" | "ready" | "upgrade-available" | "incompatible";
  revision?: number;
  overview?: StoryOverview;
  documents?: DocumentSummary[];
  structure?: StoryProjectStructure;
  compatibility?: StoryProjectCompatibility;
};
type LibraryItem = { workspace: ApplicationWorkspace; snapshot: Snapshot };
type View = "library" | "editor" | "tavern";
type TavernCharacter = {
  id: string; name: string; avatar: string; description: string; speakingStyle: string;
  goals: string; relationshipSummary: string;
};
type TavernStoryContext = { context: StoryContext; characters: TavernCharacter[] };
type TavernConfig = {
  id: string; title: string; scenePresetId: string; replyMode: "director";
  presentation: { profileId: "dialogue-chat" | "third-person-prose" | "novel-prose" };
  systemNarrative: { styleId: "balanced" | "restrained" | "dramatic"; customInstructions: string };
  roomStyleId: "silent-law" | "novel" | "wuxia" | "light-novel" | "dramatic" | "grounded";
  settings: {
    immersiveDescriptionEnabled: boolean; directorMaxSpeakers: number;
    directorLoop: { maxRounds: number };
    directorNarrativeControl: {
      agencyMode: "player_protagonist" | "story_directive" | "scene_drive";
      responseScale: "focused" | "balanced" | "ensemble";
      narratorPressure: "low" | "balanced" | "high";
    };
  };
};
const defaultTavern = (item: LibraryItem): TavernConfig => ({
  id: `tavern-${item.snapshot.overview?.id || item.workspace.id}`,
  title: `${item.snapshot.overview?.title || item.workspace.name} · 酒馆`,
  scenePresetId: "general", replyMode: "director",
  presentation: { profileId: "dialogue-chat" },
  systemNarrative: { styleId: "balanced", customInstructions: "" },
  roomStyleId: "novel",
  settings: {
    immersiveDescriptionEnabled: true, directorMaxSpeakers: 3,
    directorLoop: { maxRounds: 2 },
    directorNarrativeControl: {
      agencyMode: "player_protagonist", responseScale: "balanced", narratorPressure: "balanced",
    },
  },
});
const normalizeTavern = (item: LibraryItem, value: unknown): TavernConfig => {
  const base = defaultTavern(item);
  if (!isObject(value)) return base;
  const config = value as unknown as Partial<TavernConfig>;
  return {
    ...base, ...config,
    presentation: { ...base.presentation, ...config.presentation },
    systemNarrative: { ...base.systemNarrative, ...config.systemNarrative },
    settings: {
      ...base.settings, ...config.settings,
      directorLoop: { ...base.settings.directorLoop, ...config.settings?.directorLoop },
      directorNarrativeControl: { ...base.settings.directorNarrativeControl, ...config.settings?.directorNarrativeControl },
    },
  };
};
const data = () => getApplicationDataClient();
const host = () => getApplicationHost();
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const keyOf = (ref: StoryDocumentIdentity) => JSON.stringify([ref.kind, ref.identity]);
const pointerKey = (pointer: string) => pointer.startsWith("/") ? pointer.slice(1) : pointer;
const isObject = (value: unknown): value is Record<string, StoryValue> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const defaultFor = (field: JsonFieldMetadata, definitions: StoryProjectStructure["schemas"]["objectDefinitions"]): StoryValue => {
  if (field.const !== undefined) return field.const;
  if (field.default !== undefined) return field.default;
  if (field.type === "boolean") return false;
  if (["integer", "number", "timestamp"].includes(field.type)) return 0;
  if (["string-list", "reference-list", "collection"].includes(field.type)) return [];
  if (field.type === "object") {
    const definition = field.definition ? definitions[field.definition] : undefined;
    return definition ? Object.fromEntries(Object.entries(definition.fields)
      .map(([key, child]) => [pointerKey(key), defaultFor(child, definitions)])) : {};
  }
  if (field.type === "enum" && field.options?.[0]) return field.options[0].value;
  return "";
};
const sectionOf = (pointer: string, field: JsonFieldMetadata) => {
  const name = pointerKey(pointer);
  if (field.readOnly || field.generated || field.immutable || field.const !== undefined ||
    /^(kind|id|schemaVersion|documentId|createdAt|updatedAt|version)$/i.test(name)) return "technical";
  if (["object", "collection", "string-list", "reference", "reference-list"].includes(field.type)) return "structured";
  if (["textarea", "content"].includes(field.type)) return "content";
  return "basics";
};
const workspaceArgs = (workspace: ApplicationWorkspace) => ({ workspaceId: workspace.id });
const call = async <T,>(name: string, args: Record<string, unknown> = {}): Promise<T> =>
  (await host().executeTool<T>(name, args)).value;
const openingSessions = new Map<string, Promise<ApplicationChatSession>>();
const openStorySession = (workspace: ApplicationWorkspace, scene: string, prompt: string, createNew = false) => {
  const key = `${workspace.id}:${scene}:${createNew ? "new" : "latest"}`;
  const previous = openingSessions.get(key);
  if (previous) return previous;
  const pending = (async () => {
    const client = getApplicationChatClient();
    const summaries = createNew ? [] : await client.listSessions({ workspaceId: workspace.id });
    const prior = summaries.filter(item => item.sceneId === scene).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const session = prior && !createNew
      ? client.openSession({ workspaceId: workspace.id, chatId: prior.chatId })
      : client.createSession({
          workspaceId: workspace.id, sceneId: scene,
          profile: {
            id: "isle-story-workbench-v1",
            systemPrompt: [
              "你是 Isle 故事创作助手。请用中文交流，尊重项目已有设定和用户的写作要求。",
              `当前应用工作区：workspaceId=${workspace.id}。`,
              "处理写作、拆解、导入、审稿或去 AI 味任务时，必须先调用 isle_story_skill 加载 story-assistant，再按路由加载对应子技能。",
              "技能中的 story 调用必须始终带上当前 workspaceId。结构化变更优先使用 story 的 ChangeSet 协议提交。",
            ].join("\n"),
            context: { runtimeInstruction: prompt },
            useKnowledge: true,
          },
        });
    const opened = await session;
    if (prior && !createNew) await opened.setContext({ runtimeInstruction: prompt });
    return opened;
  })().finally(() => openingSessions.delete(key));
  openingSessions.set(key, pending);
  return pending;
};

function Button({ children, onClick, variant = "secondary", disabled = false, title }: {
  children: React.ReactNode; onClick(): void; variant?: "primary" | "secondary" | "quiet" | "danger";
  disabled?: boolean; title?: string;
}) {
  return <button type="button" className={`story-button story-button-${variant}`} onClick={onClick} disabled={disabled} title={title}>{children}</button>;
}

function Dialog({ title, close, children }: { title: string; close(): void; children: React.ReactNode }) {
  return <div className="story-dialog-backdrop" role="presentation" onMouseDown={close}>
    <section className="story-dialog" role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()}>
      <header><h2>{title}</h2><button type="button" onClick={close} aria-label="关闭">×</button></header>
      {children}
    </section>
  </div>;
}

function ChatPane({ workspace, scene, prompt, onClose, closeLabel = "关闭", allowNewSession = false, revision, status }: {
  workspace: ApplicationWorkspace; scene: string; prompt: string; onClose(): void; closeLabel?: string;
  allowNewSession?: boolean; revision?: number; status?: string;
}) {
  const [session, setSession] = useState<ApplicationChatSession | null>(null);
  const [error, setError] = useState("");
  const [sessionGeneration, setSessionGeneration] = useState(0);
  useEffect(() => {
    let alive = true;
    setSession(null);
    setError("");
    void (async () => {
      try {
        const opened = await openStorySession(workspace, scene, prompt, sessionGeneration > 0);
        if (alive) setSession(opened);
      } catch (cause) {
        if (alive) setError(errorMessage(cause));
      }
    })();
    return () => { alive = false; };
  }, [workspace.id, scene, prompt, sessionGeneration]);
  return <section className="story-chat-pane">
    <header><div><span className="story-eyebrow">创作助手</span><h2>{scene.startsWith("tavern") ? "章节酒馆" : "故事助手"}</h2>
      {(status || !scene.startsWith("tavern")) && <small className="story-chat-status">{status || `结构化技能 · 校验后落库${revision === undefined ? "" : ` · revision ${revision}`}`}</small>}</div>
      <div className="story-actions">{allowNewSession && <Button onClick={() => setSessionGeneration(value => value + 1)} disabled={!session}>＋ 新建会话</Button>}
        <Button onClick={onClose} variant="quiet">{closeLabel}</Button></div></header>
    {session ? <div className="story-chat-body"><Chat session={session} viewId={scene} /></div> : <div className="story-empty"><Chat.Loading error={error || undefined} /></div>}
  </section>;
}

function Field({ name, field, value, definitions, update }: {
  name: string; field: JsonFieldMetadata; value: StoryValue | undefined;
  definitions: Readonly<Record<string, JsonObjectDefinition>>; update(value: StoryValue): void;
}) {
  const [raw, setRaw] = useState(() => JSON.stringify(value ?? field.default ?? null, null, 2));
  const [rawError, setRawError] = useState("");
  useEffect(() => { setRaw(JSON.stringify(value ?? field.default ?? null, null, 2)); }, [value, field.default]);
  const locked = !!(field.readOnly || field.immutable || field.generated || field.const !== undefined);
  const complex = Array.isArray(value) || isObject(value) || ["object", "collection", "string-list", "reference-list"].includes(field.type);
  const objectDefinition = field.definition ? definitions[field.definition] : undefined;
  const itemDefinition = field.itemDefinition ? definitions[field.itemDefinition] : undefined;
  const label = <><span>{field.label || name}{field.required && <em> *</em>}</span>
    {field.description && <small>{field.description}</small>}</>;
  if (objectDefinition) {
    const object = isObject(value) ? value : {};
    return <div className="story-field story-complex-field">{label}<div className="story-nested-fields">
      {Object.entries(objectDefinition.fields).map(([childName, child]) => <Field key={childName} name={childName}
        field={child} definitions={definitions} value={object[pointerKey(childName)]}
        update={next => update({ ...object, [pointerKey(childName)]: next })} />)}
    </div></div>;
  }
  if (itemDefinition) {
    const items = Array.isArray(value) ? value : [];
    return <div className="story-field story-complex-field">{label}<div className="story-collection">
      {items.map((item, index) => {
        const object = isObject(item) ? item : {};
        return <section className="story-collection-item" key={index}><header><strong>第 {index + 1} 项</strong>
          {!locked && <Button variant="danger" onClick={() => update(items.filter((_, itemIndex) => itemIndex !== index))}>删除此项</Button>}</header>
          <div className="story-nested-fields">{Object.entries(itemDefinition.fields).map(([childName, child]) =>
            <Field key={childName} name={childName} field={child} definitions={definitions}
              value={object[pointerKey(childName)]} update={next => update(items.map((current, itemIndex) =>
                itemIndex === index ? { ...object, [pointerKey(childName)]: next } : current))} />)}</div></section>;
      })}
      {!items.length && <small className="story-collection-empty">暂无内容</small>}
      {!locked && <Button onClick={() => update([...items, Object.fromEntries(Object.entries(itemDefinition.fields)
        .map(([childName, child]) => [pointerKey(childName), defaultFor(child, definitions)]))])}>＋ 新增一项</Button>}
    </div></div>;
  }
  if (["string-list", "reference-list"].includes(field.type)) {
    const items = Array.isArray(value) ? value.map(item => String(item ?? "")) : [];
    return <div className="story-field story-complex-field">{label}<div className="story-list-editor">
      {items.map((item, index) => <div className="story-list-row" key={index}><input value={item} disabled={locked}
        onChange={event => update(items.map((current, itemIndex) => itemIndex === index ? event.target.value : current))} />
        {!locked && <Button variant="danger" onClick={() => update(items.filter((_, itemIndex) => itemIndex !== index))}>删除</Button>}</div>)}
      {!locked && <Button onClick={() => update([...items, ""])}>＋ 新增一项</Button>}
    </div></div>;
  }
  return <label className="story-field">{label}
    {field.options?.length ? <select disabled={locked} value={String(value ?? "")} onChange={event => update(event.target.value)}>
      <option value="">请选择</option>
      {field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select> : typeof value === "boolean" || field.type === "boolean"
      ? <input type="checkbox" checked={Boolean(value)} disabled={locked} onChange={event => update(event.target.checked)} />
      : complex
        ? <textarea rows={Math.max(5, Math.min(12, raw.split("\n").length + 1))} disabled={locked} value={raw}
            onChange={event => setRaw(event.target.value)}
            onBlur={() => { try { update(JSON.parse(raw) as StoryValue); setRawError(""); } catch { setRawError("JSON 格式无效，请修正后再保存。"); } }} />
        : typeof value === "number" || ["number", "integer"].includes(field.type)
          ? <input type="number" disabled={locked} value={Number(value ?? 0)} onChange={event => update(Number(event.target.value))} />
          : pointerKey(name) === "content" || ["textarea", "content"].includes(field.type) || String(value ?? "").length > 160
            ? <textarea rows={10} disabled={locked} value={String(value ?? "")} onChange={event => update(event.target.value)} />
            : <input type="text" disabled={locked} value={String(value ?? "")} onChange={event => update(event.target.value)} />}
    {rawError && <small className="story-field-error" role="alert">{rawError}</small>}
  </label>;
}

function DocumentEditor({ document, structure, save, remove, busy, onDirtyChange }: {
  document: StoryDocument; structure: StoryProjectStructure;
  save(ref: StoryDocumentIdentity, value: StoryValue): void; remove(ref: StoryDocumentIdentity): void; busy: boolean;
  onDirtyChange(dirty: boolean): void;
}) {
  const [draft, setDraft] = useState<StoryValue>(document.value);
  const [raw, setRaw] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rawError, setRawError] = useState("");
  const [tab, setTab] = useState<"basics" | "content" | "structured" | "technical" | "raw">("basics");
  useEffect(() => { setDraft(document.value); setRaw(JSON.stringify(document.value, null, 2)); setTab("basics"); }, [document]);
  const schema = document.definition ?? {
    kind: document.ref.kind, label: document.displayName,
    contentFormat: structure.schemas.documents[document.ref.kind]?.contentFormat ?? "structured",
    fields: structure.schemas.documents[document.ref.kind]?.fields ?? {},
    definitions: structure.schemas.objectDefinitions,
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(document.value);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const setField = (name: string, value: StoryValue) => setDraft(previous => ({ ...(isObject(previous) ? previous : {}), [pointerKey(name)]: value }));
  const fields = Object.entries(schema.fields);
  const visible = fields.filter(([name, field]) => sectionOf(name, field) === tab);
  return <main className="story-document-editor">
    <header className="story-document-header"><div><span className="story-eyebrow">{schema.label}</span><h2>{document.displayName}</h2></div>
      <div className="story-actions"><Button onClick={() => setConfirmDelete(true)} variant="danger" disabled={busy} title="删除此文档">删除</Button>
      <Button onClick={() => save(document.ref, draft)} variant="primary" disabled={busy || !dirty}>保存更改</Button></div></header>
    <div className="story-tabs" role="tablist">
      {(["basics", "content", "structured", "technical", "raw"] as const).map(item =>
        <button type="button" key={item} role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""}
          onClick={() => { if (item === "raw") setRaw(JSON.stringify(draft, null, 2)); setRawError(""); setTab(item); }}>{({
            basics: "基本信息", content: "主要内容", structured: "列表与关系",
            technical: "技术信息", raw: "原始数据",
          } as const)[item]}</button>)}
    </div>
    <div className="story-fields">
      {tab === "raw" ? <label className="story-field"><span>JSON</span><textarea rows={24} value={raw}
        onChange={event => setRaw(event.target.value)}
        onBlur={() => { try { setDraft(JSON.parse(raw) as StoryValue); setRawError(""); } catch { setRawError("JSON 格式无效，请修正后再保存。"); } }} />
        <small>离开输入框后解析为文档数据。</small></label>
        : visible.length ? visible.map(([name, field]) => <Field key={name} name={name} field={field}
          definitions={schema.definitions} value={isObject(draft) ? draft[pointerKey(name)] : undefined} update={value => setField(name, value)} />)
          : <div className="story-empty">这里没有可编辑字段。</div>}
      {rawError && <div className="story-alert" role="alert">{rawError}</div>}
    </div>
    {confirmDelete && <Dialog title="删除故事文档" close={() => setConfirmDelete(false)}>
      <div className="story-dialog-content"><p className="story-hint">确定删除「{document.displayName}」？这份文档会从故事项目中移除。</p></div>
      <footer><Button onClick={() => setConfirmDelete(false)}>取消</Button>
        <Button onClick={() => { setConfirmDelete(false); remove(document.ref); }} variant="danger">删除文档</Button></footer>
    </Dialog>}
  </main>;
}

function AddDocument({ structure, documents, close, save, busy }: {
  structure: StoryProjectStructure; documents: DocumentSummary[]; close(): void;
  save(ref: StoryDocumentIdentity, value: StoryValue): void; busy: boolean;
}) {
  const kinds = Object.entries(structure.schemas.documents).filter(([kind, schema]) =>
    kind !== structure.storyType.manifestKind && kind !== structure.roles.import &&
    (schema.cardinality === "many" || !documents.some(document => document.ref.kind === kind)));
  const [kind, setKind] = useState(kinds[0]?.[0] ?? "");
  const [identity, setIdentity] = useState<Record<string, string>>({});
  const [value, setValue] = useState<Record<string, StoryValue>>({});
  useEffect(() => {
    const schema = structure.schemas.documents[kind];
    if (!schema) return;
    setIdentity(Object.fromEntries(schema.identityFields.map(field => [field, field === "id" ? crypto.randomUUID() : ""])));
    setValue(Object.fromEntries(Object.entries(schema.fields)
      .map(([name, field]) => [pointerKey(name), defaultFor(field, structure.schemas.objectDefinitions)])));
  }, [kind, structure]);
  const schema = structure.schemas.documents[kind];
  return <Dialog title="新建故事文档" close={close}><div className="story-dialog-content">
    <label className="story-field"><span>文档类型</span><select value={kind} onChange={event => setKind(event.target.value)}>
      {kinds.map(([id, item]) => <option value={id} key={id}>{item.label}</option>)}
    </select></label>
    {schema?.identityFields.filter(field => field !== "id").map(field =>
      <label className="story-field" key={field}><span>{schema.fields[`/${field}`]?.label || schema.fields[field]?.label || field}</span>
        <input value={identity[field] ?? ""} onChange={event => setIdentity(previous => ({ ...previous, [field]: event.target.value }))} /></label>)}
    {schema && Object.entries(schema.fields).filter(([name, field]) => !schema.identityFields.includes(pointerKey(name)) && !field.generated && !field.readOnly && !field.immutable)
      .map(([name, field]) => <Field key={name} name={name} field={field} definitions={structure.schemas.objectDefinitions} value={value[pointerKey(name)]}
        update={next => setValue(previous => ({ ...previous, [pointerKey(name)]: next }))} />)}
  </div><footer><Button onClick={close}>取消</Button><Button variant="primary" disabled={!kind || busy || schema?.identityFields.some(field => !identity[field]?.trim())}
    onClick={() => save({ kind, identity }, { ...value, ...identity })}>创建文档</Button></footer></Dialog>;
}

function Editor({ item, update, back, tavern }: {
  item: LibraryItem; update(snapshot: Snapshot): void; back(): void; tavern(): void;
}) {
  const { workspace } = item;
  const snapshot = item.snapshot;
  const documents = snapshot.documents ?? [];
  const structure = snapshot.structure;
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [assistant, setAssistant] = useState(false);
  const [documentDirty, setDocumentDirty] = useState(false);
  const [pendingSelected, setPendingSelected] = useState("");
  const [activeDocument, setActiveDocument] = useState<StoryDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reportDirty = useCallback((dirty: boolean) => setDocumentDirty(dirty), []);
  const chooseDocument = (key: string) => {
    if (key === selected) return;
    if (documentDirty) setPendingSelected(key);
    else setSelected(key);
  };
  useEffect(() => { if (!documents.some(doc => keyOf(doc.ref) === selected)) setSelected(documents[0] ? keyOf(documents[0].ref) : ""); }, [documents, selected]);
  const active = documents.find(doc => keyOf(doc.ref) === selected);
  useEffect(() => {
    let alive = true;
    setActiveDocument(null);
    if (active) {
      void call<{ document: StoryDocument }>("isle_story_get_document", { ...workspaceArgs(workspace), ref: active.ref })
        .then(result => { if (alive) setActiveDocument(result.document); })
        .catch(cause => { if (alive) setError(errorMessage(cause)); });
    }
    return () => { alive = false; };
  }, [selected, active?.updatedAt, workspace.id]);
  const groups = useMemo(() => {
    const result = new Map<string, DocumentSummary[]>();
    for (const document of documents.filter((doc: DocumentSummary) =>
      !search || (doc.displayName + doc.ref.kind).toLowerCase().includes(search.toLowerCase()))) {
      const group = structure?.documents[document.ref.kind]?.label ?? document.ref.kind;
      result.set(group, [...(result.get(group) ?? []), document]);
    }
    return [...result];
  }, [documents, search, structure]);
  const mutate = async (tool: string, args: Record<string, unknown>, after?: (next: Snapshot) => void) => {
    setBusy(true); setError("");
    try { const next = await call<Snapshot>(tool, { ...workspaceArgs(workspace), ...args }); update(next); after?.(next); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  return <div className="story-workbench">
    <header className="story-topbar"><div className="story-heading"><Button onClick={back} variant="quiet">← 故事列表</Button>
      <div><span className="story-eyebrow">{structure?.storyType.label || "故事项目"}</span><h1>{snapshot.overview?.title || workspace.name}</h1></div></div>
      <div className="story-actions"><Button onClick={() => void mutate("isle_story_inspect", {})} disabled={busy}>刷新</Button>
        <Button onClick={() => setAssistant(true)}>故事助手</Button><Button onClick={tavern} variant="primary">章节酒馆</Button></div></header>
    {error && <div className="story-alert">{error}</div>}
    <div className="story-editor-layout">
      <aside className="story-sidebar">
        <div className="story-sidebar-head"><h2>项目文档</h2><Button onClick={() => setAddOpen(true)} disabled={!structure} variant="quiet">＋</Button></div>
        <input className="story-search" placeholder="搜索人物、章节、设定…" value={search} onChange={event => setSearch(event.target.value)} />
        <nav>{groups.map(([group, entries]) => <section key={group} className="story-nav-group">
          <button type="button" className="story-group-button" onClick={() => setCollapsed(previous => previous.includes(group) ? previous.filter(item => item !== group) : [...previous, group])}>
            <span>{collapsed.includes(group) ? "▸" : "▾"} {group}</span><small>{entries.length}</small></button>
          {!collapsed.includes(group) && entries.map(document => <button type="button" key={keyOf(document.ref)}
            className={`story-nav-item ${selected === keyOf(document.ref) ? "active" : ""}`} onClick={() => chooseDocument(keyOf(document.ref))}>
            <span>◇</span>{document.displayName}</button>)}</section>)}</nav>
      </aside>
      {active && activeDocument && structure ? <DocumentEditor key={keyOf(active.ref)} document={activeDocument} structure={structure} busy={busy}
        save={(ref, value) => void mutate("isle_story_save_document", { ref, value })}
        remove={ref => void mutate("isle_story_remove_document", { ref })} onDirtyChange={reportDirty} />
        : <div className="story-empty story-editor-empty">{active ? "正在读取文档…" : "选择一份文档开始编辑。"}</div>}
    </div>
    {addOpen && structure && <AddDocument structure={structure} documents={documents} close={() => setAddOpen(false)} busy={busy}
      save={(ref, value) => void mutate("isle_story_save_document", { ref, value }, next => {
        setSelected(keyOf(ref)); setAddOpen(false);
      })} />}
    {assistant && <div className="story-chat-overlay" role="dialog" aria-modal="true" aria-label="故事助手">
      <ChatPane workspace={workspace} scene="story-assistant"
        prompt="先阅读当前项目上下文，再和作者协作。需要修改项目文件时请遵守已有故事结构。"
        onClose={() => { setAssistant(false); void mutate("isle_story_inspect", {}); }} closeLabel="返回编辑器"
        allowNewSession revision={snapshot.revision} />
    </div>}
    {pendingSelected && <Dialog title="放弃未保存更改？" close={() => setPendingSelected("")}>
      <div className="story-dialog-content"><p className="story-hint">当前文档还有未保存的更改。切换文档会丢弃这些更改。</p></div>
      <footer><Button onClick={() => setPendingSelected("")}>继续编辑</Button>
        <Button variant="danger" onClick={() => { setDocumentDirty(false); setSelected(pendingSelected); setPendingSelected(""); }}>放弃并切换</Button></footer>
    </Dialog>}
  </div>;
}

const tavernPresentationPrompt = (profile: TavernConfig["presentation"]["profileId"]) => ({
  "dialogue-chat": [
    "以直接对白和少量可观察动作回应，保留聊天式现场感。",
    "每个发言角色使用三级标题“### 角色名”，旁白使用“### 旁白”；不要输出角色名冒号剧本。",
    "每位角色至少带来一条新信息、态度变化或可继续的行动，不用纯气氛代替回应。",
  ],
  "third-person-prose": [
    "以第三人称有限视角推进，用间接叙事表达动作、心理压力和选择。",
    "不要输出聊天记录、角色名冒号或第一人称自述；写成可连续阅读的短段落。",
  ],
  "novel-prose": [
    "以第三人称小说正文呈现，允许自然对白，写成 2 到 5 个短自然段。",
    "动作、对白、环境变化和反应压力分段呈现，不输出字段、标签或选择菜单。",
  ],
}[profile]);

const tavernStylePrompt = (style: TavernConfig["roomStyleId"]) => ({
  "silent-law": "克制、连续，严格保持视角、关系阶段与用户选择权。",
  novel: "重视镜头、氛围和多轮承接，允许铺陈，但每轮都要发生可见推进。",
  wuxia: "突出江湖气、身份分寸、门派恩怨和招式代价，不随意新增秘闻。",
  "light-novel": "对话轻快、反应鲜明，可以有小动作和吐槽，但不破坏人物边界。",
  dramatic: "强化立场碰撞、信息增量和选择压力，冲突必须来自既有人设与事实。",
  grounded: "写实克制，减少夸张修辞，使用自然对白、清楚行动和明确因果。",
}[style]);

const tavernNarrativePrompt = (style: TavernConfig["systemNarrative"]["styleId"]) => ({
  balanced: "兼顾现场推进、角色承接、可读密度和用户选择空间，不急于闭环。",
  restrained: "降低戏剧化和修辞密度，让张力留在行为、停顿和未说尽的对白里。",
  dramatic: "每轮至少产生一个可观察的张力变化、立场碰撞或信息增量，但不替用户完成关键决定。",
}[style]);

const buildTavernPrompt = (chapter: DocumentSummary, config: TavernConfig, story: TavernStoryContext) => [
  "你正在主持 Isle 章节酒馆。你同时承担导演调度与被调度角色的演绎，但不要向用户展示调度过程。",
  `当前章节：${chapter.displayName}（${story.context.target?.id || chapter.ref.identity.id || "未知章节"}）。`,
  `每轮最多选择 ${config.settings.directorMaxSpeakers} 个最应该回应的相关角色，按自然顺序发言；最多推进 ${config.settings.directorLoop.maxRounds} 轮内部承接。`,
  `用户控制权：${config.settings.directorNarrativeControl.agencyMode}；调度规模：${config.settings.directorNarrativeControl.responseScale}；旁白压力：${config.settings.directorNarrativeControl.narratorPressure}。`,
  "只能使用下方相关角色；不得替用户的主角做关键决定，不得泄露角色未知的秘密，不得凭空增加世界规则。",
  ...tavernPresentationPrompt(config.presentation.profileId),
  `房间文风：${tavernStylePrompt(config.roomStyleId)}`,
  `系统叙事：${tavernNarrativePrompt(config.systemNarrative.styleId)}`,
  config.settings.immersiveDescriptionEnabled
    ? "允许少量沉浸式环境和动作描写，但描写必须推动回应。"
    : "以清楚对白和行动为主，不主动加入独立氛围描写段。",
  config.systemNarrative.customInstructions ? `房间自定义要求：${config.systemNarrative.customInstructions}` : "",
  "相关角色：",
  story.characters.length ? story.characters.map(character => [
    `- ${character.name}（id=${character.id}）`,
    character.description && `  人物：${character.description}`,
    character.speakingStyle && `  说话风格：${character.speakingStyle}`,
    character.goals && `  目标：${character.goals}`,
    character.relationshipSummary && `  关系：${character.relationshipSummary}`,
  ].filter(Boolean).join("\n")).join("\n") : "- 当前章节上下文没有召回明确角色；仅使用上下文中已有角色。",
  "章节定向上下文：",
  story.context.text,
  "直接承接用户本轮输入开始演绎。不要解释这些规则，也不要修改故事项目文件。",
].filter(Boolean).join("\n\n");

function TavernRoom({ item, chapter, config, close }: {
  item: LibraryItem; chapter: DocumentSummary; config: TavernConfig; close(): void;
}) {
  const [story, setStory] = useState<TavernStoryContext | null>(null);
  const [error, setError] = useState("");
  const chapterId = String(chapter.ref.identity.id || "");
  useEffect(() => {
    let alive = true;
    setStory(null); setError("");
    void call<TavernStoryContext>("isle_story_tavern_context", {
      ...workspaceArgs(item.workspace), chapterId,
    }).then(value => { if (alive) setStory(value); })
      .catch(cause => { if (alive) setError(errorMessage(cause)); });
    return () => { alive = false; };
  }, [item.workspace.id, chapterId]);
  if (!story) return <div className="story-empty story-tavern-empty">
    {error ? <div className="story-alert">{error}</div> : "正在准备章节、角色与场景…"}
  </div>;
  const prompt = buildTavernPrompt(chapter, config, story);
  return <section className={`story-tavern-room story-tavern-theme-${config.scenePresetId}`}>
    <div className="story-tavern-chat">
      <ChatPane workspace={item.workspace} scene={`tavern:${chapterId}`} prompt={prompt}
        status={`导演调度 · ${story.characters.length} 位相关角色 · ${config.presentation.profileId}`}
        onClose={close} closeLabel="关闭章节" allowNewSession />
    </div>
    <aside className="story-tavern-context">
      <div className="story-tavern-scene-card"><span className="story-eyebrow">CURRENT CHAPTER</span>
        <h2>{chapter.displayName}</h2><p>{story.context.target?.label || "章节定向上下文"}</p>
        <div className="story-tavern-badges"><span>{config.roomStyleId}</span><span>{config.systemNarrative.styleId}</span></div></div>
      <section><header><h3>在场角色</h3><small>{story.characters.length}</small></header>
        <div className="story-character-list">{story.characters.length ? story.characters.map(character =>
          <article className="story-character-card" key={character.id} title={character.description}>
            <div className="story-character-avatar">{character.name.slice(0, 1)}</div>
            <div><strong>{character.name}</strong><small>{character.speakingStyle || character.description || "跟随故事设定"}</small></div>
          </article>) : <p className="story-hint">这一章尚未关联明确角色。</p>}</div></section>
      <details className="story-context-details"><summary>本章故事上下文</summary>
        <div>{story.context.sections.map(section => <section key={section.id}><h4>{section.label}</h4><p>{section.content}</p></section>)}</div>
      </details>
    </aside>
  </section>;
}

function Tavern({ item, back, editor }: {
  item: LibraryItem; back(): void; editor(): void;
}) {
  const chapters = (item.snapshot.documents ?? []).filter(doc => doc.ref.kind === "story-chapter-plan");
  const [chapter, setChapter] = useState("");
  const [mode, setMode] = useState<"manage" | "room">("manage");
  const [tab, setTab] = useState<"basic" | "prompt" | "settings">("basic");
  const [config, setConfig] = useState<TavernConfig>(() => defaultTavern(item));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void call<{ config: unknown }>("isle_story_tavern_read", workspaceArgs(item.workspace))
      .then(result => { if (alive) setConfig(normalizeTavern(item, result.config)); })
      .catch(cause => { if (alive) setError(errorMessage(cause)); });
    return () => { alive = false; };
  }, [item.workspace.id]);
  const selected = chapters.find(doc => keyOf(doc.ref) === chapter);
  const save = async () => {
    setBusy(true); setError("");
    try {
      const result = await call<{ config: TavernConfig }>("isle_story_tavern_save",
        { ...workspaceArgs(item.workspace), config });
      setConfig(result.config);
      return true;
    } catch (cause) { setError(errorMessage(cause)); return false; }
    finally { setBusy(false); }
  };
  const select = (value: string, options: readonly { value: string; label: string }[], change: (value: string) => void) =>
    <select value={value} onChange={event => change(event.target.value)}>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>;
  const option = (value: string, label: string) => ({ value, label });
  return <div className="story-workbench">
    <header className="story-topbar"><div className="story-heading"><Button onClick={back} variant="quiet">← 故事列表</Button>
      <div><span className="story-eyebrow">{item.snapshot.overview?.title}</span><h1>{mode === "manage" ? config.title : "章节酒馆"}</h1></div></div>
      <div className="story-actions"><Button onClick={editor}>编辑项目</Button>
        {mode === "room" && <Button onClick={() => setMode("manage")}>酒馆配置</Button>}
        {mode === "manage" ? <><Button onClick={() => void save()} disabled={busy}>保存配置</Button>
          <Button onClick={() => { void save().then(ok => { if (ok) setMode("room"); }); }} variant="primary" disabled={busy}>进入酒馆</Button></> : null}</div></header>
    {error && <div className="story-alert">{error}</div>}
    {mode === "manage" ? <div className="story-tavern-layout">
      <aside className="story-sidebar"><div className="story-sidebar-head"><h2>故事酒馆配置</h2></div>
        <nav>{([
          ["basic", "基础", "标题、视觉和发言方式"],
          ["prompt", "呈现与叙事", "呈现规则、系统叙事和文风"],
          ["settings", "运行设置", "模型和执行策略"],
        ] as const).map(([id, label, hint]) => <button type="button" key={id}
          className={`story-nav-item ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
          <span>✦</span><span>{label}<small className="story-nav-hint">{hint}</small></span></button>)}</nav>
      </aside>
      <main className="story-document-editor story-tavern-settings"><span className="story-eyebrow">章节酒馆</span>
        <h2>{tab === "basic" ? "基础" : tab === "prompt" ? "呈现与叙事" : "运行设置"}</h2>
        <div className="story-fields">
          {tab === "basic" ? <>
            <label className="story-field"><span>房间名称</span><input value={config.title}
              onChange={event => setConfig(previous => ({ ...previous, title: event.target.value }))} /></label>
            <label className="story-field"><span>场景设置</span>{select(config.scenePresetId,
              [option("general", "通用"), option("wuxia", "武侠"), option("tavern", "酒馆"),
                option("modern", "现代"), option("mystery", "悬疑"), option("scifi", "科幻"),
                option("fantasy", "奇幻"), option("oracle", "占卜")],
              value => setConfig(previous => ({ ...previous, scenePresetId: value })))}</label>
            <label className="story-field"><span>发言模式</span>{select(config.replyMode,
              [option("director", "导演调度")], () => {})}</label>
          </> : tab === "prompt" ? <>
            <label className="story-field"><span>呈现规则</span>{select(config.presentation.profileId,
              [option("dialogue-chat", "对话聊天"), option("third-person-prose", "第三人称叙事"), option("novel-prose", "小说段落")],
              value => setConfig(previous => ({ ...previous, presentation: { profileId: value as TavernConfig["presentation"]["profileId"] } })))}</label>
            <label className="story-field"><span>系统叙事</span>{select(config.systemNarrative.styleId,
              [option("balanced", "均衡"), option("restrained", "克制"), option("dramatic", "戏剧性")],
              value => setConfig(previous => ({ ...previous, systemNarrative: { ...previous.systemNarrative, styleId: value as TavernConfig["systemNarrative"]["styleId"] } })))}</label>
            <label className="story-field"><span>房间文风</span>{select(config.roomStyleId,
              [option("novel", "小说"), option("silent-law", "沉默法则"), option("wuxia", "武侠"), option("light-novel", "轻小说"), option("dramatic", "戏剧"), option("grounded", "写实")],
              value => setConfig(previous => ({ ...previous, roomStyleId: value as TavernConfig["roomStyleId"] })))}</label>
            <label className="story-field"><span>自定义叙事要求</span><textarea rows={10} value={config.systemNarrative.customInstructions}
              onChange={event => setConfig(previous => ({ ...previous, systemNarrative: { ...previous.systemNarrative, customInstructions: event.target.value } }))} /></label>
          </> : <>
            <label className="story-field"><span>沉浸式描写</span><input type="checkbox" checked={config.settings.immersiveDescriptionEnabled}
              onChange={event => setConfig(previous => ({ ...previous, settings: { ...previous.settings, immersiveDescriptionEnabled: event.target.checked } }))} /></label>
            <label className="story-field"><span>最多发言角色</span><input type="number" min={1} max={10} value={config.settings.directorMaxSpeakers}
              onChange={event => setConfig(previous => ({ ...previous, settings: { ...previous.settings, directorMaxSpeakers: Number(event.target.value) } }))} /></label>
            <label className="story-field"><span>最多调度轮次</span><input type="number" min={1} max={10} value={config.settings.directorLoop.maxRounds}
              onChange={event => setConfig(previous => ({ ...previous, settings: { ...previous.settings, directorLoop: { maxRounds: Number(event.target.value) } } }))} /></label>
            <label className="story-field"><span>叙事控制</span>{select(config.settings.directorNarrativeControl.agencyMode,
              [option("player_protagonist", "玩家主角"), option("story_directive", "故事指令"), option("scene_drive", "场景推进")],
              value => setConfig(previous => ({ ...previous, settings: { ...previous.settings,
                directorNarrativeControl: { ...previous.settings.directorNarrativeControl, agencyMode: value as TavernConfig["settings"]["directorNarrativeControl"]["agencyMode"] } } })))}</label>
            <label className="story-field"><span>响应规模</span>{select(config.settings.directorNarrativeControl.responseScale,
              [option("focused", "聚焦"), option("balanced", "均衡"), option("ensemble", "群像")],
              value => setConfig(previous => ({ ...previous, settings: { ...previous.settings,
                directorNarrativeControl: { ...previous.settings.directorNarrativeControl, responseScale: value as TavernConfig["settings"]["directorNarrativeControl"]["responseScale"] } } })))}</label>
            <label className="story-field"><span>叙述压力</span>{select(config.settings.directorNarrativeControl.narratorPressure,
              [option("low", "低"), option("balanced", "均衡"), option("high", "高")],
              value => setConfig(previous => ({ ...previous, settings: { ...previous.settings,
                directorNarrativeControl: { ...previous.settings.directorNarrativeControl, narratorPressure: value as TavernConfig["settings"]["directorNarrativeControl"]["narratorPressure"] } } })))}</label>
          </>}
        </div>
      </main>
    </div> : <div className="story-tavern-layout"><aside className="story-sidebar">
      <div className="story-sidebar-head"><h2>章节</h2><small>{chapters.length}</small></div>
      <nav>{chapters.map(doc => <button type="button" key={keyOf(doc.ref)}
        className={`story-nav-item ${chapter === keyOf(doc.ref) ? "active" : ""}`} onClick={() => setChapter(keyOf(doc.ref))}>
        <span>✦</span>{doc.displayName}</button>)}</nav></aside>
      {selected ? <TavernRoom key={chapter} item={item} chapter={selected} config={config} close={() => setChapter("")} />
        : <div className="story-empty story-tavern-empty">
          <div className="story-empty-icon">✦</div><h2>选择章节，进入酒馆</h2>
          <p>围绕章节设定讨论情节、角色和写法。</p></div>}
    </div>}
  </div>;
}

export default function App() {
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [types, setTypes] = useState<StoryType[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [activeId, setActiveId] = useState("");
  const [view, setView] = useState<View>("library");
  const [dialog, setDialog] = useState<"create" | "import" | "">("");
  const [title, setTitle] = useState("");
  const [typeId, setTypeId] = useState("long-novel");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = library.find(item => item.workspace.id === activeId);
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [workspaces, storyTypes, hiddenIds] = await Promise.all([
        data().workspaces.list(),
        call<{ types: StoryType[] }>("isle_story_types"),
        data().storage.getItem<string[]>("hidden-story-workspaces"),
      ]);
      const entries = await Promise.all(workspaces.map(async workspace => {
        try { return { workspace, snapshot: await call<Snapshot>("isle_story_inspect", workspaceArgs(workspace)) }; }
        catch { return { workspace, snapshot: { status: "incompatible" as const } }; }
      }));
      setLibrary(entries); setTypes(storyTypes.types); setHidden(hiddenIds ?? []);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const update = (workspaceId: string, snapshot: Snapshot) =>
    setLibrary(previous => previous.map(item => item.workspace.id === workspaceId ? { ...item, snapshot } : item));
  const register = async (mode: "create" | "import") => {
    setBusy(true); setError("");
    try {
      const workspace = await data().workspaces.create({ name: mode === "create" ? title.trim() : "导入的故事" });
      if (!workspace) return;
      let snapshot = await call<Snapshot>("isle_story_inspect", workspaceArgs(workspace));
      if (mode === "create") {
        if (snapshot.status !== "empty") throw new Error("选择的目录已有故事项目；请使用导入。");
        snapshot = await call<Snapshot>("isle_story_create", { ...workspaceArgs(workspace), title: title.trim(), storyTypeId: typeId });
      } else if (snapshot.status === "empty") throw new Error("选择的目录不是现有故事项目。");
      setLibrary(previous => [...previous.filter(item => item.workspace.id !== workspace.id), { workspace, snapshot }]);
      const nextHidden = hidden.filter(id => id !== workspace.id);
      await data().storage.setItem("hidden-story-workspaces", nextHidden);
      setHidden(nextHidden);
      setDialog("");
      setActiveId(workspace.id); setView(snapshot.status === "ready" ? "editor" : "library");
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };
  const hide = async (workspaceId: string) => {
    const next = [...hidden, workspaceId];
    try { await data().storage.setItem("hidden-story-workspaces", next); setHidden(next); }
    catch (cause) { setError(errorMessage(cause)); }
  };
  const visible = library.filter(item => !hidden.includes(item.workspace.id) && item.snapshot.status !== "empty");
  return <div className="story-root">
    {view === "library" || !active ? <div className="story-library">
      <header className="story-library-header"><div><span className="story-eyebrow">ISLE · STORY</span><h1>故事</h1><p>把人物、世界和章节放在同一个故事工作区。</p></div>
        <div className="story-actions"><Button onClick={() => { setDialog("import"); setError(""); }}>导入故事</Button>
          <Button variant="primary" onClick={() => { setDialog("create"); setError(""); }}>＋ 新建故事</Button></div></header>
      {error && <div className="story-alert">{error}</div>}
      {loading ? <div className="story-empty">正在加载故事…</div> : visible.length ? <div className="story-card-grid">
        {visible.map(({ workspace, snapshot }) => snapshot.status === "ready" ? <article className="story-card" key={workspace.id}>
          <div className="story-card-icon">✦</div><span className="story-eyebrow">{snapshot.structure?.storyType.label}</span>
          <h2>{snapshot.overview?.title}</h2><p>{snapshot.overview?.description || "一个等待继续展开的故事。"}</p>
          {snapshot.overview?.goal && <div className="story-card-goal">目标 · {snapshot.overview.goal}</div>}
          <div className="story-card-stats"><span>人物 {snapshot.overview?.resourceCounts.characters ?? 0}</span>
            <span>章节 {snapshot.overview?.resourceCounts.chapters ?? 0}</span>
            <span>世界 {snapshot.overview?.resourceCounts.worldEntries ?? 0}</span></div>
          <footer><Button onClick={() => { setActiveId(workspace.id); setView("editor"); }} variant="primary">编辑故事</Button>
            <Button onClick={() => { setActiveId(workspace.id); setView("tavern"); }}>章节酒馆</Button>
            <Button onClick={() => void hide(workspace.id)} variant="quiet" title="从列表移除，故事文件保留">移除</Button></footer>
        </article> : <article className="story-card story-card-unavailable" key={workspace.id}>
          <div className="story-card-icon">◇</div><h2>{workspace.name}</h2><p>{snapshot.compatibility?.reason || "当前故事项目暂时无法打开。"}</p>
          <footer>{snapshot.status === "upgrade-available" && <Button variant="primary" onClick={() => {
            void call<{ status: string; overview?: StoryOverview; documents?: DocumentSummary[]; structure?: StoryProjectStructure }>(
              "isle_story_upgrade", workspaceArgs(workspace))
              .then(result => update(workspace.id, { ...result, status: "ready" }))
              .catch(cause => setError(errorMessage(cause)));
          }}>升级项目</Button>}<Button variant="quiet" onClick={() => void hide(workspace.id)}>移除</Button></footer>
        </article>)}</div> : <div className="story-empty story-library-empty"><div className="story-empty-icon">✦</div>
          <h2>开始你的第一个故事</h2><p>创建一个项目，或导入现有的故事工作区。</p>
          <Button variant="primary" onClick={() => setDialog("create")}>新建故事</Button></div>}
      </div>
      : view === "editor" ? <Editor item={active} update={snapshot => update(active.workspace.id, snapshot)}
          back={() => { setView("library"); void refresh(); }} tavern={() => setView("tavern")} />
        : <Tavern item={active}
          back={() => { setView("library"); void refresh(); }} editor={() => setView("editor")} />}
    {dialog && <Dialog title={dialog === "create" ? "新建故事" : "导入故事"} close={() => setDialog("")}>
      <div className="story-dialog-content">
        {dialog === "create" ? <><label className="story-field"><span>故事名称</span><input autoFocus value={title}
          onChange={event => setTitle(event.target.value)} placeholder="给你的故事起个名字" /></label>
          <label className="story-field"><span>故事类型</span><select value={typeId} onChange={event => setTypeId(event.target.value)}>
            {types.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label>
          <p className="story-hint">{types.find(type => type.id === typeId)?.description}</p></>
          : <p className="story-hint">选择一个包含 <code>story/</code> 的项目目录。导入后可直接继续编辑原有故事文件。</p>}
        {error && <div className="story-alert">{error}</div>}
      </div><footer><Button onClick={() => setDialog("")}>取消</Button><Button variant="primary"
        disabled={busy || (dialog === "create" && !title.trim())}
        onClick={() => void register(dialog === "create" ? "create" : "import")}>{busy ? "处理中…" : dialog === "create" ? "选择目录并创建" : "选择目录并导入"}</Button></footer>
    </Dialog>}
  </div>;
}
