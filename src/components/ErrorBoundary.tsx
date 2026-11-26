import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let displayMessage = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(displayMessage) as { error?: string; operationType?: string; path?: string };
      if (parsed.error) {
        displayMessage = `${parsed.error}${parsed.path ? ` (${parsed.operationType} on ${parsed.path})` : ''}`;
      }
    } catch {
      // Non-JSON error message; keep as-is
    }
    return { hasError: true, message: displayMessage };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh bg-[#0B0B0F] text-[#F5F5F7] flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl bg-[#14151B] border border-white/10 p-6 space-y-4">
            <h1 className="font-display text-2xl font-medium text-amber-200">
              Something interrupted Notifye
            </h1>
            <p className="text-sm text-zinc-400 leading-relaxed break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full min-h-[44px] rounded-xl bg-amber-500 text-[#0B0B0F] text-sm font-semibold hover:bg-amber-400 transition-colors cursor-pointer"
            >
              Reload Notifye
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
