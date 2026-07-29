import { useEffect } from "react";
import { create } from "zustand";
import { listWorkspaceFiles, watchWorkspaceFiles, type WorkspaceFileEntry } from "@/api/workspace-files";

const WORKSPACE_FILE_CHANGE_DELAY = 8_000;

type WorkspaceFileChangeListener = (workspacePath: string) => void;

// 文件变化只负责广播，不在这里维护 revision 或 Git 状态。
// 文件列表、版本状态等消费者收到事件后，各自刷新所需的数据。
const listeners = new Set<WorkspaceFileChangeListener>();

export const subscribeWorkspaceFileChanges = (listener: WorkspaceFileChangeListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const notifyWorkspaceFileChanges = (workspacePath: string) => {
  listeners.forEach((listener) => listener(workspacePath));
};

type WorkspaceFileStore = {
  workspacePath: string;
  files: WorkspaceFileEntry[];
  isLoading: boolean;
  error: string;
  activateWorkspace: (workspacePath: string) => Promise<void>;
  refreshFiles: () => Promise<void>;
};

// Store 只保存当前活动工作区的文件资源，方便文件树和后续的 @文件 共用。
export const useWorkspaceFileStore = create<WorkspaceFileStore>((set, get) => ({
  workspacePath: "",
  files: [],
  isLoading: false,
  error: "",
  activateWorkspace: async (workspacePath) => {
    if (!workspacePath) {
      set({ workspacePath: "", files: [], isLoading: false, error: "" });
      return;
    }

    if (get().workspacePath !== workspacePath) {
      set({ workspacePath, files: [], isLoading: false, error: "" });
    }

    await get().refreshFiles();
  },
  refreshFiles: async () => {
    const workspacePath = get().workspacePath;
    if (!workspacePath) {
      return;
    }

    set({ isLoading: true, error: "" });
    try {
      const files = await listWorkspaceFiles(workspacePath);
      if (get().workspacePath === workspacePath) {
        set({ files, isLoading: false });
      }
    } catch (error) {
      if (get().workspacePath === workspacePath) {
        set({
          files: [],
          isLoading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  },
}));

// 文件 Store 自己订阅变化，因此文件面板未打开时文件资源也能保持更新。
subscribeWorkspaceFileChanges((workspacePath) => {
  if (useWorkspaceFileStore.getState().workspacePath === workspacePath) {
    void useWorkspaceFileStore.getState().refreshFiles();
  }
});

type WorkspaceFileWatcherProps = {
  workspacePath: string;
};

// 该组件只在 chats 上层挂载一次：切换活动工作区时释放旧监听并启动新监听。
export const WorkspaceFileWatcher = ({ workspacePath }: WorkspaceFileWatcherProps) => {
  useEffect(() => {
    void useWorkspaceFileStore.getState().activateWorkspace(workspacePath);

    if (!workspacePath) {
      return;
    }

    let isDisposed = false;
    let unwatch: (() => void) | undefined;
    let notifyTimer: ReturnType<typeof setTimeout> | undefined;

    void watchWorkspaceFiles(workspacePath, () => {
      if (isDisposed) {
        return;
      }

      // 将密集写入合并到同一个刷新窗口，持续写入时也会每 8 秒刷新一次。
      if (!notifyTimer) {
        notifyTimer = setTimeout(() => {
          notifyTimer = undefined;
          notifyWorkspaceFileChanges(workspacePath);
        }, WORKSPACE_FILE_CHANGE_DELAY);
      }
    })
      .then((stopWatching) => {
        if (isDisposed) {
          stopWatching();
        } else {
          unwatch = stopWatching;
        }
      })
      .catch((error) => {
        console.error("工作区文件监听启动失败", error);
      });

    return () => {
      isDisposed = true;
      clearTimeout(notifyTimer);
      unwatch?.();
    };
  }, [workspacePath]);

  return null;
};
