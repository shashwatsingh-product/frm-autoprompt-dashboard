import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
          <div className="bg-red-50 border border-red-200 rounded-xl p-8 max-w-lg">
            <h2 className="text-lg font-bold text-red-800 mb-2">Something went wrong</h2>
            <pre className="text-xs text-red-600 whitespace-pre-wrap text-left bg-red-100 rounded p-3 mb-4 max-h-40 overflow-y-auto">
              {this.state.error?.message || 'Unknown error'}
            </pre>
            <button
              onClick={() => { this.setState({ error: null }); window.location.href = '/'; }}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
