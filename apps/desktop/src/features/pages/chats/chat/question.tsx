import { useEffect, useState, type FormEvent } from "react";
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

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitAnswer(answerValue);
  };

  return (
    <form
      className="mx-auto w-full max-w-[69rem] rounded-xl border border-primary/25 bg-primary/5 p-4 shadow-xs"
      onSubmit={submit}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MessageSquareIcon aria-hidden="true" className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{question.input?.label || "Agent 需要你的回答"}</div>
          {question.context ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{question.context}</p> : null}
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{question.question}</p>
        </div>
      </div>

      {options.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {options.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={answer === option.value ? "secondary" : "outline"}
              disabled={isAnswering}
              className="h-auto min-h-11 justify-start px-3 py-2 text-left whitespace-normal"
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
        <div className="mt-3 flex items-end gap-2">
          <Textarea
            value={isCustomAnswer ? customAnswer : answer}
            rows={2}
            disabled={isAnswering}
            aria-label="回复 Agent 的问题"
            placeholder="输入回答"
            className="min-h-16 flex-1 resize-none bg-background"
            onChange={(event) =>
              isCustomAnswer ? setCustomAnswer(event.currentTarget.value) : setAnswer(event.currentTarget.value)
            }
          />
          <Button type="submit" disabled={isAnswering || !answerValue.trim()} className="min-h-11">
            {isAnswering ? <Spinner /> : <SendIcon aria-hidden="true" />}
            回复
          </Button>
        </div>
      ) : null}
    </form>
  );
};
