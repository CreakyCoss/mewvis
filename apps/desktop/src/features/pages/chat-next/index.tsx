import { MessageSquareText, Sparkles } from "lucide-react";

export const ChatNextPage = () => (
  <main className="flex h-full min-h-0 overflow-y-auto bg-background px-6 py-16 text-foreground sm:px-10 lg:px-16">
    <section aria-labelledby="chat-next-title" className="mx-auto flex w-full max-w-3xl flex-col justify-center">
      <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-3 py-1.5 text-sm font-medium text-primary">
        <Sparkles className="size-4" aria-hidden="true" />
        <span>独立实现</span>
      </div>

      <h1 id="chat-next-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">
        新版对话
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
        一个从零开始构建的聊天空间。新的会话模型、消息流和运行时能力都会从这里逐步接入。
      </p>

      <div className="mt-10 flex items-start gap-4 rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
          <MessageSquareText className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 pt-0.5">
          <h2 className="text-base font-semibold">新入口已经就绪</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            当前页面保持最小依赖，接下来可以在清晰的边界内逐项完成聊天功能。
          </p>
        </div>
      </div>
    </section>
  </main>
);
