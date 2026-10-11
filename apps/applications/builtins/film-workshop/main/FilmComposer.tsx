import { useState } from "react";
import {
  ChevronDown,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Square,
} from "lucide-react";
import { Chat, useChatComposer } from "@mewvis/app-sdk/chat/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "design-system/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "design-system/components/ui/popover";

const permissionAppearance = {
  ask: { icon: ShieldQuestion, summary: "高风险或未知操作先询问" },
  auto: { icon: ShieldCheck, summary: "常规操作自动批准" },
  full: { icon: ShieldAlert, summary: "更广范围内自动执行" },
} as const;

// Same structure, dimensions and controls as Story Workshop's sw-composer.
// The public Chat binding retains draft, model, permission, send and stop behavior.
export function FilmComposer({
  source,
  placeholder,
  disabled = false,
  onSubmitting,
}: {
  source: string;
  placeholder: string;
  disabled?: boolean;
  onSubmitting?: (value: boolean) => void;
}) {
  const binding = useChatComposer();
  const [error, setError] = useState("");
  const models = binding.controls.resources.models ?? [];
  const selectedModelId = binding.controls.options.selectedModelId;
  const model = models.find((item) => item.value === selectedModelId);
  const modelName = model?.selectedLabel || model?.label || "暂无可用模型";
  const permissions = binding.controls.resources.permissionOptions ?? [];
  const mode = binding.controls.options.permissionMode;
  const permission = permissions.find((item) => item.mode === mode);
  const PermissionIcon = mode ? permissionAppearance[mode].icon : Shield;
  const send = async () => {
    if (disabled || !binding.canSubmit || binding.disabled) return;
    setError("");
    onSubmitting?.(true);
    try {
      const result = await binding.submit();
      if (result.status === "rejected")
        setError(result.reason || "发送失败，请重试。");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      onSubmitting?.(false);
    }
  };
  return (
    <div className="film-composer-area">
      <Chat.Error />
      <Chat.Question />
      {error && (
        <p className="film-error" role="alert">
          {error}
        </p>
      )}
      <div className="film-composer-context">
        <span title={source}>{source}</span>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button">查看上下文</button>
          </PopoverTrigger>
          <PopoverContent className="film-context-popup" align="end" side="top">
            <strong>创作上下文</strong>
            <p>
              当前项目、分集、创作步骤和所选镜头会自动提供给助手。较大的项目会使用摘要。
            </p>
            <small>{source}</small>
          </PopoverContent>
        </Popover>
      </div>
      <form
        className="film-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          aria-label="对话内容"
          placeholder={placeholder}
          value={binding.draft.text}
          disabled={disabled || !binding.initialized}
          onChange={(e) =>
            binding.setDraft({ text: e.target.value, blocks: [] })
          }
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="film-composer-controls">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="film-model-trigger"
                aria-label={`助手模型：${modelName}`}
                title={modelName}
                disabled={
                  disabled || binding.disabled || binding.busy || !models.length
                }
              >
                <span>{modelName}</span>
                <ChevronDown size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              side="top"
              className="film-popup film-model-menu"
            >
              <DropdownMenuRadioGroup
                value={selectedModelId}
                onValueChange={(value) =>
                  binding.controls.updateOptions({ selectedModelId: value })
                }
              >
                {models.map((item) => (
                  <DropdownMenuRadioItem key={item.value} value={item.value}>
                    {item.selectedLabel || item.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="film-permission-trigger"
                data-mode={mode ?? "unset"}
                aria-label={`工具权限：${permission?.label ?? "尚未加载"}`}
                title={permission?.description ?? "工具权限尚未加载"}
                disabled={disabled || binding.disabled || !permissions.length}
              >
                <PermissionIcon size={18} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              className="film-popup film-permission-menu"
            >
              <DropdownMenuLabel>工具权限</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={mode ?? ""}
                onValueChange={(value) => {
                  const item = permissions.find((p) => p.mode === value);
                  if (item)
                    binding.controls.updateOptions({
                      permissionMode: item.mode,
                    });
                }}
              >
                {permissions.map((item) => {
                  const appearance = permissionAppearance[item.mode];
                  const Icon = appearance.icon;
                  return (
                    <DropdownMenuRadioItem
                      key={item.mode}
                      value={item.mode}
                      className="film-permission-option"
                      title={item.description}
                    >
                      <Icon size={18} />
                      <span>
                        <strong>{item.label}</strong>
                        <small>{appearance.summary}</small>
                      </span>
                    </DropdownMenuRadioItem>
                  );
                })}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {binding.busy ? (
            <button
              type="button"
              className="film-send"
              aria-label="停止生成"
              onClick={() =>
                void binding
                  .stop()
                  .then((result) => {
                    if (!result.ok) setError(result.error);
                  })
                  .catch((e) => setError(String(e)))
              }
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              // The application sandbox disallows native form submission.
              // Dispatch through the public Chat binding, as SDK Composer does.
              type="button"
              className="film-send"
              aria-label="发送消息"
              disabled={disabled || !binding.canSubmit || binding.disabled}
              onClick={() => void send()}
            >
              <Send size={18} />
            </button>
          )}
        </div>
      </form>
      {binding.resume && binding.execution?.state === "paused" && (
        <button type="button" onClick={() => void binding.resume?.()}>
          继续生成
        </button>
      )}
      {!models.length && binding.initialized && (
        <p className="film-muted">请先在主应用中配置可用模型。</p>
      )}
    </div>
  );
}
