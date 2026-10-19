import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `
              radial-gradient(ellipse at 30% 20%, rgba(124, 58, 237, 0.2) 0%, transparent 50%),
              radial-gradient(ellipse at 70% 80%, rgba(6, 182, 212, 0.15) 0%, transparent 50%),
              #030014
            `,
            padding: 24,
          }}
        >
          <div
            style={{
              maxWidth: 440,
              width: "100%",
              textAlign: "center",
              padding: 40,
              background: "rgba(17, 8, 48, 0.8)",
              border: "1px solid rgba(6, 182, 212, 0.3)",
              borderRadius: 20,
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              boxShadow:
                "0 4px 6px rgba(0,0,0,0.15), 0 20px 50px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                margin: "0 auto 20px",
                borderRadius: 14,
                background:
                  "linear-gradient(135deg, rgba(239,68,68,0.2), rgba(124,58,237,0.2))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
              }}
            >
              !
            </div>
            <h2
              style={{
                color: "#ffffff",
                fontSize: 20,
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              Something went wrong
            </h2>
            <p
              style={{
                color: "rgba(255,255,255,0.5)",
                fontSize: 14,
                marginBottom: 24,
                lineHeight: 1.5,
              }}
            >
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <button
              onClick={this.handleReload}
              style={{
                padding: "12px 32px",
                fontSize: 14,
                fontWeight: 600,
                color: "#030014",
                background: "linear-gradient(135deg, #06b6d4, #7c3aed)",
                border: "none",
                borderRadius: 10,
                cursor: "pointer",
                transition: "opacity 0.2s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.opacity = "0.85";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.opacity = "1";
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
