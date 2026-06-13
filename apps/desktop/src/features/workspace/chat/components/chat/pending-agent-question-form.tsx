import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PendingAgentQuestion } from "../../page-types";

type PendingAgentQuestionFormProps = {
  pendingAgentQuestion: PendingAgentQuestion;
  agentQuestionAnswer: string;
  customAgentQuestionAnswer: string;
  isAnsweringAgentQuestion: boolean;
  onAnswerAgentQuestion: (event: FormEvent<HTMLFormElement>) => void;
  onAgentQuestionAnswerChange: Dispatch<SetStateAction<string>>;
  onCustomAgentQuestionAnswerChange: Dispatch<SetStateAction<string>>;
  onSubmitAgentQuestionAnswer: (answerValue: string) => Promise<void>;
};

export const PendingAgentQuestionForm = ({
  pendingAgentQuestion,
  agentQuestionAnswer,
  customAgentQuestionAnswer,
  isAnsweringAgentQuestion,
  onAnswerAgentQuestion,
  onAgentQuestionAnswerChange,
  onCustomAgentQuestionAnswerChange,
  onSubmitAgentQuestionAnswer,
}: PendingAgentQuestionFormProps) => (
  <form
    action="#"
    className="mx-auto mb-3 max-w-5xl rounded-md border border-primary/25 bg-primary/10 p-3 shadow-xs"
    onSubmit={(event) => void onAnswerAgentQuestion(event)}
  >
    <div className="mb-2 flex items-start gap-2">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-background text-primary">
        <MessageSquare className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">
          {pendingAgentQuestion.input?.label || "Agent 需要你的回答"}
        </div>
        {pendingAgentQuestion.context && (
          <div className="mt-1 text-xs leading-5 text-muted-foreground">
            {pendingAgentQuestion.context}
          </div>
        )}
        <div className="mt-1 whitespace-pre-wrap text-sm leading-6">
          {pendingAgentQuestion.question}
        </div>
      </div>
    </div>
    {pendingAgentQuestion.input?.type === "select" &&
    (pendingAgentQuestion.input.options?.length ?? 0) > 0 ? (
      <div className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          {(pendingAgentQuestion.input.options ?? []).map((option) => {
            const isSelected = agentQuestionAnswer === option.value;
            const isOther = option.value === "other";

            return (
              <button
                key={option.value}
                type="button"
                className={[
                  "rounded-md border bg-background px-3 py-2 text-left text-sm shadow-xs transition-colors hover:border-primary/45 hover:bg-primary/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  isSelected ? "border-primary bg-primary/10 text-primary" : "border-border",
                ].join(" ")}
                disabled={isAnsweringAgentQuestion}
                onClick={() => {
                  onAgentQuestionAnswerChange(option.value);
                  if (!isOther) {
                    void onSubmitAgentQuestionAnswer(option.value);
                  }
                }}
              >
                <span className="block font-medium">{option.label}</span>
                {option.description && (
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {option.description}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {agentQuestionAnswer === "other" && (
          <div className="flex items-end gap-2">
            <Textarea
              value={customAgentQuestionAnswer}
              onChange={(event) => onCustomAgentQuestionAnswerChange(event.currentTarget.value)}
              placeholder="请输入自定义答案"
              rows={2}
              className="min-h-14 flex-1 resize-none bg-background shadow-xs"
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <Button
              type="submit"
              disabled={isAnsweringAgentQuestion || !customAgentQuestionAnswer.trim()}
            >
              {isAnsweringAgentQuestion ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              <span>回复</span>
            </Button>
          </div>
        )}
      </div>
    ) : (
      <div className="flex items-end gap-2">
        <Textarea
          value={agentQuestionAnswer}
          onChange={(event) => onAgentQuestionAnswerChange(event.currentTarget.value)}
          placeholder="直接回答这个问题，Agent 会继续执行"
          rows={2}
          className="min-h-14 flex-1 resize-none bg-background shadow-xs"
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <Button
          type="submit"
          disabled={isAnsweringAgentQuestion || !agentQuestionAnswer.trim()}
        >
          {isAnsweringAgentQuestion ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          <span>回复</span>
        </Button>
      </div>
    )}
  </form>
);
