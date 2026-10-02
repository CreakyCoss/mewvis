import { useEffect, useRef, useState } from "react";
import type { ApplicationChatSummary } from "@isle/app-sdk/chat";
import { History, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "design-system/components/ui/dropdown-menu";
import {
  errorText,
  listDeveloperSessions,
  type DeveloperSessionOptions,
} from "./api";

const formatCreatedAt = (createdAt: number) =>
  new Date(createdAt).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export function WorkshopChatHistory({
  projectId,
  sessionId,
  disabled,
  onChange,
}: {
  projectId: string;
  sessionId?: string;
  disabled: boolean;
  onChange(options: DeveloperSessionOptions): void;
}) {
  const [history, setHistory] = useState<ApplicationChatSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [projectId],
  );
  const loadHistory = async () => {
    const version = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const chats = await listDeveloperSessions(projectId);
      if (version === generation.current) setHistory(chats);
    } catch (value) {
      if (version === generation.current) setError(errorText(value));
    } finally {
      if (version === generation.current) setLoading(false);
    }
  };
  return (
    <div className="wk-chat-session-actions">
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) void loadHistory();
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="wk-icon-button"
            aria-label="会话历史"
            title="会话历史"
            disabled={disabled}
          >
            <History aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className="wk-chat-history-menu"
        >
          <DropdownMenuLabel className="wk-chat-history-heading">
            <strong>会话历史</strong>
            <span>本小应用</span>
          </DropdownMenuLabel>
          {loading ? (
            <p className="wk-chat-history-empty" role="status">
              正在读取…
            </p>
          ) : error ? (
            <>
              <p className="wk-chat-history-empty" role="alert">
                {error}
              </p>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  void loadHistory();
                }}
              >
                重新读取
              </DropdownMenuItem>
            </>
          ) : history.length ? (
            <div className="wk-chat-history-list">
              {history.map((item) => (
                <DropdownMenuItem
                  key={item.chatId}
                  className="wk-chat-history-item"
                  aria-current={item.chatId === sessionId ? "true" : undefined}
                  onSelect={() => {
                    if (!disabled && item.chatId !== sessionId)
                      onChange({ chatId: item.chatId });
                  }}
                >
                  <span
                    className="wk-chat-history-title"
                    title={item.title || "新会话"}
                  >
                    {item.title || "新会话"}
                  </span>
                  <span className="wk-chat-history-meta">
                    <time dateTime={new Date(item.createdAt).toISOString()}>
                      创建于 {formatCreatedAt(item.createdAt)}
                    </time>
                    {item.chatId === sessionId && <em>当前</em>}
                  </span>
                </DropdownMenuItem>
              ))}
            </div>
          ) : (
            <p className="wk-chat-history-empty">暂无会话历史</p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        className="wk-icon-button"
        aria-label="新建会话"
        title="新建会话"
        disabled={disabled}
        onClick={() => onChange({ fresh: true })}
      >
        <Plus aria-hidden="true" />
      </button>
    </div>
  );
}
