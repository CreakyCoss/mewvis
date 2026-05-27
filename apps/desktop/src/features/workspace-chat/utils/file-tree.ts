import type { FileTreeNode } from "../page-types";
import type { WorkspaceFileEntry } from "../types";

const compareFileTreeNodes = (left: FileTreeNode, right: FileTreeNode) => {
  if (left.isDirectory !== right.isDirectory) {
    return left.isDirectory ? -1 : 1;
  }

  return left.name
    .localeCompare(right.name, "zh-CN", { numeric: true, sensitivity: "base" })
    || left.path.localeCompare(right.path);
};

export const buildFileTree = (entries: WorkspaceFileEntry[]) => {
  const root: FileTreeNode = {
    path: "",
    name: "",
    isDirectory: true,
    children: [],
  };
  const nodesByPath = new Map<string, FileTreeNode>([["", root]]);

  const ensureDirectory = (path: string) => {
    const normalized = path.replace(/^\/+|\/+$/g, "");
    const existing = nodesByPath.get(normalized);
    if (existing) {
      return existing;
    }

    const parts = normalized.split("/").filter(Boolean);
    const name = parts.at(-1) ?? normalized;
    const parentPath = parts.slice(0, -1).join("/");
    const parent = ensureDirectory(parentPath);
    const node: FileTreeNode = {
      path: normalized,
      name,
      isDirectory: true,
      children: [],
    };

    nodesByPath.set(normalized, node);
    parent.children.push(node);
    return node;
  };

  entries.forEach((entry) => {
    const normalizedPath = entry.path.replace(/^\/+|\/+$/g, "");
    if (!normalizedPath) {
      return;
    }

    const parts = normalizedPath.split("/");
    const parent = ensureDirectory(parts.slice(0, -1).join("/"));
    const existing = nodesByPath.get(normalizedPath);

    if (existing) {
      existing.entry = entry;
      existing.isDirectory = entry.isDirectory;
      existing.name = entry.name;
      return;
    }

    const node: FileTreeNode = {
      path: normalizedPath,
      name: entry.name,
      isDirectory: entry.isDirectory,
      children: [],
      entry,
    };

    nodesByPath.set(normalizedPath, node);
    parent.children.push(node);
  });

  const sortChildren = (node: FileTreeNode) => {
    node.children.sort(compareFileTreeNodes);
    node.children.forEach(sortChildren);
  };

  sortChildren(root);
  return root.children;
};

export const getParentDirectoryPaths = (path: string) => {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/"));
};
