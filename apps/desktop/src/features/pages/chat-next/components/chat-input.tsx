import { useId, useState, type FormEvent } from "react";
import { SendIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

export type ChatInputSubmitPayload = {
  text: string;
};

type ChatInputProps = {
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  onSubmit: (payload: ChatInputSubmitPayload) => void;
};

export const ChatInput = ({
  defaultValue = "",
  placeholder = "输入问题",
  disabled = false,
  onSubmit,
}: ChatInputProps) => {
  const inputId = useId();
  const [value, setValue] = useState(defaultValue);
  const canSubmit = !disabled && Boolean(value.trim());

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    onSubmit({ text: value });
    setValue("");
  };

  return (
    <form className="mx-auto w-full max-w-[69rem]" onSubmit={submit}>
      <InputGroup className="h-auto flex-col items-stretch overflow-hidden rounded-xl border-0 bg-card shadow-[0_14px_34px_-30px_rgb(15_23_42_/_0.34),0_2px_8px_-7px_rgb(15_23_42_/_0.18),0_1px_2px_rgb(15_23_42_/_0.06)] ring-1 ring-border/50 transition-shadow duration-200 has-[[data-slot=input-group-control]:focus-visible]:border-transparent has-[[data-slot=input-group-control]:focus-visible]:ring-3 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/20 dark:bg-card">
        <label htmlFor={inputId} className="sr-only">
          对话内容
        </label>
        <InputGroupTextarea
          id={inputId}
          value={value}
          rows={3}
          placeholder={placeholder}
          disabled={disabled}
          className="max-h-48 min-h-28 w-full px-4 py-4 text-base leading-6 placeholder:text-muted-foreground/70"
          onChange={(event) => setValue(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />

        <InputGroupAddon align="block-end" className="min-h-12 justify-between gap-3 px-3 pt-0 pb-3 font-normal">
          <span className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
            <KbdGroup>
              <Kbd>Ctrl</Kbd>
              <span>/</span>
              <Kbd>⌘</Kbd>
              <Kbd>Enter</Kbd>
            </KbdGroup>
            <span>发送</span>
          </span>
          <InputGroupButton
            type="submit"
            size="icon-sm"
            variant="outline"
            disabled={!canSubmit}
            aria-label="发送消息"
            className="size-10 cursor-pointer rounded-lg shadow-xs"
          >
            <SendIcon aria-hidden="true" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
};
