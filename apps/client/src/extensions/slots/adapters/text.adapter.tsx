import { uiSlotTypes } from "@isle/extension-sdk/ui";
import { defineUIAdapter, type UIAdapterProps } from "../adapter";

const tones = { neutral: "text-muted-foreground", info: "text-primary", warning: "text-amber-600" };

/** Plain text only. Implemented independently of whether any page mounts a text slot. */
export function TextSlotAdapter({ contributions, error }: UIAdapterProps<"text">) {
  if (!contributions.length && !error) return null;
  return (
    <div role="status" className="flex flex-wrap gap-2 text-xs">
      {contributions.map((item) => (
        <span key={item.key} className={tones[item.contribution.tone ?? "neutral"]}>
          {item.contribution.text}
        </span>
      ))}
      {error ? <span className="text-destructive">{error}</span> : null}
    </div>
  );
}

export default defineUIAdapter(uiSlotTypes.text, { mode: "supported", component: TextSlotAdapter });
