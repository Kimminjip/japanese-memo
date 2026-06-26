import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8 text-center">
          <div className="text-5xl">📚</div>
          <div>
            <h1 className="text-2xl font-bold mb-2">잠시 연결이 끊겼습니다</h1>
            <p className="text-muted-foreground">
              서버가 재시작 중일 수 있습니다. 잠시 후 다시 시도해 주세요.
            </p>
          </div>
          <button
            className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium text-lg hover:opacity-90 transition-opacity"
            onClick={() => window.location.reload()}
          >
            새로고침
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
