import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { hapticLight } from "./utils/haptic";

const INTERACTIVE = 'button, a, input, select, textarea, [role="button"], [tabindex="0"], label';

document.addEventListener(
  "touchstart",
  (e) => {
    const target = e.target as Element | null;
    if (target?.closest(INTERACTIVE)) {
      hapticLight();
    }
  },
  { passive: true },
);

createRoot(document.getElementById("root")!).render(<App />);
