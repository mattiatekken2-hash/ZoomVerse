import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  error: Error | null;
}

/** Catches Lab forge overlay crashes without killing the whole app. */
export class ForgeUiErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ForgeUiErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            background: "rgba(20,8,8,0.9)",
            border: "1px solid rgba(255,80,80,0.4)",
            color: "#ffb4b4",
            fontSize: 12,
            maxWidth: 280,
            textAlign: "center",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>{this.props.label ?? "Forge UI error"}</div>
          <div style={{ opacity: 0.75 }}>{this.state.error.message}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
