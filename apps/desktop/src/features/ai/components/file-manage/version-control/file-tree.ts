import type { WorkspaceVersionFileEntry } from "@/features/pages/workspace/files-api";
import { VERSION_RULE_FILE_PATH } from "../constants";
import type { VersionFileTreeNode } from "./types";

const compareVersionFileTreeNodes = (left: VersionFileTreeNode, right: VersionFileTreeNode) => {
  const leftIsVersionRule = left.path === VERSION_RULE_FILE_PATH;
  const rightIsVersionRule = right.path === VERSION_RULE_FILE_PATH;
  if (leftIsVersionRule !== rightIsVersionRule) {
    return leftIsVersionRule ? -1 : 1;
  }

  if (left.isDirectory !== right.isDirectory) {
    return left.isDirectory ? -1 : 1;
  }

  return (
    left.name.localeCompare(right.name, "zh-CN", {
      numeric: true,
      sensitivity: "base",
    }) || left.path.localeCompare(right.path)
  );
};

export const buildVersionFileTree = (files: WorkspaceVersionFileEntry[]) => {
  const root: VersionFileTreeNode = {
    path: "",
    name: "",
    isDirectory: true,
    children: [],
    fileCount: 0,
  };
  const nodesByPath = new Map<string, VersionFileTreeNode>([["", root]]);

  const ensureDirectory = (path: string) => {
    const normalized = path.replace(/^\/+|\/+$/g, "");
    const existing = nodesByPath.get(normalized);
    if (existing) {
      return existing;
    }

    const parts = normalized.split("/").filter(Boolean);
    const name = parts.at(-1) ?? normalized;
    const parent = ensureDirectory(parts.slice(0, -1).join("/"));
    const node: VersionFileTreeNode = {
      path: normalized,
      name,
      isDirectory: true,
      children: [],
      fileCount: 0,
    };

    nodesByPath.set(normalized, node);
    parent.children.push(node);
    return node;
  };

  files.forEach((file) => {
    const normalizedPath = file.path.replace(/^\/+|\/+$/g, "");
    if (!normalizedPath) {
      return;
    }

    const parts = normalizedPath.split("/");
    const parent = ensureDirectory(parts.slice(0, -1).join("/"));
    const existing = nodesByPath.get(normalizedPath);
    if (existing) {
      existing.file = file;
      existing.isDirectory = false;
      existing.name = file.name;
      return;
    }

    const node: VersionFileTreeNode = {
      path: normalizedPath,
      name: file.name,
      isDirectory: false,
      children: [],
      file,
      fileCount: 1,
    };

    nodesByPath.set(normalizedPath, node);
    parent.children.push(node);
  });

  const directoryPaths: string[] = [];
  const sortAndCount = (node: VersionFileTreeNode): number => {
    if (!node.isDirectory) {
      node.fileCount = 1;
      return 1;
    }

    if (node.path) {
      directoryPaths.push(node.path);
    }
    node.children.sort(compareVersionFileTreeNodes);
    node.fileCount = node.children.reduce((count, child) => count + sortAndCount(child), 0);
    return node.fileCount;
  };

  sortAndCount(root);
  return { nodes: root.children, directoryPaths };
};
