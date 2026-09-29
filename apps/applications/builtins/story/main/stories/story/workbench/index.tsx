import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Folder,
  GitBranch,
  Globe2,
  ListTree,
  Maximize2,
  Menu,
  PanelLeftClose,
  PanelRightClose,
  Pencil,
  Plus,
  Search,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import { Button } from "design-system/components/ui/button";
import type { StoryDocument } from "@story/project/types";
import { toast } from "sonner";
import { writeClipboardText } from "@isle/app-sdk/browser";
import { storyDocumentData, storyDocumentKey } from "../../story-document";
import { useStoryState } from "../use-story-state";
import { StoryDocumentDetail } from "../modules/detail";
import {
  StoryDocumentDialog,
  type StoryDocumentDialogHandle,
} from "../modules/dialog";
import { buildDocumentGroups } from "../modules";
import { TavernStoryAction } from "../actions/tavern";
import { StoryWorkbenchAssistant, type WritingIntent } from "./assistant";
import {
  applySuggestion,
  buildChapters,
  chapterLabel,
  documentRoles,
  newChapterWrites,
  wordCount,
  type Chapter,
  type Passage,
  type WritingRequest,
} from "./model";
import { useManuscripts } from "./use-manuscripts";
import { ChapterNotes } from "./chapter-notes";
import { StoryReferencePanel } from "./reference-panel";
import "./workbench.css";

const tools = [
  { id: "assistant", label: "助手", icon: Sparkles },
  { id: "outline", label: "大纲", icon: ListTree },
  { id: "people", label: "角色", icon: UsersRound },
  { id: "world", label: "设定", icon: Globe2 },
  { id: "continuity", label: "伏笔", icon: GitBranch },
] as const;
type Tool = (typeof tools)[number]["id"];
const sidebarMinWidth = 200;
const sidebarMaxWidth = 420;
const assistantMinWidth = 320;
const assistantMaxWidth = 720;
const sidebarWidthBounds = (
  workspace: HTMLElement | null,
  panel: HTMLElement | null,
) => {
  const panelStyle = panel ? getComputedStyle(panel) : null;
  const panelWidth =
    panel &&
    panelStyle?.display !== "none" &&
    panelStyle?.position !== "absolute"
      ? panel.getBoundingClientRect().width
      : 0;
  return {
    min: sidebarMinWidth,
    max: Math.max(
      sidebarMinWidth,
      Math.min(
        sidebarMaxWidth,
        (workspace?.getBoundingClientRect().width ?? 0) - panelWidth - 56 - 300,
      ),
    ),
  };
};
const assistantWidthBounds = (
  workspace: HTMLElement | null,
  sidebar: HTMLElement | null,
) => {
  const sidebarStyle = sidebar ? getComputedStyle(sidebar) : null;
  const sidebarWidth =
    sidebar &&
    sidebarStyle?.display !== "none" &&
    sidebarStyle?.position !== "absolute"
      ? sidebar.getBoundingClientRect().width
      : 0;
  return {
    min: assistantMinWidth,
    max: Math.max(
      assistantMinWidth,
      Math.min(
        assistantMaxWidth,
        (workspace?.getBoundingClientRect().width ?? 0) -
          sidebarWidth -
          56 -
          300,
      ),
    ),
  };
};
const clampAssistantWidth = (width: number, min: number, max: number) =>
  Math.round(Math.max(min, Math.min(max, width)));
const clampSidebarWidth = clampAssistantWidth;
export function StoryWorkbench({ onBack }: { onBack: () => void }) {
  const overview = useStoryState((s) => s.overview)!;
  const workspace = useStoryState((s) => s.storyWorkspace)!;
  const documents = useStoryState((s) => s.documents);
  const structure = useStoryState((s) => s.documentStructure);
  const saving = useStoryState((s) => s.isSaving);
  const loadStructure = useStoryState((s) => s.loadDocumentStructure);
  const writeDocuments = useStoryState((s) => s.writeDocuments);
  const chapters = useMemo(
    () => buildChapters(documents, structure),
    [documents, structure],
  );
  const drafts = useManuscripts(chapters);
  const [selectedKey, setSelectedKey] = useState("");
  const [sidebar, setSidebar] = useState<"chapters" | "materials">("chapters");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"content" | "plan" | "record">("content");
  const [materialKey, setMaterialKey] = useState<string | null>(null);
  const [panel, setPanel] = useState<Tool | null>(() =>
    window.matchMedia("(max-width: 700px)").matches ? null : "assistant",
  );
  const [focused, setFocused] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(null);
  const [measuredSidebarWidth, setMeasuredSidebarWidth] = useState(240);
  const [sidebarResizeBounds, setSidebarResizeBounds] = useState({
    min: sidebarMinWidth,
    max: sidebarMaxWidth,
  });
  const [assistantWidth, setAssistantWidth] = useState<number | null>(null);
  const [measuredAssistantWidth, setMeasuredAssistantWidth] = useState(400);
  const [assistantResizeBounds, setAssistantResizeBounds] = useState({
    min: assistantMinWidth,
    max: assistantMaxWidth,
  });
  const [fontSize, setFontSize] = useState(20);
  const [selection, setSelection] = useState<
    (Passage & { x: number; y: number }) | null
  >(null);
  const [intent, setIntent] = useState<WritingIntent | null>(null);
  const [undo, setUndo] = useState<{
    id: string;
    key: string;
    before: string;
    after: string;
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [leaving, setLeaving] = useState(false);
  const dialog = useRef<StoryDocumentDialogHandle>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const assistantPanelRef = useRef<HTMLElement>(null);
  const sidebarResizeDrag = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    min: number;
    max: number;
  } | null>(null);
  const assistantResizeDrag = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    min: number;
    max: number;
  } | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const chapter = chapters.find((c) => c.key === selectedKey) ?? chapters[0];
  const text = drafts.textFor(chapter);
  const selectedMaterial = documents.find(
    (d) => storyDocumentKey(d) === materialKey,
  );
  const relatedDocument = tab === "plan" ? chapter?.plan : chapter?.record;
  const groups = useMemo(
    () => buildDocumentGroups(documents, query),
    [documents, query],
  );
  const volumes = documents
    .filter((d) => d.ref.kind === documentRoles(structure).volume)
    .sort(
      (a, b) =>
        Number(storyDocumentData(a)?.number) -
        Number(storyDocumentData(b)?.number),
    );
  useEffect(() => {
    void loadStructure();
  }, [loadStructure]);
  useEffect(() => {
    const workspaceElement = workspaceRef.current;
    const panelElement = assistantPanelRef.current;
    const sidebarElement = sidebarRef.current;
    if (!workspaceElement || !panelElement || !sidebarElement) return;
    const measure = () => {
      const assistantBounds = assistantWidthBounds(
        workspaceElement,
        sidebarElement,
      );
      const assistantMeasured = Math.round(
        panelElement.getBoundingClientRect().width,
      );
      setMeasuredAssistantWidth((current) =>
        current === assistantMeasured ? current : assistantMeasured,
      );
      setAssistantResizeBounds((current) =>
        current.min === assistantBounds.min &&
        current.max === assistantBounds.max
          ? current
          : assistantBounds,
      );
      const sidebarBounds = sidebarWidthBounds(workspaceElement, panelElement);
      const sidebarMeasured = Math.round(
        sidebarElement.getBoundingClientRect().width,
      );
      setMeasuredSidebarWidth((current) =>
        current === sidebarMeasured ? current : sidebarMeasured,
      );
      setSidebarResizeBounds((current) =>
        current.min === sidebarBounds.min && current.max === sidebarBounds.max
          ? current
          : sidebarBounds,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(workspaceElement);
    observer.observe(panelElement);
    observer.observe(sidebarElement);
    return () => observer.disconnect();
  }, []);
  const finishSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (sidebarResizeDrag.current?.pointerId !== event.pointerId) return;
    sidebarResizeDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const finishAssistantResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (assistantResizeDrag.current?.pointerId !== event.pointerId) return;
    assistantResizeDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  useEffect(() => {
    if (!chapters.some((c) => c.key === selectedKey))
      setSelectedKey(chapters[0]?.key ?? "");
  }, [chapters, selectedKey]);
  useEffect(() => {
    setSelection(null);
    setUndo(null);
  }, [chapter?.key]);
  useEffect(() => {
    const element = editor.current;
    if (!element) return;
    const fitContent = () => {
      element.style.height = "0px";
      element.style.height = `${Math.max(420, element.scrollHeight)}px`;
    };
    fitContent();
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      // Only respond to width changes; fitting the height must not loop.
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      fitContent();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [
    text,
    chapter?.key,
    fontSize,
    tab,
    materialKey,
    sidebarHidden,
    focused,
    panel,
  ]);
  const openChapter = (item: Chapter) => {
    setSelectedKey(item.key);
    setMaterialKey(null);
    setTab("content");
    setSidebarOpen(false);
    setSelection(null);
    void drafts.flush();
  };
  const openMaterial = (document: StoryDocument) => {
    setMaterialKey(storyDocumentKey(document));
    setSidebarOpen(false);
    setSelection(null);
    void drafts.flush();
  };
  const createChapter = async () => {
    if (creating || !structure) return;
    setCreating(true);
    try {
      if (!(await drafts.flush())) return;
      const id =
        globalThis.crypto?.randomUUID?.() ??
        `chapter-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const result = await writeDocuments((docs, schema) =>
        newChapterWrites(schema, docs, id),
      );
      if (result) {
        const created = buildChapters(result, structure).find(
          (c) => c.id === id,
        );
        if (created) openChapter(created);
        setSidebar("chapters");
        setQuery("");
      }
    } finally {
      setCreating(false);
    }
  };
  const leave = async () => {
    if (leaving) return;
    setLeaving(true);
    if (await drafts.flush()) onBack();
    else setLeaving(false);
  };
  const request = (action: string, passage: Passage | null = null) => {
    setPanel("assistant");
    setFocused(false);
    setSelection(null);
    setIntent({
      id: Date.now(),
      action,
      selection: passage,
      text:
        action === "提问"
          ? "关于这段文字，"
          : passage
            ? `帮我${action}这段文字，保持本章的叙述风格。`
            : action,
    });
  };
  const selectPassage = () => {
    const element = editor.current;
    const area = stage.current;
    if (
      !element ||
      !area ||
      !chapter ||
      element.selectionStart === element.selectionEnd
    ) {
      setSelection(null);
      return;
    }
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const rect = area.getBoundingClientRect();
    const point = pointer.current;
    setSelection({
      chapterKey: chapter.key,
      start,
      end,
      text: text.slice(start, end),
      x: Math.max(
        8,
        Math.min(
          area.clientWidth - 320,
          (point?.x ?? rect.left + 80) - rect.left - 110,
        ),
      ),
      y: Math.max(
        8,
        (point?.y ?? rect.top + 120) - rect.top + area.scrollTop - 58,
      ),
    });
  };
  const apply = (
    target: WritingRequest,
    suggestion: string,
    messageId = "",
  ) => {
    if (!chapter) return false;
    try {
      const next = applySuggestion(chapter.key, text, target, suggestion);
      drafts.update(chapter, next);
      setUndo({ id: messageId, key: chapter.key, before: text, after: next });
      setMaterialKey(null);
      setTab("content");
      setSelection(null);
      toast.success(target.selection ? "已替换选中文段。" : "已插入章末。");
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  };
  const undoApply = () => {
    if (!chapter || !undo || undo.key !== chapter.key) return false;
    if (text !== undo.after) {
      toast.error("正文已继续修改，无法撤销这次建议。");
      return false;
    }
    drafts.update(chapter, undo.before);
    setUndo(null);
    toast.success("已撤销建议。");
    return true;
  };
  const copyChapter = async () => {
    if (!chapter) return;
    try {
      await writeClipboardText(text);
      toast.success("已复制本章正文。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法复制正文。");
    }
  };
  const saveLabel = drafts.error
    ? "保存失败 · 点击重试"
    : saving
      ? "正在保存…"
      : drafts.dirty
        ? "待保存"
        : "已保存";
  const visibleChapters = chapters.filter((c) =>
    chapterLabel(c).toLowerCase().includes(query.toLowerCase().trim()),
  );
  const renderChapters = (items: Chapter[]) =>
    items.map((item) => (
      <button
        key={item.key}
        className={`sw-chapter-row ${chapter?.key === item.key && !materialKey ? "active" : ""}`}
        aria-current={
          chapter?.key === item.key && !materialKey ? "page" : undefined
        }
        onClick={() => openChapter(item)}
        title={chapterLabel(item)}
      >
        <span>{item.number || "—"}</span>
        <span>{item.title}</span>
        {!item.content && <span className="sw-draft-dot" title="尚未写正文" />}
      </button>
    ));
  return (
    <div className={`sw-shell ${focused ? "sw-focused" : ""}`}>
      <header className="sw-header">
        <div className="sw-book-heading">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="返回故事列表"
            onClick={() => void leave()}
            disabled={leaving}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <BookOpen className="sw-book-icon size-5 text-primary" />
          <strong title={overview.title}>{overview.title}</strong>
          <span className="sw-header-divider" />
          <span className="sw-breadcrumb">
            {chapter ? chapterLabel(chapter) : "写作工作台"}
          </span>
        </div>
        <div className="sw-global-actions">
          <button
            className={`sw-save ${drafts.error ? "text-destructive" : ""}`}
            onClick={() => void drafts.flush()}
            aria-label={saveLabel}
          >
            <Check className="size-3.5" />
            {saveLabel}
          </button>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={focused}
            aria-label={focused ? "退出专注" : "专注"}
            onClick={() => setFocused(!focused)}
          >
            <Maximize2 className="size-3.5" />
            <span>{focused ? "退出专注" : "专注"}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void copyChapter()}
            aria-label="复制当前章节正文"
            disabled={!chapter}
          >
            <Copy className="size-3.5" />
            <span>复制正文</span>
          </Button>
          <TavernStoryAction />
        </div>
      </header>
      <div
        ref={workspaceRef}
        className={`sw-workspace ${sidebarHidden ? "sw-no-sidebar" : ""} ${!panel ? "sw-no-panel" : ""}`}
        style={
          assistantWidth === null && sidebarWidth === null
            ? undefined
            : ({
                ...(assistantWidth === null
                  ? {}
                  : {
                      "--sw-panel-width": `${Math.min(assistantWidth, assistantResizeBounds.max)}px`,
                    }),
                ...(sidebarWidth === null
                  ? {}
                  : {
                      "--sw-sidebar-resized-width": `${Math.min(sidebarWidth, sidebarResizeBounds.max)}px`,
                    }),
              } as CSSProperties)
        }
      >
        {sidebarOpen && !focused && (
          <button
            className="sw-drawer-backdrop"
            aria-label="关闭章节目录"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside
          ref={sidebarRef}
          className={`sw-sidebar ${sidebarOpen ? "is-open" : ""}`}
          aria-label="章节与资料"
        >
          <div
            className="sw-sidebar-resize-handle"
            role="separator"
            aria-label="调整章节与资料宽度"
            aria-orientation="vertical"
            aria-valuemin={sidebarResizeBounds.min}
            aria-valuemax={sidebarResizeBounds.max}
            aria-valuenow={measuredSidebarWidth}
            aria-valuetext={`${measuredSidebarWidth} 像素`}
            tabIndex={0}
            title="左右拖动调整宽度，双击恢复默认"
            onPointerDown={(event) => {
              if (!event.isPrimary || event.button !== 0) return;
              const bounds = sidebarWidthBounds(
                workspaceRef.current,
                assistantPanelRef.current,
              );
              sidebarResizeDrag.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startWidth:
                  sidebarRef.current?.getBoundingClientRect().width ??
                  measuredSidebarWidth,
                ...bounds,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
              event.preventDefault();
            }}
            onPointerMove={(event) => {
              const drag = sidebarResizeDrag.current;
              if (!drag || drag.pointerId !== event.pointerId) return;
              setSidebarWidth(
                clampSidebarWidth(
                  drag.startWidth + event.clientX - drag.startX,
                  drag.min,
                  drag.max,
                ),
              );
            }}
            onPointerUp={finishSidebarResize}
            onPointerCancel={finishSidebarResize}
            onLostPointerCapture={() => {
              sidebarResizeDrag.current = null;
            }}
            onDoubleClick={() => setSidebarWidth(null)}
            onKeyDown={(event) => {
              const bounds = sidebarWidthBounds(
                workspaceRef.current,
                assistantPanelRef.current,
              );
              const next =
                event.key === "ArrowRight"
                  ? measuredSidebarWidth + 24
                  : event.key === "ArrowLeft"
                    ? measuredSidebarWidth - 24
                    : event.key === "Home"
                      ? bounds.min
                      : event.key === "End"
                        ? bounds.max
                        : null;
              if (next === null) return;
              event.preventDefault();
              setSidebarWidth(clampSidebarWidth(next, bounds.min, bounds.max));
            }}
          />
          <div className="sw-sidebar-tabs">
            <button
              className={sidebar === "chapters" ? "active" : ""}
              onClick={() => {
                setSidebar("chapters");
                setQuery("");
              }}
            >
              章节
            </button>
            <button
              className={sidebar === "materials" ? "active" : ""}
              onClick={() => {
                setSidebar("materials");
                setQuery("");
              }}
            >
              资料
            </button>
            <button
              className="sw-drawer-close"
              aria-label="关闭目录"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="size-4" />
            </button>
          </div>
          <label className="sw-search">
            <Search className="size-4" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={sidebar === "chapters" ? "搜索章节" : "搜索资料"}
              placeholder={sidebar === "chapters" ? "搜索章节" : "搜索资料"}
            />
          </label>
          <Button
            className="sw-new"
            disabled={sidebar === "chapters" && (!structure || creating)}
            onClick={() =>
              sidebar === "chapters" ? void createChapter() : dialog.current?.()
            }
          >
            <Plus className="size-4" />
            {sidebar === "chapters"
              ? creating
                ? "正在新建…"
                : "新建章节"
              : "新增资料"}
          </Button>
          <nav
            className="sw-tree"
            aria-label={sidebar === "chapters" ? "章节目录" : "故事资料"}
          >
            {sidebar === "chapters" ? (
              <>
                {volumes.map((volume) => {
                  const id = volume.ref.identity.id;
                  const children = visibleChapters.filter(
                    (c) => c.volumeId === id,
                  );
                  const data = storyDocumentData(volume);
                  const folded = collapsed.has(id);
                  if (query && !children.length) return null;
                  return (
                    <section key={id}>
                      <button
                        className="sw-volume"
                        aria-expanded={!folded}
                        onClick={() =>
                          setCollapsed((current) => {
                            const next = new Set(current);
                            if (next.has(id)) next.delete(id);
                            else next.add(id);
                            return next;
                          })
                        }
                      >
                        {folded ? (
                          <ChevronRight className="size-3.5" />
                        ) : (
                          <ChevronDown className="size-3.5" />
                        )}
                        <Folder className="size-4" />
                        <span>
                          {String(data?.title || `第${data?.number || ""}卷`)}
                        </span>
                        <small>{children.length}</small>
                      </button>
                      {!folded && renderChapters(children)}
                    </section>
                  );
                })}
                {renderChapters(
                  visibleChapters.filter(
                    (c) =>
                      !volumes.some((v) => v.ref.identity.id === c.volumeId),
                  ),
                )}
                {!visibleChapters.length && (
                  <p className="sw-empty">
                    {query ? "没有匹配的章节" : "新建一章，开始你的故事。"}
                  </p>
                )}
              </>
            ) : (
              groups.map((group) => (
                <details key={group.id} open>
                  <summary>
                    <group.icon className="size-4" />
                    {group.label}
                    <small>{group.documents.length}</small>
                  </summary>
                  {group.documents.map((document) => (
                    <button
                      className={`sw-material-row ${materialKey === storyDocumentKey(document) ? "active" : ""}`}
                      key={storyDocumentKey(document)}
                      onClick={() => openMaterial(document)}
                    >
                      {document.displayName}
                    </button>
                  ))}
                </details>
              ))
            )}
          </nav>
          <div className="sw-library-footer">
            全书{" "}
            {chapters
              .reduce((sum, c) => sum + wordCount(drafts.textFor(c)), 0)
              .toLocaleString()}{" "}
            字
          </div>
        </aside>
        <main className="sw-manuscript">
          <div className="sw-editor-toolbar">
            <button
              className="sw-directory-button"
              aria-label="打开章节目录"
              onClick={() => {
                setSidebarHidden(false);
                setSidebarOpen(true);
              }}
            >
              <Menu className="size-4" />
            </button>
            <button
              className="sw-sidebar-toggle"
              aria-label={sidebarHidden ? "展开章节目录" : "收起章节目录"}
              onClick={() => setSidebarHidden(!sidebarHidden)}
            >
              <PanelLeftClose
                className={`size-4 ${sidebarHidden ? "rotate-180" : ""}`}
              />
            </button>
            <div
              className="sw-document-tabs"
              role="tablist"
              aria-label="章节内容"
              onKeyDown={(event) => {
                const keys = ["content", "plan", "record"] as const;
                const current = keys.indexOf(tab);
                const next =
                  event.key === "ArrowRight"
                    ? (current + 1) % 3
                    : event.key === "ArrowLeft"
                      ? (current + 2) % 3
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? 2
                          : -1;
                if (next < 0) return;
                event.preventDefault();
                setTab(keys[next]);
                setMaterialKey(null);
                setSelection(null);
                event.currentTarget
                  .querySelectorAll<HTMLButtonElement>("button")
                  [next]?.focus();
              }}
            >
              {(
                [
                  ["content", "正文"],
                  ["plan", "细纲"],
                  ["record", "记录"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  id={`story-workbench-tab-${id}`}
                  aria-controls="story-workbench-document-panel"
                  tabIndex={tab === id ? 0 : -1}
                  aria-selected={!materialKey && tab === id}
                  className={!materialKey && tab === id ? "active" : ""}
                  onClick={() => {
                    setTab(id);
                    setMaterialKey(null);
                    setSelection(null);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="sw-editor-controls">
              <label className="sw-font-control">
                <span>字号</span>
                <select
                  value={fontSize}
                  aria-label="正文字号"
                  onChange={(e) => setFontSize(Number(e.target.value))}
                >
                  {[18, 20, 22, 24, 26].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              {chapter && (
                <button
                  title="编辑章节信息"
                  aria-label="编辑章节信息"
                  onClick={async () => {
                    if (await drafts.flush())
                      dialog.current?.(chapter.record ?? chapter.plan);
                  }}
                >
                  <Pencil className="size-4" />
                </button>
              )}
              {!focused && (
                <button
                  aria-label={panel ? "收起辅助面板" : "打开创作助手"}
                  onClick={() => setPanel(panel ? null : "assistant")}
                >
                  <PanelRightClose
                    className={`size-4 ${panel ? "" : "rotate-180"}`}
                  />
                </button>
              )}
            </div>
          </div>
          <div
            className="sw-document-panel"
            role="tabpanel"
            id="story-workbench-document-panel"
            aria-labelledby={
              materialKey ? undefined : `story-workbench-tab-${tab}`
            }
            aria-label={materialKey ? "故事资料" : undefined}
          >
            {selectedMaterial ? (
              <StoryDocumentDetail
                key={storyDocumentKey(selectedMaterial)}
                document={selectedMaterial}
                categoryLabel="故事资料"
              />
            ) : tab !== "content" ? (
              relatedDocument && chapter ? (
                <ChapterNotes
                  chapter={chapter}
                  document={relatedDocument}
                  mode={tab}
                  onEdit={() => dialog.current?.(relatedDocument)}
                />
              ) : (
                <div className="sw-empty-center">
                  <ListTree className="size-7 text-primary" />
                  <h3>
                    {tab === "plan" ? "这一章还没有细纲" : "这一章还没有记录"}
                  </h3>
                  <p>
                    {tab === "plan"
                      ? "与助手讨论核心事件、节拍和结尾钩子。"
                      : "写入正文后会自动创建章节记录。"}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() =>
                      request(
                        tab === "plan"
                          ? "帮我完善当前章的细纲"
                          : "帮我梳理当前章的结果与状态变化",
                      )
                    }
                  >
                    与助手讨论
                  </Button>
                </div>
              )
            ) : chapter ? (
              <div className="sw-editor-stage" ref={stage}>
                <article className="sw-paper">
                  <h1>{chapterLabel(chapter)}</h1>
                  <textarea
                    ref={editor}
                    className="sw-novel-text"
                    style={
                      { "--sw-reading-size": `${fontSize}px` } as CSSProperties
                    }
                    aria-label="章节正文"
                    placeholder="从这里开始写下你的故事…"
                    spellCheck={false}
                    value={text}
                    onChange={(e) => {
                      drafts.update(chapter, e.target.value);
                      setSelection(null);
                    }}
                    onPointerUp={(e) => {
                      pointer.current = { x: e.clientX, y: e.clientY };
                      selectPassage();
                    }}
                    onKeyUp={(e) => {
                      if (e.key === "Shift" || e.shiftKey) {
                        pointer.current = null;
                        selectPassage();
                      }
                    }}
                    onSelect={selectPassage}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                        e.preventDefault();
                        void drafts.flush();
                      }
                    }}
                  />
                </article>
                {selection && (
                  <div
                    className="sw-selection-toolbar"
                    role="toolbar"
                    aria-label="选中文段操作"
                    style={{ left: selection.x, top: selection.y }}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <Sparkles className="size-4 text-primary" />
                    {["润色", "扩写", "改写", "提问"].map((action) => (
                      <button
                        key={action}
                        onClick={() => request(action, selection)}
                      >
                        {action}
                      </button>
                    ))}
                    <button
                      aria-label="关闭选区操作"
                      onClick={() => setSelection(null)}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="sw-empty-center">
                <FileText className="size-7 text-primary" />
                <h3>开始你的第一章</h3>
                <p>章节、细纲和记录会一起保存在当前故事中。</p>
                <Button
                  disabled={!structure || creating}
                  onClick={() => void createChapter()}
                >
                  <Plus className="size-4" />
                  新建章节
                </Button>
              </div>
            )}
          </div>
          <footer className="sw-editor-footer">
            <span>
              {chapter
                ? `本章 ${wordCount(text).toLocaleString()} 字`
                : "暂无章节"}
            </span>
            {chapter?.plan &&
              Number(storyDocumentData(chapter.plan)?.targetWords) > 0 && (
                <span className="sw-word-goal">
                  / 目标{" "}
                  {Number(
                    storyDocumentData(chapter.plan)?.targetWords,
                  ).toLocaleString()}
                </span>
              )}
            <button
              onClick={() => void drafts.flush()}
              className="sw-auto-save"
            >
              <Check className="size-3" />
              {saveLabel}
            </button>
          </footer>
        </main>
        <aside
          ref={assistantPanelRef}
          className={`sw-context-panel ${panel ? "is-open" : ""}`}
          aria-label="写作辅助"
        >
          {panel === "assistant" && (
            <div
              className="sw-assistant-resize-handle"
              role="separator"
              aria-label="调整创作助手宽度"
              aria-orientation="vertical"
              aria-valuemin={assistantResizeBounds.min}
              aria-valuemax={assistantResizeBounds.max}
              aria-valuenow={measuredAssistantWidth}
              aria-valuetext={`${measuredAssistantWidth} 像素`}
              tabIndex={0}
              title="左右拖动调整宽度，双击恢复默认"
              onPointerDown={(event) => {
                if (!event.isPrimary || event.button !== 0) return;
                const bounds = assistantWidthBounds(
                  workspaceRef.current,
                  sidebarRef.current,
                );
                assistantResizeDrag.current = {
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startWidth:
                    assistantPanelRef.current?.getBoundingClientRect().width ??
                    measuredAssistantWidth,
                  ...bounds,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
                event.preventDefault();
              }}
              onPointerMove={(event) => {
                const drag = assistantResizeDrag.current;
                if (!drag || drag.pointerId !== event.pointerId) return;
                setAssistantWidth(
                  clampAssistantWidth(
                    drag.startWidth + drag.startX - event.clientX,
                    drag.min,
                    drag.max,
                  ),
                );
              }}
              onPointerUp={finishAssistantResize}
              onPointerCancel={finishAssistantResize}
              onLostPointerCapture={() => {
                assistantResizeDrag.current = null;
              }}
              onDoubleClick={() => setAssistantWidth(null)}
              onKeyDown={(event) => {
                const bounds = assistantWidthBounds(
                  workspaceRef.current,
                  sidebarRef.current,
                );
                const next =
                  event.key === "ArrowLeft"
                    ? measuredAssistantWidth + 24
                    : event.key === "ArrowRight"
                      ? measuredAssistantWidth - 24
                      : event.key === "Home"
                        ? bounds.min
                        : event.key === "End"
                          ? bounds.max
                          : null;
                if (next === null) return;
                event.preventDefault();
                setAssistantWidth(
                  clampAssistantWidth(next, bounds.min, bounds.max),
                );
              }}
            />
          )}
          <div
            className={
              panel === "assistant" ? "sw-assistant-view" : "sw-hidden"
            }
          >
            <StoryWorkbenchAssistant
              story={{ id: workspace.id, overview, documents, workspace }}
              chapter={chapter}
              document={
                selectedMaterial ??
                (tab !== "content" ? relatedDocument : undefined)
              }
              text={text}
              intent={intent}
              beforeSend={drafts.flush}
              onApply={apply}
              undoId={undo?.id ?? null}
              onUndo={undoApply}
            />
          </div>
          {panel && panel !== "assistant" && (
            <StoryReferencePanel
              documents={documents}
              panel={panel}
              label={tools.find((tool) => tool.id === panel)!.label}
              icon={tools.find((tool) => tool.id === panel)!.icon}
              selectedKey={materialKey}
              onOpen={openMaterial}
              onCreate={() =>
                dialog.current?.(
                  undefined,
                  structure?.roles[
                    {
                      outline: "volume",
                      people: "character",
                      world: "worldEntry",
                      continuity: "foreshadows",
                    }[panel]
                  ],
                )
              }
              onClose={() => setPanel(null)}
            />
          )}
        </aside>
        <nav className="sw-tool-rail" aria-label="写作工具">
          {tools.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={panel === id ? "active" : ""}
              aria-pressed={panel === id}
              onClick={() => setPanel(panel === id ? null : id)}
            >
              <Icon className="size-5" strokeWidth={1.7} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
      <StoryDocumentDialog
        bind={dialog}
        onSaved={(document) => {
          const matched = buildChapters(
            useStoryState.getState().documents,
            structure,
          ).find((c) =>
            [c.content, c.plan, c.record].some(
              (d) => d && storyDocumentKey(d) === storyDocumentKey(document),
            ),
          );
          if (matched) {
            setSelectedKey(matched.key);
            setMaterialKey(null);
          } else openMaterial(document);
        }}
      />
    </div>
  );
}
