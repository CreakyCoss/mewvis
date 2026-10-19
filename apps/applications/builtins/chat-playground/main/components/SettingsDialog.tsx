import { useId, useState } from "react";
import {
  Braces,
  CheckCircle2,
  Circle,
  FileText,
  Info,
  MessageSquare,
  Monitor,
  Power,
  RefreshCw,
  RotateCcw,
  Save,
} from "lucide-react";
import type {
  ApplicationChatSession,
  OperationResult,
} from "@mewvis/app-sdk/chat";
import { useChatSnapshot } from "@mewvis/app-sdk/chat/react";
import { LabDialog } from "./LabDialog";
import { errorText } from "./Example";
import customPreview from "../assets/chat-custom.webp";
import defaultPreview from "../assets/chat-default.webp";

type Section = "display" | "context" | "session" | "snapshot";
const sections = [
  { id: "display", label: "界面显示", icon: Monitor, group: "设置" },
  { id: "context", label: "业务上下文", icon: FileText },
  { id: "session", label: "会话状态", icon: MessageSquare, group: "调试" },
  { id: "snapshot", label: "运行快照", icon: Braces },
] as const;

export function SettingsDialog({
  session,
  open,
  onClose,
  mode,
  onModeChange,
  compare,
  onCompareChange,
  visible,
  onVisibleChange,
}: {
  session: ApplicationChatSession;
  open: boolean;
  onClose(): void;
  mode: "custom" | "default";
  onModeChange(mode: "custom" | "default"): void;
  compare: boolean;
  onCompareChange(value: boolean): void;
  visible: boolean;
  onVisibleChange(value: boolean): void;
}) {
  const state = useChatSnapshot();
  const [section, setSection] = useState<Section>("display");
  const [context, setContext] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const contextId = useId();
  const headingId = useId();
  const model =
    state.resources.models?.find(
      (model) => model.value === state.config.selectedModelId,
    )?.label ||
    state.config.selectedModelId ||
    "未选择模型";
  const saveState = state.saveError
    ? "保存失败"
    : state.dirty
      ? "待保存"
      : "已同步";
  const run = async (
    label: string,
    action: () => Promise<OperationResult | void>,
  ) => {
    if (pending) return;
    setPending(label);
    setNotice("");
    setError("");
    try {
      const result = await action();
      if (result && !result.ok) throw new Error(result.error);
      setNotice(`${label}完成`);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setPending("");
    }
  };
  const title = sections.find((item) => item.id === section)!.label;
  return (
    <LabDialog
      open={open}
      title="调试与设置"
      className="lab-settings-dialog"
      onClose={onClose}
    >
      <div className="lab-settings-layout">
        <nav className="lab-settings-nav" aria-label="调试设置分组">
          <div className="lab-settings-links">
            {sections.map((item) => (
              <div key={item.id}>
                {"group" in item && (
                  <p className="lab-settings-group">{item.group}</p>
                )}
                <button
                  type="button"
                  aria-current={section === item.id ? "page" : undefined}
                  onClick={() => {
                    setSection(item.id);
                    setNotice("");
                    setError("");
                  }}
                >
                  <item.icon aria-hidden="true" />
                  {item.label}
                </button>
              </div>
            ))}
          </div>
          <div className="lab-settings-status">
            <span className="lab-status" data-phase={state.phase}>
              <i aria-hidden="true" />
              {state.phase === "closed"
                ? "已关闭"
                : state.activeTaskId
                  ? "任务进行中"
                  : state.phase === "idle"
                    ? "就绪"
                    : "会话处理中"}
            </span>
            <span title={`${model} · ${saveState}`}>
              {model} · {saveState}
            </span>
          </div>
        </nav>
        <div className="lab-settings-main">
          <section className="lab-settings-content" aria-labelledby={headingId}>
            <header className="lab-settings-page-heading">
              <h3 id={headingId}>{title}</h3>
              <p className="lab-help">
                {section === "display"
                  ? "选择聊天布局，管理视图的显示方式。"
                  : section === "context"
                    ? "为后续请求补充业务信息与回答要求。"
                    : section === "session"
                      ? "检查当前会话，管理资源与保存状态。"
                      : "查看当前会话的实时状态与配置。"}
              </p>
            </header>
            {section === "display" && (
              <>
                <h4 className="lab-settings-subheading">聊天界面</h4>
                <div
                  className="lab-mode-options"
                  role="group"
                  aria-label="聊天界面模式"
                >
                  {(
                    [
                      {
                        value: "custom",
                        label: "定制界面",
                        description: "应用自定义布局",
                        preview: customPreview,
                      },
                      {
                        value: "default",
                        label: "默认界面",
                        description: "SDK 默认聊天布局",
                        preview: defaultPreview,
                      },
                    ] as const
                  ).map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      className="lab-mode-option"
                      aria-pressed={mode === option.value}
                      onClick={() => onModeChange(option.value)}
                    >
                      <img
                        src={option.preview}
                        alt=""
                        className="lab-mode-preview"
                      />
                      <span className="lab-mode-option-label">
                        {mode === option.value ? (
                          <CheckCircle2 aria-hidden="true" />
                        ) : (
                          <Circle aria-hidden="true" />
                        )}
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                    </button>
                  ))}
                </div>
                <p className="lab-help lab-mode-help">
                  切换布局时保留同一会话与主视图草稿。
                </p>
                <div className="lab-display-options">
                  <label className="lab-setting-toggle">
                    <span>
                      <strong>双视图对照</strong>
                      <small>在两个视图中观察同一会话；窄窗可切换查看。</small>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={compare}
                      onChange={(event) =>
                        onCompareChange(event.target.checked)
                      }
                    />
                  </label>
                  <label className="lab-setting-toggle">
                    <span>
                      <strong>隐藏聊天视图</strong>
                      <small>暂时卸载聊天界面，后台任务继续运行。</small>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={!visible}
                      onChange={(event) =>
                        onVisibleChange(!event.target.checked)
                      }
                    />
                  </label>
                </div>
              </>
            )}
            {section === "context" && (
              <div className="lab-settings-context">
                <label className="lab-context-label" htmlFor={contextId}>
                  本轮业务上下文
                </label>
                <textarea
                  id={contextId}
                  value={context}
                  maxLength={16000}
                  rows={8}
                  placeholder="例如：本轮请使用表格回答。"
                  disabled={state.phase !== "idle" || !!pending}
                  onChange={(event) => setContext(event.target.value)}
                />
                <div className="lab-context-footer">
                  <span>{context.length.toLocaleString()} / 16,000</span>
                  <button
                    className="lab-button lab-primary"
                    type="button"
                    disabled={state.phase !== "idle" || !!pending}
                    onClick={() =>
                      void run("应用上下文", () =>
                        session.setContext({ requestContext: context }),
                      )
                    }
                  >
                    应用到后续请求
                  </button>
                </div>
                <p className="lab-help">
                  上下文在宿主会话内生效；此输入不随应用页面重载恢复。
                </p>
              </div>
            )}
            {section === "session" && (
              <div className="lab-settings-session">
                <dl className="lab-metrics">
                  <div>
                    <dt>消息</dt>
                    <dd>{state.messages.length}</dd>
                  </div>
                  <div>
                    <dt>工具调用</dt>
                    <dd>
                      {state.messages.reduce(
                        (count, message) =>
                          count +
                          message.blocks.filter(
                            (block) => block.type === "tool",
                          ).length,
                        0,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>保存</dt>
                    <dd>{saveState}</dd>
                  </div>
                </dl>
                <dl className="lab-facts">
                  <dt>会话 ID</dt>
                  <dd>
                    <code>{session.identity.id}</code>
                  </dd>
                  <dt>任务 ID</dt>
                  <dd>{state.activeTaskId || "暂无任务"}</dd>
                  <dt>模型</dt>
                  <dd>{model}</dd>
                  <dt>已选能力</dt>
                  <dd>
                    技能 {state.config.selectedSkillKeys.length} · 可用工具{" "}
                    {state.resources.tools?.length ?? 0} · 知识库{" "}
                    {state.config.selectedKnowledgeCollectionIds.length}
                  </dd>
                </dl>
                <div className="lab-session-utilities">
                  <button
                    className="lab-button"
                    type="button"
                    disabled={!!pending || state.phase === "closed"}
                    onClick={() =>
                      void run("重新同步", () => session.reconnect())
                    }
                  >
                    <RotateCcw aria-hidden="true" />
                    重新同步
                  </button>
                  <button
                    className="lab-button"
                    type="button"
                    disabled={!!pending || state.phase !== "idle"}
                    onClick={() =>
                      void run("刷新资源", () => session.refreshResources())
                    }
                  >
                    <RefreshCw aria-hidden="true" />
                    刷新资源
                  </button>
                  <button
                    className="lab-button"
                    type="button"
                    disabled={!!pending || state.phase === "closed"}
                    onClick={() => void run("保存", () => session.retrySave())}
                  >
                    <Save aria-hidden="true" />
                    立即保存
                  </button>
                </div>
                {state.saveError && (
                  <p className="lab-error" role="alert">
                    {state.saveError}
                  </p>
                )}
                <div className="lab-close-session">
                  <div>
                    <h4>关闭会话</h4>
                    <p className="lab-help">
                      停止当前任务并保存，可从对话页重新连接。
                    </p>
                  </div>
                  <button
                    className="lab-button lab-danger"
                    type="button"
                    disabled={!!pending || state.phase === "closed"}
                    onClick={() => void run("关闭会话", () => session.close())}
                  >
                    <Power aria-hidden="true" />
                    关闭会话
                  </button>
                </div>
              </div>
            )}
            {section === "snapshot" && (
              <pre className="lab-runtime-snapshot">
                {JSON.stringify(
                  {
                    identity: state.identity,
                    phase: state.phase,
                    config: state.config,
                    activeTaskId: state.activeTaskId,
                    pendingQuestion: state.pendingQuestion,
                    dirty: state.dirty,
                    error: state.error,
                    saveError: state.saveError,
                  },
                  null,
                  2,
                )}
              </pre>
            )}
            {pending && (
              <p className="lab-help" role="status">
                正在{pending}…
              </p>
            )}
            {notice && (
              <p className="lab-notice" role="status">
                {notice}
              </p>
            )}
            {error && (
              <p className="lab-error" role="alert">
                {error}
              </p>
            )}
          </section>
          <footer className="lab-dialog-footer">
            <span className="lab-help">
              <Info aria-hidden="true" />
              {section === "context"
                ? "业务上下文需单独应用"
                : section === "display"
                  ? "界面设置即时生效"
                  : "仅展示当前会话信息"}
            </span>
            <button
              type="button"
              className="lab-button lab-primary"
              onClick={onClose}
            >
              完成
            </button>
          </footer>
        </div>
      </div>
    </LabDialog>
  );
}
