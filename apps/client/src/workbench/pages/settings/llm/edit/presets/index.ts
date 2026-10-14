import { commonPreset } from "./common";
import { openaiPreset } from "./providers/openai";
import { deepseekPreset } from "./providers/deepseek";
import { minimaxPreset } from "./providers/minimax";
import { zhipuaiPreset } from "./providers/zhipuai";
import { moonshotPreset } from "./providers/moonshot";
import { xiaomiPreset } from "./providers/xiaomi";
import { createEditorPresets } from "./resolve";

export const editorPresets = createEditorPresets(commonPreset, [
  openaiPreset,
  deepseekPreset,
  minimaxPreset,
  zhipuaiPreset,
  moonshotPreset,
  xiaomiPreset,
]);
