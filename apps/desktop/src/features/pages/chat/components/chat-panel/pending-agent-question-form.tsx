import type { ChangeEvent, CompositionEvent, Dispatch, FormEvent, KeyboardEvent, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PendingAgentQuestion } from "../../types";

type PendingAgentQuestionFormProps = {
  pendingAgentQuestion: PendingAgentQuestion;
  agentQuestionAnswer: string;
  customAgentQuestionAnswer: string;
  isAnsweringAgentQuestion: boolean;
  onAgentQuestionAnswerChange: Dispatch<SetStateAction<string>>;
  onCustomAgentQuestionAnswerChange: Dispatch<SetStateAction<string>>;
  onSubmitAgentQuestionAnswer: (answerValue: string) => Promise<void>;
};

const useImeSafeDraft = (value: string, onValueChange: Dispatch<SetStateAction<string>>) => {
  const [draft, setDraft] = useState(value);
  const [isComposing, setIsComposing] = useState(false);
  const isComposingRef = useRef(false);

  useEffect(() => {
    if (!isComposingRef.current) {
      setDraft(value);
    }
  }, [value]);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.currentTarget.value;
    setDraft(nextValue);

    if (!isComposingRef.current) {
      onValueChange(nextValue);
    }
  };

  const handleCompositionStart = () => {
    isComposingRef.current = true;
    setIsComposing(true);
  };

  const handleCompositionEnd = (event: CompositionEvent<HTMLTextAreaElement>) => {
    isComposingRef.current = false;
    setIsComposing(false);

    const nextValue = event.currentTarget.value;
    setDraft(nextValue);
    onValueChange(nextValue);
  };

  return {
    draft,
    isComposing,
    isComposingRef,
    handleChange,
    handleCompositionStart,
    handleCompositionEnd,
  };
};

export const PendingAgentQuestionForm = ({
  pendingAgentQuestion,
  agentQuestionAnswer,
  customAgentQuestionAnswer,
  isAnsweringAgentQuestion,
  onAgentQuestionAnswerChange,
  onCustomAgentQuestionAnswerChange,
  onSubmitAgentQuestionAnswer,
}: PendingAgentQuestionFormProps) => {
  const answerDraft = useImeSafeDraft(agentQuestionAnswer, onAgentQuestionAnswerChange);
  const customAnswerDraft = useImeSafeDraft(customAgentQuestionAnswer, onCustomAgentQuestionAnswerChange);
  const isAnyAnswerComposing = answerDraft.isComposing || customAnswerDraft.isComposing;
  const isOtherAnswer = agentQuestionAnswer === "other";
  const answerValue = isOtherAnswer ? customAnswerDraft.draft : answerDraft.draft;
  const selectOptions = pendingAgentQuestion.input?.type === "select" ? (pendingAgentQuestion.input.options ?? []) : [];
  const hasSelectOptions = selectOptions.length > 0;

  const submitAnswer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (answerDraft.isComposingRef.current || customAnswerDraft.isComposingRef.current) {
      return;
    }

    void onSubmitAgentQuestionAnswer(answerValue);
  };

  const requestSubmitFromTextarea = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <form
      action="#"
      className="app-panel mx-auto mb-3 w-full max-w-5xl overflow-hidden rounded-2xl border-primary/25"
      onSubmit={submitAnswer}
    >
      <div className="flex items-start gap-3 border-b border-border/60 bg-primary/5 px-4 py-3.5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
          <MessageSquare className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="text-sm font-medium text-foreground">
            {pendingAgentQuestion.input?.label || "Agent 需要你的回答"}
          </div>
          {pendingAgentQuestion.context && (
            <div className="mt-1 max-h-24 overflow-y-auto break-words pr-1 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
              {pendingAgentQuestion.context}
            </div>
          )}
          <div className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-words pr-1 text-sm leading-6 [overflow-wrap:anywhere]">
            {pendingAgentQuestion.question}
          </div>
        </div>
      </div>

      <div className="app-canvas px-4 py-4">
        {hasSelectOptions ? (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {selectOptions.map((option) => {
                const isSelected = agentQuestionAnswer === option.value;
                const isOther = option.value === "other";

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={[
                      "min-h-11 min-w-0 rounded-xl border bg-surface-raised px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/45 hover:bg-primary/10 focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none",
                      isSelected
                        ? "border-primary/40 bg-primary/10 text-primary ring-2 ring-primary/20"
                        : "border-border",
                    ].join(" ")}
                    disabled={isAnsweringAgentQuestion}
                    onClick={() => {
                      onAgentQuestionAnswerChange(option.value);
                      if (!isOther) {
                        void onSubmitAgentQuestionAnswer(option.value);
                      }
                    }}
                  >
                    <span className="block break-words font-medium [overflow-wrap:anywhere]">{option.label}</span>
                    {option.description && (
                      <span className="mt-1 block break-words text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                        {option.description}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {agentQuestionAnswer === "other" && (
              <div className="space-y-2">
                <div className="flex min-w-0 items-end gap-2">
                  <Textarea
                    id="agent-question-custom-answer"
                    value={customAnswerDraft.draft}
                    onChange={customAnswerDraft.handleChange}
                    onCompositionStart={customAnswerDraft.handleCompositionStart}
                    onCompositionEnd={customAnswerDraft.handleCompositionEnd}
                    placeholder="请输入自定义答案"
                    rows={2}
                    className="min-h-14 min-w-0 flex-1 resize-none bg-surface-raised"
                    onKeyDown={requestSubmitFromTextarea}
                  />
                  <Button
                    type="submit"
                    disabled={isAnsweringAgentQuestion || isAnyAnswerComposing || !customAnswerDraft.draft.trim()}
                  >
                    {isAnsweringAgentQuestion ? (
                      <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    <span>回复</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex min-w-0 items-end gap-2">
              <Textarea
                id="agent-question-answer"
                value={answerDraft.draft}
                onChange={answerDraft.handleChange}
                onCompositionStart={answerDraft.handleCompositionStart}
                onCompositionEnd={answerDraft.handleCompositionEnd}
                placeholder="直接回答这个问题，Agent 会继续执行"
                rows={2}
                className="min-h-14 min-w-0 flex-1 resize-none bg-surface-raised"
                onKeyDown={requestSubmitFromTextarea}
              />
              <Button
                type="submit"
                disabled={isAnsweringAgentQuestion || isAnyAnswerComposing || !answerDraft.draft.trim()}
              >
                {isAnsweringAgentQuestion ? (
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Send className="size-4" />
                )}
                <span>回复</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </form>
  );
};
