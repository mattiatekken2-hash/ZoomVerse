import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  label?: string;
  onReset?: () => void;
}
interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: unknown, info: unknown) {
    try {
      console.error("[ErrorBoundary]", this.props.label ?? "root", err, info);
    } catch { /* */ }
  }

  reload = () => {
    try {
      if (window.caches?.keys) {
        window.caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k))))
          .finally(() => location.replace(location.pathname + "?_=" + Date.now()));
      } else {
        location.replace(location.pathname + "?_=" + Date.now());
      }
    } catch {
      location.reload();
    }
  };

  reset = () => {
    this.setState({ hasError: false, message: "" });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          gap: 14,
          background: "rgba(6,8,16,0.85)",
          color: "#fff",
          textAlign: "center",
          zIndex: 999,
        }}
        data-testid="error-boundary"
      >
        <div style={{ fontSize: 36, opacity: 0.7 }}>⚠️</div>
        <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: 1 }}>
          {this.props.label ? `${this.props.label} unavailable` : "Something went wrong"}
        </div>
        <div style={{ fontSize: 12, opacity: 0.55, maxWidth: 280, lineHeight: 1.4 }}>
          {this.state.message || "Unexpected error. Tap reload to refresh the latest version."}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button
            onClick={this.reset}
            style={{
              padding: "10px 18px",
              borderRadius: 12,
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: 1,
              textTransform: "uppercase",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
            data-testid="error-retry"
          >
            Retry
          </button>
          <button
            onClick={this.reload}
            style={{
              padding: "10px 18px",
              borderRadius: 12,
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: 1,
              textTransform: "uppercase",
              background: "linear-gradient(135deg,#00f2fe,#4facfe)",
              color: "#060810",
              border: "none",
              boxShadow: "0 0 18px rgba(0,242,254,0.45)",
            }}
            data-testid="error-reload"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
