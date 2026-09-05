import * as React from "react";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import * as JSXRuntime from "react/jsx-runtime";
import * as chat from "./index";
import { usePluginChatSession } from "./plugin";

Object.defineProperty(globalThis, "islePluginChatUI", { value: Object.freeze({ ...chat, usePluginChatSession }) });
Object.defineProperty(globalThis, "islePluginReact", {
  value: Object.freeze({ React, ReactDOM, ReactDOMClient, JSXRuntime }),
});
