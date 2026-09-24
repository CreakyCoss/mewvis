import type { UIContribution } from "../index.js";
import type { ExtensionHostSupport } from "../../services/contracts.js";
export type ExtensionUIContribution = UIContribution & {
  extensionId: string;
  revision: string;
};
export interface ExtensionViewInput {
  id: string;
  contributionId: string;
  viewId?: string;
  workspacePath?: string;
  chatId?: string;
}
export interface ExtensionViewLease {
  token: string;
  source: string;
  id: string;
  contributionId: string;
  viewId: string;
  config: Record<string, unknown>;
  capabilities: ExtensionHostSupport[];
}
export interface ExtensionViewTransport {
  open(input: ExtensionViewInput): Promise<ExtensionViewLease>;
  close(token: string): Promise<void>;
  query(
    token: string,
    method: string,
    input: unknown,
    requestId: number,
  ): Promise<unknown>;
  cancel(token: string, requestId: number): Promise<void>;
}
