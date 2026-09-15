import * as React from "react";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import * as JSXRuntime from "react/jsx-runtime";
import * as chat from "./index";
import { useApplicationChatSession } from "./application";

Object.defineProperty(globalThis, "isleApplicationChatUI", { value: Object.freeze({ ...chat, useApplicationChatSession }) });
Object.defineProperty(globalThis, "isleApplicationReact", {
  value: Object.freeze({ React, ReactDOM, ReactDOMClient, JSXRuntime }),
});
