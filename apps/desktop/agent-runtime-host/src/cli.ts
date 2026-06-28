import {
  runAgentRuntimeStdioCli,
} from "../../agent-runtime/src/index.js";
import {
  createDesktopAgentRuntimeExtensions,
} from "./extensions/index.js";

runAgentRuntimeStdioCli({
  collaborationExtensions: createDesktopAgentRuntimeExtensions(),
});
