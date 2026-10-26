import { useEffect, useRef, type ReactNode } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  LoaderCircle,
  Search,
  AlertCircle,
} from "lucide-react";
import { Button } from "design-system/components/ui/button";
import type {
  KnowledgeDocument,
  KnowledgeSearchHit,
  KnowledgeSearchMode,
  KnowledgeSearchResult,
  KnowledgeCapabilities,
} from "@mewvis/knowledge-sdk";
import { evidenceRange, locationText, modeLabels } from "./helpers.js";

export interface KnowledgeDocumentViewProps {
  readonly document: KnowledgeDocument;
  readonly evidence?: KnowledgeSearchHit;
  /** Import previews include the document title inside the paper. */
  readonly showTitle?: boolean;
}
/** Readable, escaped standard text. Unicode code-point source ranges remain aligned with the service. */
export function KnowledgeDocumentView({
  document,
  evidence,
  showTitle = false,
}: KnowledgeDocumentViewProps) {
  const range = evidenceRange(document, evidence);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (range)
      container.current
        ?.querySelector("mark")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [document.id, document.revision, evidence?.id]);
  let offset = 0;
  let inCode = false;
  const lines = document.text.split("\n");
  return (
    <div className="knowledge-document" ref={container}>
      {lines.map((line, index) => {
        const start = offset,
          chars = Array.from(line);
        offset += chars.length + 1;
        if (
          !showTitle &&
          index === 0 &&
          /^#\s/.test(line) &&
          line.replace(/^#\s+/, "").trim() ===
            document.title.replace(/\.(md|markdown|txt)$/i, "")
        )
          return null;
        if (line.startsWith("```")) {
          inCode = !inCode;
          return (
            <div key={index} className="knowledge-code-boundary">
              {line.slice(3)}
            </div>
          );
        }
        if (!line.trim())
          return <div key={index} className="knowledge-paragraph-gap" />;
        let prefix = 0;
        const heading = !inCode ? /^(#{1,6})\s+/.exec(line) : null;
        const list = !inCode ? /^[-*]\s+/.exec(line) : null;
        if (heading) prefix = Array.from(heading[0]).length;
        if (list) prefix = Array.from(list[0]).length;
        const content: ReactNode[] = [];
        const textStart = start + prefix;
        const visible = chars.slice(prefix);
        if (
          range &&
          range.start < start + chars.length &&
          range.end > textStart
        ) {
          const from = Math.max(0, range.start - textStart),
            to = Math.min(visible.length, range.end - textStart);
          content.push(
            visible.slice(0, from).join(""),
            <mark key="evidence">{visible.slice(from, to).join("")}</mark>,
            visible.slice(to).join(""),
          );
        } else content.push(visible.join(""));
        if (inCode) return <pre key={index}>{content}</pre>;
        if (heading)
          return (
            <h2
              key={index}
              className={
                heading[1]!.length > 2 ? "knowledge-small-heading" : undefined
              }
            >
              {content}
            </h2>
          );
        if (list)
          return (
            <p key={index} className="knowledge-list-line">
              {content}
            </p>
          );
        return <p key={index}>{content}</p>;
      })}
    </div>
  );
}

export interface KnowledgeSearchPanelProps {
  readonly knowledgeBaseName: string;
  readonly capabilities: KnowledgeCapabilities;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly mode: KnowledgeSearchMode;
  readonly onModeChange: (mode: KnowledgeSearchMode) => void;
  readonly onSearch: () => void;
  readonly onLocate: (hit: KnowledgeSearchHit) => void;
  readonly result?: KnowledgeSearchResult;
  readonly selectedHitId?: string;
  readonly pending?: boolean;
}
export function KnowledgeSearchPanel(props: KnowledgeSearchPanelProps) {
  const allowed = props.capabilities.methods.includes("search");
  return (
    <aside className="knowledge-search-pane" aria-label="检索测试">
      <div className="knowledge-pane-heading">
        <Search size={24} />
        <div>
          <h2>检索测试</h2>
          <p>{props.knowledgeBaseName}</p>
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          props.onSearch();
        }}
      >
        <label htmlFor="knowledge-query">检索问题</label>
        <textarea
          id="knowledge-query"
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          placeholder="输入问题，查找相关资料…"
          rows={3}
          maxLength={8192}
          disabled={!allowed}
        />
        <div className="knowledge-search-controls">
          <select
            aria-label="检索方式"
            value={props.mode}
            onChange={(event) =>
              props.onModeChange(event.target.value as KnowledgeSearchMode)
            }
            disabled={!allowed}
          >
            <option value="auto">自动选择</option>
            {props.capabilities.searchModes.map((mode) => (
              <option key={mode} value={mode}>
                {modeLabels[mode]}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            className="knowledge-search-button"
            type="submit"
            disabled={!allowed || props.pending || !props.query.trim()}
          >
            {props.pending && <LoaderCircle className="knowledge-spin" />}
            {props.pending ? "检索中…" : "运行检索"}
          </Button>
        </div>
      </form>
      {!allowed && <p className="knowledge-muted">当前没有检索权限。</p>}
      {props.result ? (
        <>
          <div className="knowledge-search-summary" role="status">
            <CheckCircle2 size={14} />
            {props.result.hits.length} 个相关片段 ·{" "}
            {Math.round(props.result.diagnostics.elapsedMs)} 毫秒
          </div>
          {props.result.diagnostics.warnings.map((warning, index) => (
            <p className="knowledge-warning" key={index}>
              <AlertCircle size={15} />
              {warning.message}
            </p>
          ))}
          {props.result.diagnostics.status === "partial" && (
            <p className="knowledge-warning">
              部分知识库未能完成检索，请检查服务状态。
            </p>
          )}
          {!props.result.hits.length && (
            <div className="knowledge-search-empty">
              <Search size={24} />
              <h3>没有找到相关片段</h3>
              <p>尝试更具体的问题，或检查资料是否已完成入库。</p>
            </div>
          )}
          <div className="knowledge-results">
            {props.result.hits.map((hit) => (
              <article
                key={hit.id}
                className={`knowledge-hit ${props.selectedHitId === hit.id ? "is-selected" : ""}`}
              >
                <div className="knowledge-hit-heading">
                  <FileText size={20} />
                  <div>
                    <h3>{hit.title}</h3>
                    <p>{locationText(hit)}</p>
                  </div>
                </div>
                <p className="knowledge-hit-text">
                  {hit.text
                    .split("\n")
                    .filter((line) => !/^#{1,6}\s/.test(line))
                    .join("\n")
                    .trim()
                    .replace(/\s+/g, " ")}
                </p>
                <Button
                  variant="link"
                  onClick={() => props.onLocate(hit)}
                  className="knowledge-locate"
                >
                  定位到原文 <ArrowLeft size={14} />
                </Button>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="knowledge-search-empty">
          <Search size={28} />
          <h3>用一个问题验证资料</h3>
          <p>查看命中的正文片段，并核对每一条出处。</p>
        </div>
      )}
    </aside>
  );
}
