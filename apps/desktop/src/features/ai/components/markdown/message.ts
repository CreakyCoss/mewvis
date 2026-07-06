import type { MarkdownContentInput, MarkdownContentMessage } from "./types";

export const getMarkdownMessageContent = (message: MarkdownContentMessage) =>
  typeof message.content === "string" ? message.content : message.text;

export const getMarkdownInputContent = (input: MarkdownContentInput) =>
  input.content ?? (input.message ? getMarkdownMessageContent(input.message) : "");

export const isMarkdownMessageStreaming = (message: MarkdownContentMessage) =>
  message.status === "loading" || message.status === "streaming";
