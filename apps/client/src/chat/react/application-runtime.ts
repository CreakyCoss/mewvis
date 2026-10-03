import { productId } from "@mewvis/product-config";
import * as React from "react";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import * as JSXRuntime from "react/jsx-runtime";
import * as chat from "./index";
import { useApplicationChatSession } from "./application";

Object.defineProperty(globalThis, productId("ApplicationChatUI"), {
  value: Object.freeze({ ...chat, useApplicationChatSession }),
});
Object.defineProperty(globalThis, productId("ApplicationReact"), {
  value: Object.freeze({ React, ReactDOM, ReactDOMClient, JSXRuntime }),
});
