import { Component, type ReactNode } from "react";
import { AppBackground, LogoMark } from "./AppBackground";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <>
        <AppBackground />
        <main className="grid min-h-screen place-items-center p-4">
          <div className="glass w-full max-w-md p-7 text-center" role="alert">
            <div className="mb-5 flex justify-center">
              <LogoMark size={40} />
            </div>
            <div className="eyebrow">Error</div>
            <h1 className="mt-1 !text-[22px]">Something went wrong</h1>
            <p className="mt-2 text-[13px] text-ink-65">
              The page hit an unexpected error. Reload to try again.
            </p>
            <pre className="code mt-4 !text-xs text-left !whitespace-pre-wrap break-words">
              {this.state.error.message}
            </pre>
            <button
              type="button"
              className="btn btn-primary mt-6 w-full"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </main>
      </>
    );
  }
}
