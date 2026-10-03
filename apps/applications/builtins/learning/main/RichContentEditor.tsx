import { SelectField } from "./SelectField";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bold,
  Code,
  Copy,
  Eye,
  Italic,
  List,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { type ContentBlock, type ExperimentConfig } from "./richContent";
import { Diagram, RichLesson } from "./RichLesson";

import { FormulaEditor } from "./FormulaEditor";

const labels = {
  text: "正文",
  formula: "公式",
  diagram: "图解",
  code: "代码示例",
  callout: "提示",
};
function newBlock(type: ContentBlock["type"]): ContentBlock {
  const id = crypto.randomUUID();
  switch (type) {
    case "text":
      return { id, type, text: "" };
    case "formula":
      return { id, type, latex: "y = kx + b", caption: "" };
    case "diagram":
      return {
        id,
        type,
        title: "从输入到输出",
        direction: "horizontal",
        nodes: [
          { label: "x", description: "输入" },
          { label: "× k", description: "控制倾斜程度" },
          { label: "+ b", description: "控制纵向位置" },
          { label: "y", description: "输出" },
        ],
        caption: "",
      };
    case "code":
      return { id, type, language: "", code: "" };
    case "callout":
      return { id, type, title: "想一想", text: "" };
  }
}
function TextBlockEditor({
  block,
  change,
  first,
}: {
  block: Extract<ContentBlock, { type: "text" }>;
  change: (block: ContentBlock) => void;
  first: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const format = (before: string, after = before, placeholder = "文字") => {
    const field = ref.current;
    if (!field) return;
    const start = field.selectionStart,
      end = field.selectionEnd;
    const selected = block.text.slice(start, end) || placeholder;
    change({
      ...block,
      text:
        block.text.slice(0, start) +
        before +
        selected +
        after +
        block.text.slice(end),
    });
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(
        start + before.length,
        start + before.length + selected.length,
      );
    });
  };
  return (
    <>
      <div className="learn-text-tools" aria-label="文字格式">
        <button
          type="button"
          title="粗体"
          aria-label="粗体"
          onClick={() => format("**")}
        >
          <Bold size={15} />
        </button>
        <button
          type="button"
          title="斜体"
          aria-label="斜体"
          onClick={() => format("*")}
        >
          <Italic size={15} />
        </button>
        <button
          type="button"
          title="列表"
          aria-label="列表"
          onClick={() => format("\n- ", "")}
        >
          <List size={16} />
        </button>
        <button
          type="button"
          title="插入行内公式"
          aria-label="插入行内公式"
          onClick={() => format("$", "$", "x^2")}
        >
          ƒ
        </button>
        <small>支持 Markdown · $公式$</small>
      </div>
      <textarea
        ref={ref}
        aria-label={first ? "课时正文" : "正文内容"}
        data-lesson-field={first ? "content" : undefined}
        rows={8}
        maxLength={8000}
        value={block.text}
        placeholder="写下讲解内容…"
        onChange={(e) => change({ ...block, text: e.target.value })}
      />
    </>
  );
}
export function RichContentEditor({
  blocks,
  experiment,
  onChange,
}: {
  blocks: ContentBlock[];
  experiment?: ExperimentConfig;
  onChange: (blocks: ContentBlock[]) => void;
}) {
  const [preview, setPreview] = useState(false);
  const [diagramId, setDiagramId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.closest(".learn-lesson-form-main")?.scrollTo({ top: 0 });
  }, [diagramId]);
  const change = (next: ContentBlock) =>
    onChange(blocks.map((block) => (block.id === next.id ? next : block)));
  const move = (index: number, offset: number) => {
    const next = [...blocks];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  };
  const diagram = blocks.find(
    (block) => block.id === diagramId && block.type === "diagram",
  ) as Extract<ContentBlock, { type: "diagram" }> | undefined;
  if (diagram)
    return (
      <div className="learn-diagram-editor" ref={rootRef}>
        <button
          type="button"
          className="learn-button text compact"
          onClick={() => setDiagramId(null)}
        >
          <ArrowLeft size={15} />
          返回内容编排
        </button>
        <h3>编辑图解</h3>
        <div className="learn-diagram-editor-grid">
          <div>
            <label>
              图解类型
              <input value="流程图" readOnly />
            </label>
            <label>
              图解标题
              <input
                maxLength={120}
                value={diagram.title}
                onChange={(e) => change({ ...diagram, title: e.target.value })}
              />
            </label>
            <label>
              排列方向
              <SelectField
                value={diagram.direction}
                onChange={(e) =>
                  change({
                    ...diagram,
                    direction: e.target.value as "horizontal" | "vertical",
                  })
                }
              >
                <option value="horizontal">从左到右</option>
                <option value="vertical">从上到下</option>
              </SelectField>
            </label>
            <div className="learn-block-toolbar">
              <strong>节点 · {diagram.nodes.length} / 8</strong>
              <button
                type="button"
                className="learn-button compact"
                disabled={diagram.nodes.length >= 8}
                onClick={() =>
                  change({
                    ...diagram,
                    nodes: [...diagram.nodes, { label: "", description: "" }],
                  })
                }
              >
                <Plus size={14} />
                添加节点
              </button>
            </div>
            <ol className="learn-diagram-node-editor">
              {diagram.nodes.map((node, i) => (
                <li key={i}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <input
                      aria-label={`节点 ${i + 1} 文字`}
                      placeholder="节点文字"
                      maxLength={80}
                      value={node.label}
                      onChange={(e) =>
                        change({
                          ...diagram,
                          nodes: diagram.nodes.map((n, j) =>
                            i === j ? { ...n, label: e.target.value } : n,
                          ),
                        })
                      }
                    />
                    <input
                      aria-label={`节点 ${i + 1} 说明`}
                      placeholder="说明（可选）"
                      maxLength={160}
                      value={node.description}
                      onChange={(e) =>
                        change({
                          ...diagram,
                          nodes: diagram.nodes.map((n, j) =>
                            i === j ? { ...n, description: e.target.value } : n,
                          ),
                        })
                      }
                    />
                  </div>
                  <div className="learn-node-actions">
                    <button
                      type="button"
                      aria-label={`上移节点 ${i + 1}`}
                      disabled={i === 0}
                      onClick={() => {
                        const nodes = [...diagram.nodes];
                        [nodes[i - 1], nodes[i]] = [nodes[i], nodes[i - 1]];
                        change({ ...diagram, nodes });
                      }}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`下移节点 ${i + 1}`}
                      disabled={i === diagram.nodes.length - 1}
                      onClick={() => {
                        const nodes = [...diagram.nodes];
                        [nodes[i + 1], nodes[i]] = [nodes[i], nodes[i + 1]];
                        change({ ...diagram, nodes });
                      }}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`删除节点 ${i + 1}`}
                      disabled={diagram.nodes.length <= 2}
                      onClick={() =>
                        change({
                          ...diagram,
                          nodes: diagram.nodes.filter((_, j) => i !== j),
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <label>
              图解说明（可选）
              <textarea
                rows={3}
                maxLength={500}
                value={diagram.caption}
                onChange={(e) =>
                  change({ ...diagram, caption: e.target.value })
                }
              />
            </label>
          </div>
          <div className="learn-diagram-live-preview">
            <span className="learn-eyebrow">学生预览</span>
            <Diagram block={diagram} />
          </div>
        </div>
      </div>
    );
  return (
    <div className="learn-rich-editor" ref={rootRef}>
      <div className="learn-block-toolbar">
        <h3>教学内容</h3>
        <div>
          <button
            type="button"
            className="learn-button compact"
            aria-pressed={preview}
            onClick={() => setPreview(!preview)}
          >
            {preview ? <Pencil size={14} /> : <Eye size={14} />}
            {preview ? "继续编辑" : "预览内容"}
          </button>
          <details ref={menuRef} className="learn-add-block">
            <summary className="learn-button primary compact">
              <Plus size={15} />
              添加内容
            </summary>
            <div>
              {(Object.keys(labels) as ContentBlock["type"][]).map((type) => (
                <button
                  type="button"
                  key={type}
                  disabled={blocks.length >= 20}
                  onClick={() => {
                    const block = newBlock(type);
                    onChange([...blocks, block]);
                    setPreview(false);
                    menuRef.current?.removeAttribute("open");
                    requestAnimationFrame(() => {
                      const added = rootRef.current?.querySelector<HTMLElement>(
                        `[data-block-id="${block.id}"]`,
                      );
                      added?.scrollIntoView({ block: "nearest" });
                      (
                        added?.querySelector<HTMLElement>("textarea, input") ??
                        added?.querySelector<HTMLElement>(
                          "button:not(:disabled)",
                        )
                      )?.focus();
                    });
                  }}
                >
                  {labels[type]}
                </button>
              ))}
            </div>
          </details>
        </div>
      </div>
      {preview ? (
        <div className="learn-rich-editor-preview">
          <RichLesson blocks={blocks} experiment={experiment} />
        </div>
      ) : (
        <div className="learn-edit-blocks">
          {blocks.map((block, index) => (
            <section
              className={`learn-edit-block type-${block.type}`}
              data-block-id={block.id}
              key={block.id}
              aria-label={`内容块 ${index + 1}：${labels[block.type]}`}
            >
              <div className="learn-edit-block-heading">
                <span className="learn-block-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="learn-block-type">{labels[block.type]}</span>
                <div className="learn-block-actions">
                  <button
                    type="button"
                    aria-label={`上移内容块 ${index + 1}`}
                    title="上移"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`下移内容块 ${index + 1}`}
                    title="下移"
                    disabled={index === blocks.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`复制内容块 ${index + 1}`}
                    title="复制"
                    disabled={blocks.length >= 20}
                    onClick={() =>
                      onChange([
                        ...blocks.slice(0, index + 1),
                        { ...structuredClone(block), id: crypto.randomUUID() },
                        ...blocks.slice(index + 1),
                      ])
                    }
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`删除内容块 ${index + 1}`}
                    title="删除"
                    disabled={blocks.length <= 1}
                    onClick={() =>
                      onChange(blocks.filter((item) => item.id !== block.id))
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="learn-edit-block-body">
                {block.type === "text" ? (
                  <TextBlockEditor
                    block={block}
                    change={change}
                    first={index === 0}
                  />
                ) : block.type === "formula" ? (
                  <FormulaEditor
                    block={block}
                    experiment={experiment}
                    onChange={change}
                  />
                ) : block.type === "diagram" ? (
                  <>
                    <Diagram block={block} />
                    <button
                      type="button"
                      className="learn-button text compact"
                      onClick={() => setDiagramId(block.id)}
                    >
                      <Pencil size={14} />
                      编辑图解
                    </button>
                  </>
                ) : block.type === "code" ? (
                  <>
                    <label>
                      代码语言
                      <input
                        maxLength={40}
                        placeholder="例如 Python"
                        value={block.language}
                        onChange={(e) =>
                          change({ ...block, language: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>
                        <Code size={14} /> 代码示例
                      </span>
                      <textarea
                        className="learn-code-input"
                        rows={10}
                        maxLength={4000}
                        value={block.code}
                        onChange={(e) =>
                          change({ ...block, code: e.target.value })
                        }
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label>
                      提示标题
                      <input
                        maxLength={80}
                        value={block.title}
                        onChange={(e) =>
                          change({ ...block, title: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      提示内容
                      <textarea
                        rows={8}
                        maxLength={2000}
                        value={block.text}
                        onChange={(e) =>
                          change({ ...block, text: e.target.value })
                        }
                      />
                    </label>
                  </>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
      <small className="learn-muted">
        {blocks.length} / 20 个内容块 · 使用上下箭头调整顺序
      </small>
    </div>
  );
}
