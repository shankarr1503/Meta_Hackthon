import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  /** What failed, for the message: "The {label} view could not be displayed." */
  label: string;
  children: ReactNode;
  /** Replaces the default alert, e.g. for a non-essential part such as the 3D scene. */
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/** Contains a render crash to one part of the page instead of blanking the whole app. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`FailureLab: the ${this.props.label} view crashed.`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return (
      <div
        role="alert"
        className="space-y-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
      >
        <p>
          The {this.props.label} view could not be displayed: {error.message}
        </p>
        <button
          type="button"
          className="rounded border border-red-400 px-2 py-0.5 hover:bg-red-100 dark:hover:bg-red-900"
          onClick={() => this.setState({ error: null })}
        >
          Try again
        </button>
      </div>
    );
  }
}
