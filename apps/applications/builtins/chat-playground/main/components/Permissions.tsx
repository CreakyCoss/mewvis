import { useEffect, useRef, useState } from "react";
import { ArrowRight, RefreshCw, ShieldCheck } from "lucide-react";
import {
  getApplicationToolClient,
  type ApplicationTool,
} from "@mewvis/app-sdk/tools";
import type { ChatPermissionMode } from "@mewvis/app-sdk/chat";
import type { ChatPreset } from "../ChatLab";
import { Feedback, PageHeading, Section, errorText } from "./Example";

const modes: {
  value: ChatPermissionMode;
  label: string;
  description: string;
}[] = [
  {
    value: "ask",
    label: "逐步确认",
    description: "低风险直接执行，中、高风险需审批。",
  },
  {
    value: "auto",
    label: "帮我批准",
    description: "低、中风险直接执行，高风险需审批。",
  },
  {
    value: "full",
    label: "全部放行",
    description: "自动通过已声明的风险，仍受访问范围限制。",
  },
];
const riskLabels = { low: "低风险", medium: "中风险", high: "高风险" };

export function Permissions({
  openChat,
}: {
  openChat(preset: ChatPreset): void;
}) {
  const [mode, setMode] = useState<ChatPermissionMode>("ask");
  const [tools, setTools] = useState<ApplicationTool[]>([]);
  const [all, setAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const load = async () => {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const next = await getApplicationToolClient().list();
      if (current === generation.current) setTools(next);
    } catch (error) {
      if (current === generation.current) setError(errorText(error));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, []);
  const visibleTools = all
    ? tools
    : tools.filter((tool) => tool.source === "application");
  return (
    <>
      <PageHeading
        title="理解授权如何影响一次执行"
        description="先查看工具是否获准使用，再在对话中体验执行权限与宿主审批。"
      />
      <section className="showcase-panel showcase-panel-body">
        <span className="showcase-kicker">交互示例 · 中风险工具</span>
        <h2>同一个工具，不同的执行档位</h2>
        <p className="showcase-muted">
          示例工具只回显文本，特意声明为中风险，用来观察审批过程。
        </p>
        <div className="showcase-permission-modes" aria-label="审批示例档位">
          {modes.map((item) => (
            <button
              type="button"
              key={item.value}
              aria-pressed={mode === item.value}
              onClick={() => setMode(item.value)}
            >
              <ShieldCheck aria-hidden="true" />
              <strong>
                {item.label}
                <code>{item.value}</code>
              </strong>
              <span>{item.description}</span>
            </button>
          ))}
        </div>
        <div className="showcase-permission-expectation">
          <strong>预期行为</strong>
          <p>
            {mode === "ask"
              ? "发送后，Agent 调用中风险工具时，会等待宿主窗口审批。"
              : "发送后，中风险工具可直接执行，不应出现此次风险审批。"}
          </p>
          <p className="showcase-muted">
            先在应用管理中允许 chat_playground_medium_risk。网页的直接 SDK
            调用不经过 Agent 审批。
          </p>
        </div>
        <button
          type="button"
          className="showcase-button is-primary"
          onClick={() =>
            openChat({
              label: "中风险工具 · " + mode,
              permissionMode: mode,
              text: "请调用 chat_playground_medium_risk，text 设为“中风险审批测试”，然后说明实际返回的文本和字符数。",
            })
          }
        >
          在对话中体验
          <ArrowRight />
        </button>
      </section>
      <Section
        title="当前工具授权"
        description="只读查询宿主当前授权；需要调整时，请前往应用管理。"
      >
        <div className="showcase-actions">
          <button
            type="button"
            className="showcase-button"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw />
            {loading ? "查询中…" : "刷新授权"}
          </button>
          <button
            type="button"
            className="showcase-text-button"
            aria-pressed={all}
            onClick={() => setAll(!all)}
          >
            {all ? "只看应用工具" : "同时查看宿主工具"}
          </button>
        </div>
        <Feedback error={error} />
        <ul className="showcase-tool-list" aria-label="当前工具授权">
          {visibleTools.map((tool) => (
            <li key={tool.name}>
              <div>
                <strong>{tool.label}</strong>
                <code>{tool.name}</code>
              </div>
              <span>
                {tool.risk ? riskLabels[tool.risk] : "按实际操作判断"}
              </span>
              <span
                className={tool.enabled ? "showcase-success" : "showcase-muted"}
              >
                {tool.enabled ? "已允许" : "未授权"}
              </span>
            </li>
          ))}
        </ul>
        {!loading && !error && !visibleTools.length && (
          <p className="showcase-muted">当前没有可展示的工具。</p>
        )}
      </Section>
    </>
  );
}
