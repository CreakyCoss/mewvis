import { useEffect, useState, useId } from "react";
import { Clock3Icon, MessageCircleQuestionIcon, SendIcon } from "lucide-react";
import { Button } from "design-system/components/ui/button";
import { Spinner } from "design-system/components/ui/spinner";
import { Textarea } from "design-system/components/ui/textarea";
import type { ChatPendingQuestion } from "../core";

type ChatQuestionProps = {
  question: ChatPendingQuestion;
  onAnswer: (answer: string | null) => Promise<void>;
  answering?: boolean;
};

export const QuestionView = ({ question, onAnswer, answering = false }: ChatQuestionProps) => {
  const fieldId = useId();
  const [answer, setAnswer] = useState(question.input?.selected ?? "");
  const [customAnswer, setCustomAnswer] = useState("");
  const [submitting, setSubmitting] = useState<"answer" | "cancel" | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now);
  const remaining = Math.max(0, Math.ceil((question.expiresAt - now) / 1_000));
  const expired = remaining === 0;
  const isAnswering = answering || submitting !== null;
  const isSelect = question.input?.type === "select";
  const options = isSelect ? [...(question.input?.options ?? [])] : [];
  if (isSelect && !options.some((option) => option.value === "other")) {
    options.push({ value: "other", label: "其他", description: "输入自己的回答" });
  }
  const isCustomAnswer = options.length > 0 && answer === "other";
  const answerValue = isCustomAnswer ? customAnswer : answer;
  const showTextInput = options.length === 0 || isCustomAnswer;

  useEffect(() => {
    setAnswer(question.input?.selected ?? "");
    setCustomAnswer("");
    setSubmitting(null);
    setError("");
  }, [question.questionId, question.input?.selected]);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [question.questionId, question.expiresAt]);

  const submitAnswer = async (value: string | null) => {
    const normalizedValue = value === null ? null : value.trim();
    if (normalizedValue === "" || isAnswering || (normalizedValue !== null && Date.now() >= question.expiresAt)) {
      return;
    }

    setSubmitting(normalizedValue === null ? "cancel" : "answer");
    setError("");
    try {
      await onAnswer(normalizedValue);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <form
      aria-labelledby={`${fieldId}-question`}
      aria-busy={isAnswering}
      className="mx-auto w-full max-w-[69rem] overflow-hidden rounded-xl border border-primary/20 bg-card text-card-foreground shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        void submitAnswer(answerValue);
      }}
    >
      <div className="space-y-3 p-3">
        <div className="flex items-start gap-2.5">
          <MessageCircleQuestionIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 text-xs leading-5 text-muted-foreground">
              <span>{expired ? "回答已超时" : "等待回答"}</span>
              {question.input?.label ? <span>{question.input.label}</span> : null}
              <span
                role="timer"
                aria-label="回答剩余时间"
                aria-live="off"
                title="超时后本次等待将结束"
                className="ml-auto flex shrink-0 items-center gap-1 tabular-nums"
              >
                <Clock3Icon aria-hidden="true" className="size-3.5" />
                {`${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}
              </span>
            </div>
            <p
              id={`${fieldId}-question`}
              className="mt-0.5 whitespace-pre-wrap break-words text-sm font-medium leading-6"
            >
              {question.question}
            </p>
            {question.context ? (
              <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
                {question.context}
              </p>
            ) : null}
          </div>
        </div>
        {options.length > 0 ? (
          <div role="radiogroup" aria-labelledby={`${fieldId}-question`} className="grid gap-1.5">
            {options.map((option, index) => (
              <label
                key={option.value}
                className={[
                  "flex items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors motion-reduce:transition-none",
                  answer === option.value ? "border-primary/35 bg-primary/5" : "border-border/60 hover:bg-muted/40",
                  isAnswering || expired ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name={`${fieldId}-options`}
                  value={option.value}
                  checked={answer === option.value}
                  disabled={isAnswering || expired}
                  onChange={() => setAnswer(option.value)}
                  aria-labelledby={`${fieldId}-option-${index}`}
                  aria-describedby={option.description ? `${fieldId}-description-${index}` : undefined}
                  className="mt-1 size-3.5 shrink-0 accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 break-words leading-5">
                  <span id={`${fieldId}-option-${index}`} className="font-medium">
                    {option.label}
                  </span>
                  {option.description ? (
                    <span id={`${fieldId}-description-${index}`} className="text-xs leading-5 text-muted-foreground">
                      {option.description}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        ) : null}
      </div>
      <div className="flex items-end gap-3 border-t border-border/60 px-3 py-2.5">
        {showTextInput ? (
          <Textarea
            id={fieldId}
            value={isCustomAnswer ? customAnswer : answer}
            rows={1}
            disabled={isAnswering || expired}
            aria-label="回复 Agent 的问题"
            placeholder={isCustomAnswer ? "说说你的想法…" : "输入你的回答…"}
            className="max-h-28 min-h-9 min-w-0 flex-1 resize-none py-2 text-sm leading-5 shadow-none"
            onChange={(event) =>
              isCustomAnswer ? setCustomAnswer(event.currentTarget.value) : setAnswer(event.currentTarget.value)
            }
          />
        ) : (
          <p className="flex-1 self-center text-xs text-muted-foreground">{answer ? "确认后继续对话" : "请选择一项"}</p>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isAnswering}
          onClick={() => void submitAnswer(null)}
          className="h-9 shrink-0 px-2 text-xs text-muted-foreground"
        >
          {submitting === "cancel" ? <Spinner className="size-3.5 motion-reduce:animate-none" /> : null}
          {submitting === "cancel" ? "取消中" : "取消回答"}
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={isAnswering || expired || !answerValue.trim()}
          className="h-9 shrink-0 gap-1.5 px-3 text-xs"
        >
          {submitting === "answer" ? (
            <Spinner className="size-3.5 motion-reduce:animate-none" />
          ) : (
            <SendIcon aria-hidden="true" className="size-3.5" />
          )}
          {submitting === "answer" ? "发送中" : "回复"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="border-t border-border/60 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
};
