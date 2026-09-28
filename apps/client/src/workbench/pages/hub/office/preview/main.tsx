import { createRoot } from "react-dom/client";
import { OfficeV2 } from "./office-v2";
import "@office-tokens";
import "./office-v2.css";

createRoot(document.getElementById("root")!).render(<OfficeV2 />);
