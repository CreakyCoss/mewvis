import { StartupGate } from "./startup";
import { AppContent } from "./main";

export const App = () => {
  return (
    <StartupGate>
      <AppContent />
    </StartupGate>
  );
};
