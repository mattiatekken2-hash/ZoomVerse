import { Component, type ErrorInfo, type ReactNode } from "react";
import { hideHtmlSplash } from "./SplashScreen";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches fatal render errors so the mini app never stays on a blank screen. */
export class BootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[BootErrorBoundary]", error, info.componentStack);
    hideHtmlSplash();
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
            background: "#060810",
            color: "#e0e6ff",
            fontFamily: "system-ui, sans-serif",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 800 }}>Errore di avvio</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", maxWidth: 280 }}>
            Chiudi e riapri da Telegram, oppure riprova.
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8,
              padding: "12px 24px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            Riprova
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
