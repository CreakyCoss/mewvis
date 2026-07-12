import { listWorkspaceFiles, readWorkspaceFile, writeWorkspaceFilesAtomic } from "@/features/pages/workspace/files-api";
import {
  STORY_PROJECT_CONTRACT_LOCK_PATH,
  STORY_PROJECT_CONTRACT_PATH,
  createStoryContractCompilerRegistry,
  type StoryProjectApi,
} from "../../../../../protocols/story-project";
import { DEFAULT_STORY_PROJECT_CONTRACT_SOURCE } from "./default-novel";

const storyContractCompilers = createStoryContractCompilerRegistry();

const sha256 = async (content: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
};

const contractLockText = async (contractText: string, contract: StoryProjectApi) =>
  `${JSON.stringify(
    {
      $format: "novel-claw.story-project-contract-lock",
      formatVersion: 1,
      contractPath: STORY_PROJECT_CONTRACT_PATH,
      contractId: contract.identity.contractId,
      contractVersion: contract.identity.contractVersion,
      compiler: contract.compiler,
      sha256: await sha256(contractText),
    },
    null,
    2,
  )}\n`;

export const installStoryProjectContract = async (workspacePath: string, input: unknown) => {
  const compiled = storyContractCompilers.compile(input);
  const contractText = `${JSON.stringify(input, null, 2)}\n`;
  await writeWorkspaceFilesAtomic(workspacePath, [
    { relativePath: STORY_PROJECT_CONTRACT_PATH, content: contractText },
    {
      relativePath: STORY_PROJECT_CONTRACT_LOCK_PATH,
      content: await contractLockText(contractText, compiled),
    },
  ]);
  return compiled;
};

export const installDefaultStoryProjectContract = (workspacePath: string) =>
  installStoryProjectContract(workspacePath, DEFAULT_STORY_PROJECT_CONTRACT_SOURCE);

export const loadStoryProjectContract = async (workspacePath: string): Promise<StoryProjectApi> => {
  const entries = await listWorkspaceFiles(workspacePath);
  const paths = new Set(entries.filter((entry) => !entry.isDirectory).map((entry) => entry.path));
  if (!paths.has(STORY_PROJECT_CONTRACT_PATH)) return installDefaultStoryProjectContract(workspacePath);
  if (!paths.has(STORY_PROJECT_CONTRACT_LOCK_PATH)) {
    throw new Error(`工作区故事协议缺少锁文件：${STORY_PROJECT_CONTRACT_LOCK_PATH}`);
  }
  try {
    const [file, lockFile] = await Promise.all([
      readWorkspaceFile(workspacePath, STORY_PROJECT_CONTRACT_PATH),
      readWorkspaceFile(workspacePath, STORY_PROJECT_CONTRACT_LOCK_PATH),
    ]);
    const contract = storyContractCompilers.compile(JSON.parse(file.content) as unknown);
    const lock = JSON.parse(lockFile.content) as Record<string, unknown>;
    const compiler = lock.compiler as Record<string, unknown> | undefined;
    if (
      lock.$format !== "novel-claw.story-project-contract-lock" ||
      lock.formatVersion !== 1 ||
      lock.contractPath !== STORY_PROJECT_CONTRACT_PATH ||
      lock.contractId !== contract.identity.contractId ||
      lock.contractVersion !== contract.identity.contractVersion ||
      compiler?.format !== contract.compiler.format ||
      compiler?.version !== contract.compiler.version ||
      lock.sha256 !== (await sha256(file.content))
    ) {
      throw new Error("contract.lock.json 与工作区故事协议不一致。");
    }
    return contract;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`工作区故事协议无效：${message}`);
  }
};
