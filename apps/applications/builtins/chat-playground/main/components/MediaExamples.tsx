import { useEffect, useState } from "react";
import {
  Check,
  Circle,
  Code2,
  Eye,
  FileImage,
  Image,
  Info,
  Send,
  Video,
  Volume2,
} from "lucide-react";
import type { ChatSnapshot } from "@mewvis/app-sdk/chat";
import {
  imageInputExamples,
  mediaExamples,
  mediaExampleUnavailableReason,
  mediaCode,
  type ChatPreset,
} from "../examples";
import { imageInputCode, type WorkspaceImage } from "../image-inputs";
import { CodeExample } from "./Example";
import { ImageInputExamples, useWorkspaceImage } from "./ImageInputExamples";
import { LabDialog } from "./LabDialog";

type MediaExample = ChatPreset & { description: string; request?: string };
const examples: MediaExample[] = [...imageInputExamples, ...mediaExamples];
const icons = {
  understanding: Eye,
  editing: Image,
  video: Video,
  "image-generation": Image,
  "image-editing": Image,
  "video-generation": Video,
  speech: Volume2,
};

export function MediaExamples({
  state,
  disabled,
  pending,
  preset,
  onApply,
  onClose,
  workspaceId,
  active,
}: {
  state: Readonly<ChatSnapshot>;
  disabled: boolean;
  pending: boolean;
  preset?: ChatPreset;
  onApply(example: ChatPreset, image?: WorkspaceImage): void;
  onClose(): void;
  workspaceId: string;
  active: boolean;
}) {
  const [selected, setSelected] = useState<ChatPreset>(imageInputExamples[0]);
  const [code, setCode] = useState(false);
  const input = useWorkspaceImage(workspaceId, active);
  useEffect(() => {
    if (active && preset) {
      const match = examples.find((example) => example.label === preset.label);
      if (match) setSelected(match);
    }
  }, [active, preset]);
  const reason = mediaExampleUnavailableReason(state, selected);
  const imageReason = selected.imageInput
    ? input.workspaceError || (!input.image ? "请先导入参考图片。" : "")
    : "";
  const Icon =
    icons[selected.imageInput || selected.mediaPurpose || "understanding"];
  const choices = (items: MediaExample[], label: string) => (
    <section className="lab-media-choices" aria-label={label}>
      <h3>{label}</h3>
      <div className="lab-media-example-list">
        {items.map((example) => {
          const unavailable = mediaExampleUnavailableReason(state, example);
          const ChoiceIcon = icons[example.imageInput || example.mediaPurpose!];
          const chosen = selected.label === example.label;
          return (
            <button
              type="button"
              className={`lab-media-example ${unavailable ? "is-unavailable" : ""}`}
              key={example.label}
              aria-pressed={chosen}
              disabled={disabled}
              title={unavailable || example.description}
              onClick={() => setSelected(example)}
            >
              <span className="lab-media-choice-heading">
                <ChoiceIcon aria-hidden="true" />
                <strong>{example.label}</strong>
                {chosen ? (
                  <Check className="lab-choice-check" aria-hidden="true" />
                ) : (
                  <Circle className="lab-choice-circle" aria-hidden="true" />
                )}
              </span>
              <span
                className={unavailable ? "lab-media-unavailable" : "lab-badge"}
              >
                {unavailable ? "暂不可用" : "已就绪"}
              </span>
              <span className="lab-media-description">
                {example.description}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
  const preview = examples.find((example) => example.label === selected.label);
  return (
    <section className="lab-media-examples" aria-label="多模态示例">
      <div className="lab-media-workspace">
        <ImageInputExamples input={input} active={active} disabled={disabled} />
        <div className="lab-media-catalog">
          {choices(imageInputExamples, "使用参考图片")}
          {choices(mediaExamples, "从文字生成")}
          <section className="lab-media-prompt" aria-label="提示词预览">
            <div className="lab-section-heading">
              <h3>
                <Icon aria-hidden="true" />
                {selected.label}
              </h3>
              <span>提示词预览</span>
            </div>
            <p className="lab-media-request">
              {preview?.request ?? selected.text}
            </p>
            {selected.imageInput && input.image && (
              <span className="lab-media-reference">
                <FileImage aria-hidden="true" />
                {input.image.file.name}
              </span>
            )}
            <p className="lab-media-prerequisite" role="status">
              <Info aria-hidden="true" />
              {reason ||
                imageReason ||
                (selected.imageInput
                  ? "将引用左侧工作区图片，确认后由你发送。"
                  : "使用当前模型的用途配置，确认后由你发送。")}
            </p>
          </section>
        </div>
      </div>
      <footer className="lab-dialog-footer lab-media-footer">
        <button
          type="button"
          className="lab-button lab-code-link"
          onClick={() => setCode(true)}
        >
          <Code2 aria-hidden="true" />
          查看接入代码
        </button>
        <span className="lab-help">生成类示例可能产生供应商费用。</span>
        <div className="lab-form-actions">
          <button type="button" className="lab-button" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="lab-button lab-primary"
            disabled={disabled || input.busy || !!reason || !!imageReason}
            onClick={() =>
              onApply(selected, selected.imageInput ? input.image : undefined)
            }
          >
            <Send aria-hidden="true" />
            {pending ? "准备中…" : "填入草稿"}
          </button>
        </div>
      </footer>
      <LabDialog
        open={code && active}
        title="多模态接入代码"
        className="lab-code-dialog"
        onClose={() => setCode(false)}
      >
        <CodeExample code={imageInputCode} title="图片输入接入代码" open />
        <CodeExample code={mediaCode} title="多模态生成接入代码" />
      </LabDialog>
    </section>
  );
}
