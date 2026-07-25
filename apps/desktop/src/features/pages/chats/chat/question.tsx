import { useEffect, useState } from "react";
import { MessageSquareIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ChatPendingQuestion } from "./type";

type ChatQuestionProps = {
  question: ChatPendingQuestion;
  onAnswer: (answer: string) => Promise<void>;
};

export const ChatQuestion = ({ question, onAnswer }: ChatQuestionProps) => {
  const [answer, setAnswer] = useState(question.input?.selected ?? "");
  const [customAnswer, setCustomAnswer] = useState("");
  const [isAnswering, setIsAnswering] = useState(false);
  const options = question.input?.type === "select" ? (question.input.options ?? []) : [];
  const isCustomAnswer = answer === "other";
  const answerValue = isCustomAnswer ? customAnswer : answer;

  useEffect(() => {
    setAnswer(question.input?.selected ?? "");
    setCustomAnswer("");
    setIsAnswering(false);
  }, [question.questionId, question.input?.selected]);

  const submitAnswer = async (value: string) => {
    const normalizedValue = value.trim();
    if (!normalizedValue || isAnswering) {
      return;
    }

    setIsAnswering(true);
    try {
      await onAnswer(normalizedValue);
    } finally {
      setIsAnswering(false);
    }
  };

  return (
    <form
      className="app-panel mx-auto w-full max-w-[69rem] overflow-hidden rounded-2xl border-primary/25"
      onSubmit={(event) => {
        event.preventDefault();
        void submitAnswer(answerValue);
      }}
    >
      <div className="flex items-start gap-3 border-b border-border/60 bg-primary/5 px-4 py-3.5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
          <MessageSquareIcon aria-hidden="true" className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{question.input?.label || "Agent 需要你的回答"}</div>
          {question.context ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{question.context}</p> : null}
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{question.question}</p>
        </div>
      </div>

      <div className="app-canvas px-4 py-4">
        {options.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {options.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={answer === option.value ? "secondary" : "outline"}
                disabled={isAnswering}
                className={[
                  "h-auto min-h-11 justify-start rounded-xl px-3 py-2.5 text-left whitespace-normal",
                  answer === option.value ? "border-primary/35 bg-primary/10 ring-2 ring-primary/20" : "",
                ].join(" ")}
                onClick={() => {
                  setAnswer(option.value);
                  if (option.value !== "other") {
                    void submitAnswer(option.value);
                  }
                }}
              >
                <span className="min-w-0">
                  <span className="block font-medium">{option.label}</span>
                  {option.description ? (
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{option.description}</span>
                  ) : null}
                </span>
              </Button>
            ))}
          </div>
        ) : null}

        {options.length === 0 || isCustomAnswer ? (
          <div className={["space-y-2", options.length > 0 ? "mt-3" : ""].join(" ")}>
            <div className="flex items-end gap-2">
              <Textarea
                id="legacy-agent-question-answer"
                value={isCustomAnswer ? customAnswer : answer}
                rows={2}
                disabled={isAnswering}
                aria-label="回复 Agent 的问题"
                placeholder="输入回答"
                className="min-h-16 flex-1 resize-none bg-surface-raised"
                onChange={(event) =>
                  isCustomAnswer ? setCustomAnswer(event.currentTarget.value) : setAnswer(event.currentTarget.value)
                }
              />
              <Button type="submit" disabled={isAnswering || !answerValue.trim()} className="min-h-11">
                {isAnswering ? <Spinner className="motion-reduce:animate-none" /> : <SendIcon aria-hidden="true" />}
                回复
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </form>
  );
};
