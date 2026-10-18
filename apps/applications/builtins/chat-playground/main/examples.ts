import { APP_DISPLAY_NAME } from "@mewvis/product-config";
import type {
  ChatPermissionMode,
  ChatSnapshot,
  ModelMediaPurpose,
} from "@mewvis/app-sdk/chat";

export type ChatPreset = {
  label: string;
  text: string;
  permissionMode?: ChatPermissionMode;
  mediaPurpose?: ModelMediaPurpose["type"];
  imageInput?: "understanding" | "editing" | "video";
};

export const imageInputExamples = [
  {
    label: "图片理解",
    imageInput: "understanding",
    description: "读取导入的图片，描述主体、构图和可辨认的文字。",
    text: "请使用 read 工具读取下面引用的本地图片，再根据实际图像描述主体、构图和可辨认的文字；看不清的内容明确说明，不根据文件名猜测。读取失败时说明实际错误并等待我处理，不声称已经看过图片。",
  },
  {
    label: "图片编辑",
    imageInput: "editing",
    mediaPurpose: "image-editing",
    description: "保留参考图片的主体与构图，转换为水彩风格。",
    text: "请编辑下面引用的本地图片，保留主体与构图，将画面转换为柔和的水彩风格。",
  },
  {
    label: "图生视频",
    imageInput: "video",
    mediaPurpose: "video-generation",
    description: "将参考图片作为首帧，生成缓慢推进镜头的短片。",
    text: "请以下面引用的本地图片作为首帧，生成一段镜头缓慢推进的短视频，保持主体外观和整体构图。时长、分辨率和画幅等未指定参数沿用当前用途默认值。",
  },
] satisfies (ChatPreset & { description: string })[];

export const mediaExamples = (
  [
    {
      label: "文生图",
      mediaPurpose: "image-generation",
      description: "生成一张橘猫插画，在对话中查看和放大图片。",
      request:
        "请生成一张暖色绘本风格的插画：一只橘猫坐在窗边看雨，窗外是朦胧的城市。画幅等未指定参数沿用当前用途默认值。",
    },
    {
      label: "文生视频",
      mediaPurpose: "video-generation",
      description: "生成一段海边日出短片，观察等待过程并播放结果。",
      request:
        "请生成一段海边日出的短视频：固定镜头，轻柔的海浪拍打沙滩，太阳缓缓升起。时长、分辨率和画幅沿用当前用途默认值，不使用参考图片。",
    },
    {
      label: "语音合成",
      mediaPurpose: "speech",
      description: "将欢迎语合成为语音，在对话中试听音频。",
      request: `请将以下台词原样合成为语音，不添加旁白或说明：“你好，欢迎来到 ${APP_DISPLAY_NAME} 多模态调试台。”音色和语速等未指定参数沿用当前用途默认值。`,
    },
  ] as const
).map((example) => ({
  ...example,
  text: `${example.request}\n\n请使用 generate_media，先用 action=list 查询当前模型的 ${example.mediaPurpose} 用途，再严格按返回的 inputSchema 和可覆盖参数执行一次 action=generate，purpose 固定为 ${example.mediaPurpose}。必填信息无法从请求和配置确定时，使用 ask_user 等待我选择，不编造参数或切换模型、用途。产物保存到当前工作区的 generated-media。以工具实际返回的状态和文件路径说明结果，不声称已检查或试听产物。失败或停止后不要自动重新提交生成请求。`,
})) satisfies (ChatPreset & { description: string; request: string })[];

export function mediaExampleUnavailableReason(
  state: Pick<ChatSnapshot, "initialized" | "config" | "resources">,
  example: ChatPreset,
): string {
  if (!example.mediaPurpose && !example.imageInput) return "";
  if (!state.initialized) return "正在加载模型与工具信息。";
  if (state.resources.errors?.models) return "模型信息加载失败，请刷新后重试。";
  const model = state.resources.models?.find(
    (model) => model.value === state.config.selectedModelId,
  );
  if (!model) return "请先在对话中选择模型。";
  if (model.capabilities?.toolCalling === false)
    return "当前模型未启用工具调用。";
  const understanding = example.imageInput === "understanding";
  if (understanding) {
    if (!model.capabilities) return "当前宿主未提供对话模型能力信息。";
    if (!model.capabilities.input.includes("image"))
      return "当前对话模型不支持图片输入。";
  } else {
    if (model.mediaPurposes === undefined)
      return "当前宿主未提供媒体用途信息。";
    const purpose = model.mediaPurposes.find(
      (purpose) => purpose.type === example.mediaPurpose,
    );
    if (!purpose) return `请先在模型设置中配置 ${example.mediaPurpose} 用途。`;
    if (!purpose.input.includes("text"))
      return "当前用途未声明文字输入，无法使用这个示例。";
    if (example.imageInput && !purpose.input.includes("image"))
      return "当前用途未声明图片输入，无法使用这个示例。";
  }
  if (state.resources.errors?.tools)
    return "工具授权信息加载失败，请刷新后重试。";
  const toolName = understanding ? "read" : "generate_media";
  if (!state.resources.tools?.some((tool) => tool.value === toolName))
    return `请在应用管理中允许 ${toolName} 工具，再刷新信息。`;
  return "";
}

export const mediaCode = [
  'import { useChatComposer, useChatSnapshot } from "@mewvis/app-sdk/chat/react";',
  "",
  "// 在 Chat.Provider 内使用；同一会话由共享 Chat 展示结果。",
  "function ImageExample() {",
  "  const composer = useChatComposer();",
  "  const state = useChatSnapshot();",
  "  const model = state.resources.models?.find(",
  "    item => item.value === state.config.selectedModelId,",
  "  );",
  "  const configured = model?.mediaPurposes?.some(",
  '    item => item.type === "image-generation" && item.input.includes("text"),',
  "  );",
  '  const allowed = state.resources.tools?.some(item => item.value === "generate_media");',
  `  const text = ${JSON.stringify(mediaExamples[0].text)};`,
  "  return (",
  "    <button",
  "      disabled={composer.disabled || !configured || !allowed}",
  '      onClick={() => composer.setDraft({ text, blocks: [{ type: "text", content: text }] })}',
  "    >",
  "      填入文生图示例",
  "    </button>",
  "  );",
  "}",
].join("\n");
