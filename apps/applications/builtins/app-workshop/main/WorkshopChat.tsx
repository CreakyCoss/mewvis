import type { ApplicationChatSession } from "@mewvis/app-sdk/chat";
import {
  Chat,
  useChatComposer,
  type ComposerBinding,
  type RenderMessage,
} from "@mewvis/app-sdk/chat/react";
import {
  ChevronDown,
  LoaderCircle,
  Play,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Square,
} from "lucide-react";
import { InputGroupButton } from "design-system/components/ui/input-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "design-system/components/ui/dropdown-menu";

const permissionAppearance = {
  ask: { icon: ShieldQuestion, summary: "高风险或未知操作先询问" },
  auto: { icon: ShieldCheck, summary: "常规操作自动批准" },
  full: { icon: ShieldAlert, summary: "更广范围内自动执行" },
} as const;

const renderMessage: RenderMessage = (message, content) => (
  <div className="wk-chat-message" data-speaker={message.role}>
    {content}
  </div>
);

function WorkshopInput(binding: ComposerBinding & { placeholder: string }) {
  return (
    <textarea
      className="wk-chat-input"
      aria-label="描述应用需求"
      placeholder={binding.placeholder}
      value={binding.draft.text}
      disabled={binding.disabled}
      onChange={(event) => {
        const text = event.target.value;
        binding.setDraft({ text, blocks: [{ type: "text", content: text }] });
      }}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" &&
          !event.shiftKey &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault();
          if (binding.canSubmit) void binding.submit();
        }
      }}
    />
  );
}

function WorkshopToolbar(binding: ComposerBinding) {
  const { resources, options, updateOptions } = binding.controls;
  const model = resources.models?.find(
    (item) => item.value === options.selectedModelId,
  );
  const permission = resources.permissionOptions?.find(
    (item) => item.mode === options.permissionMode,
  );
  const modelName = model?.selectedLabel || model?.label || "暂无可用模型";
  const PermissionIcon = options.permissionMode
    ? permissionAppearance[options.permissionMode].icon
    : Shield;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="wk-chat-model-trigger"
            disabled={binding.disabled || !resources.models?.length}
            aria-label={`助手模型：${modelName}`}
            title={modelName}
          >
            <span>{modelName}</span>
            <ChevronDown aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="top"
          className="wk-chat-model-menu"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <DropdownMenuRadioGroup
            value={options.selectedModelId}
            onValueChange={(selectedModelId) =>
              updateOptions({ selectedModelId })
            }
          >
            {resources.models?.map((item) => (
              <DropdownMenuRadioItem
                key={item.value}
                value={item.value}
                className="wk-chat-model-option"
              >
                <span>{item.selectedLabel || item.label}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="wk-chat-permission-trigger"
            data-mode={options.permissionMode ?? "unset"}
            disabled={binding.disabled || !resources.permissionOptions?.length}
            aria-label={`工具权限：${permission?.label ?? "尚未加载"}`}
            title={permission?.description ?? "工具权限尚未加载"}
          >
            <PermissionIcon aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="top"
          className="wk-chat-permission-menu"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <DropdownMenuLabel>工具权限</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={options.permissionMode ?? ""}
            onValueChange={(value) => {
              const item = resources.permissionOptions?.find(
                (option) => option.mode === value,
              );
              if (item) updateOptions({ permissionMode: item.mode });
            }}
          >
            {resources.permissionOptions?.map((item) => {
              const appearance = permissionAppearance[item.mode];
              const Icon = appearance.icon;
              return (
                <DropdownMenuRadioItem
                  key={item.mode}
                  value={item.mode}
                  data-mode={item.mode}
                  className="wk-chat-permission-option"
                  title={item.description}
                >
                  <span className="wk-chat-permission-option-icon">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="wk-chat-permission-option-text">
                    <strong>{item.label}</strong>
                    <small>{appearance.summary}</small>
                  </span>
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function WorkshopActions(binding: ComposerBinding) {
  const paused = binding.execution?.state === "paused";
  const cancelling = binding.execution?.state === "cancelling";
  const cancelFailed = cancelling && !!binding.execution?.cancelError;
  const pausing = binding.execution?.state === "pausing";
  const label = !binding.busy
    ? "发送需求"
    : paused
      ? "继续生成"
      : cancelFailed
        ? "重试取消"
        : cancelling
          ? "取消中"
          : pausing
            ? "暂停中，取消生成"
            : "停止生成";
  return (
    <InputGroupButton
      type="button"
      size="icon-sm"
      variant="default"
      className="wk-chat-send size-9 cursor-pointer rounded-full shadow-xs"
      aria-label={label}
      title={label}
      disabled={binding.busy ? cancelling && !cancelFailed : !binding.canSubmit}
      onClick={() => {
        if (!binding.busy) void binding.submit();
        else if (paused) void binding.resume?.();
        else void binding.stop();
      }}
    >
      {!binding.busy ? (
        <Send aria-hidden="true" />
      ) : paused ? (
        <Play aria-hidden="true" />
      ) : cancelling && !cancelFailed ? (
        <LoaderCircle aria-hidden="true" className="wk-spin" />
      ) : (
        <Square className="wk-chat-stop" aria-hidden="true" />
      )}
    </InputGroupButton>
  );
}

const composerSlots = {
  editor: WorkshopInput,
  toolbar: WorkshopToolbar,
  actions: WorkshopActions,
};

function WorkshopComposer({ name }: { name: string }) {
  const binding = useChatComposer();
  const timer = /计时|专注|timer|focus/i.test(name);
  return (
    <>
      <div className="wk-chat-suggestions" aria-label="需求建议">
        <button
          type="button"
          disabled={binding.disabled}
          onClick={() => {
            const text = timer
              ? "请把专注时长调整为 45 分钟，保留开始、暂停和重置功能。"
              : "请帮我完善这个应用的主要功能，让它更方便使用。";
            binding.setDraft({
              text,
              blocks: [{ type: "text", content: text }],
            });
          }}
        >
          {timer ? "调整专注时长" : "完善应用功能"}
        </button>
        <button
          type="button"
          disabled={binding.disabled}
          onClick={() => {
            const text = "请换一个更简洁的界面风格，保留现有功能。";
            binding.setDraft({
              text,
              blocks: [{ type: "text", content: text }],
            });
          }}
        >
          换个界面风格
        </button>
      </div>
      <Chat.Composer
        className="wk-chat-composer"
        placeholder="描述你想要的应用或调整…"
        slots={composerSlots}
      />
    </>
  );
}

export function WorkshopChat({
  session,
  projectId,
  name,
}: {
  session: ApplicationChatSession;
  projectId: string;
  name: string;
}) {
  return (
    <Chat.Provider session={session} viewId={`workshop:${projectId}`}>
      <Chat.Layout className="wk-chat">
        <Chat.Messages
          className="wk-chat-messages"
          renderMessage={renderMessage}
        />
        <Chat.Footer className="wk-chat-footer">
          <Chat.Error />
          <Chat.Question />
          <WorkshopComposer name={name} />
        </Chat.Footer>
      </Chat.Layout>
    </Chat.Provider>
  );
}
