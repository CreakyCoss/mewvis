import { ConfirmationHost } from "./platform/confirm";
import "./styles/theme.css";
import { MemoryRouter } from "react-router";
import { Toaster } from "design-system/components/ui/sonner";
import { StoriesPage } from "./stories";

/** The original module owns its navigation and dialogs inside the application surface. */
export default function App() {
  return (
    <MemoryRouter>
      <StoriesPage />
      <Toaster richColors />
      <ConfirmationHost />
    </MemoryRouter>
  );
}
