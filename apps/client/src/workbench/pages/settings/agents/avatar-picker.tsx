import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { agentAvatarGroups, resolveAvatar } from "@/assets/avatars";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "design-system/components/ui/dialog";

export function AgentAvatarPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex shrink-0 flex-col items-center gap-1.5">
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label="更换智能体头像"
            title="更换头像"
            className="group relative rounded-xl transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <img alt="智能体头像" className="size-14 rounded-xl object-cover" src={resolveAvatar(value).src} />
            <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm group-hover:text-foreground">
              <Pencil className="size-2.5" />
            </span>
          </button>
        </DialogTrigger>
        <span className="text-[11px] text-muted-foreground">更换头像</span>
      </div>
      <DialogContent className="!flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]">
        <DialogHeader className="shrink-0 border-b border-border/70 px-6 py-5">
          <DialogTitle>选择头像</DialogTitle>
          <DialogDescription>点击选择，保存后生效。</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-6 overflow-y-auto p-6">
          {agentAvatarGroups.map((group) => (
            <div key={group.id} role="group" aria-label={group.label} className="space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground">{group.label}</h4>
              <div className="grid grid-cols-6 gap-3 sm:grid-cols-8">
                {group.options.map((avatar) => (
                  <button
                    type="button"
                    key={avatar.id}
                    title={avatar.label}
                    aria-label={avatar.label}
                    aria-pressed={value === avatar.id}
                    className={`relative aspect-square rounded-xl p-1 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${value === avatar.id ? "bg-primary/5 ring-2 ring-primary" : ""}`}
                    onClick={() => {
                      onChange(avatar.id);
                      setOpen(false);
                    }}
                  >
                    <img src={avatar.src} alt="" className="size-full rounded-lg object-cover" />
                    {value === avatar.id && (
                      <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-2.5" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
