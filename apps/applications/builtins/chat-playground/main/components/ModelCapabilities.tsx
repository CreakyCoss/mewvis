import { useId } from "react";
import {
  FileText,
  Image,
  ImagePlus,
  Info,
  MessageCircle,
  Video,
  Volume2,
  Wrench,
} from "lucide-react";
import type {
  ApplicationModelOption,
  RuntimeModelModality,
} from "@mewvis/app-sdk/chat";
import { LabDialog } from "./LabDialog";

const purposes = [
  { type: "image-generation", label: "图片生成", icon: Image },
  { type: "image-editing", label: "图片编辑", icon: ImagePlus },
  { type: "video-generation", label: "视频生成", icon: Video },
  { type: "speech", label: "语音合成", icon: Volume2 },
] as const;
const modalityLabels: Record<RuntimeModelModality, string> = {
  text: "文字",
  image: "图片",
  video: "视频",
  audio: "音频",
};
const modalities = (values: RuntimeModelModality[]) =>
  values.map((value) => modalityLabels[value]).join("、") || "未声明";

export function ModelCapabilities({
  open,
  onClose,
  model,
  error,
}: {
  open: boolean;
  onClose(): void;
  model?: Pick<ApplicationModelOption, "capabilities" | "mediaPurposes"> & {
    label: string;
    value: string;
  };
  error?: string;
}) {
  const conversationId = useId();
  const mediaId = useId();
  const capabilities = model?.capabilities;
  const configured = model?.mediaPurposes;
  return (
    <LabDialog
      open={open}
      onClose={onClose}
      title="模型与能力"
      className="lab-model-dialog"
    >
      <div className="lab-model-capabilities">
        {error ? (
          <p className="lab-error" role="alert">
            {error}
          </p>
        ) : !model ? (
          <p className="lab-help">请先在对话中选择模型。</p>
        ) : (
          <>
            <div className="lab-current-model">
              <span>当前模型</span>
              <strong>{model.label || model.value}</strong>
            </div>
            <section
              className="lab-conversation-capabilities"
              aria-labelledby={conversationId}
            >
              <h3 id={conversationId}>对话能力</h3>
              {capabilities ? (
                <dl className="lab-model-facts">
                  <div>
                    <dt>
                      <MessageCircle aria-hidden="true" />
                      输入
                    </dt>
                    <dd>{modalities(capabilities.input)}</dd>
                  </div>
                  <div>
                    <dt>
                      <FileText aria-hidden="true" />
                      输出
                    </dt>
                    <dd>{modalities(capabilities.output)}</dd>
                  </div>
                  <div>
                    <dt>
                      <Wrench aria-hidden="true" />
                      工具调用
                    </dt>
                    <dd>
                      <span
                        className={
                          capabilities.toolCalling
                            ? "lab-purpose-status is-configured"
                            : "lab-purpose-status"
                        }
                      >
                        {capabilities.toolCalling ? "已启用" : "未启用"}
                      </span>
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="lab-help">宿主未提供对话模型能力信息。</p>
              )}
            </section>
            <section className="lab-purpose-overview" aria-labelledby={mediaId}>
              <h3 id={mediaId}>媒体用途</h3>
              {configured === undefined ? (
                <p className="lab-help">
                  媒体用途信息暂不可用，无法判断是否已配置。
                </p>
              ) : (
                <ul aria-label="媒体用途配置">
                  {purposes.map(({ type, label, icon: Icon }) => {
                    const purpose = configured.find(
                      (item) => item.type === type,
                    );
                    return (
                      <li key={type} data-configured={!!purpose}>
                        <span className="lab-purpose-name">
                          <Icon aria-hidden="true" />
                          <strong>{label}</strong>
                        </span>
                        <span className="lab-purpose-modalities">
                          {purpose
                            ? `${modalities(purpose.input)} → ${modalities(purpose.output)}`
                            : "—"}
                        </span>
                        <span
                          className={
                            purpose
                              ? "lab-purpose-status is-configured"
                              : "lab-purpose-status"
                          }
                        >
                          {purpose ? "已配置" : "未配置"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <p className="lab-capabilities-note">
              <Info aria-hidden="true" />
              {capabilities?.toolCalling === false
                ? "当前模型未启用工具调用，媒体生成不可用。"
                : "按模型配置展示，实际调用还需对应工具授权。"}
            </p>
          </>
        )}
      </div>
    </LabDialog>
  );
}
