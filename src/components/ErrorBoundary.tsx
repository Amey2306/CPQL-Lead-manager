import React, { useState, useEffect, Component, ErrorInfo } from 'react';
import { XCircle, CheckCircle, Info } from 'lucide-react';

export const showToast = (message: string, type: 'error' | 'success' | 'info' = 'error') => {
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, type } }));
};

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  props: ErrorBoundaryProps;
  state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let message = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error?.message || "");
        if (parsed.error && parsed.operationType) {
          message = `Database Error (${parsed.operationType}): ${parsed.error}`;
        }
      } catch {
        message = this.state.error?.message || message;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 15.667c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Application Error</h2>
            <p className="text-gray-600 mb-6">{message}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-gray-900 text-white font-medium py-2 px-4 rounded-lg hover:bg-gray-800 transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return (
      <GlobalErrorHandler>
        {this.props.children}
      </GlobalErrorHandler>
    );
  }
}

function GlobalErrorHandler({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ message: string, type: 'error' | 'success' | 'info' } | null>(null);

  useEffect(() => {
    const customToastHandler = (event: CustomEvent) => {
      setToast(event.detail);
      setTimeout(() => setToast(null), 5000);
    };

    const rejectionHandler = (event: PromiseRejectionEvent) => {
      let message = event.reason?.message || String(event.reason);
      try {
        const parsed = JSON.parse(message);
        if (parsed.error && parsed.operationType) {
          message = `Database Error (${parsed.operationType}): ${parsed.error}`;
        }
      } catch {
        // Not JSON
      }
      setToast({ message, type: 'error' });
      setTimeout(() => setToast(null), 5000);
    };

    const errorHandler = (event: ErrorEvent) => {
      let message = event.error?.message || event.message || "An unexpected error occurred.";
      try {
        const parsed = JSON.parse(message);
        if (parsed.error && parsed.operationType) {
          message = `Database Error (${parsed.operationType}): ${parsed.error}`;
        }
      } catch {
        // Not JSON
      }
      setToast({ message, type: 'error' });
      setTimeout(() => setToast(null), 5000);
    };

    window.addEventListener('app-toast', customToastHandler as EventListener);
    window.addEventListener('unhandledrejection', rejectionHandler);
    window.addEventListener('error', errorHandler);
    return () => {
      window.removeEventListener('app-toast', customToastHandler as EventListener);
      window.removeEventListener('unhandledrejection', rejectionHandler);
      window.removeEventListener('error', errorHandler);
    };
  }, []);

  return (
    <>
      {children}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[100] max-w-sm border-l-4 p-4 rounded shadow-lg flex items-start gap-3 animate-in slide-in-from-bottom-5 ${
          toast.type === 'error' ? 'bg-red-50 border-red-500' :
          toast.type === 'success' ? 'bg-green-50 border-green-500' :
          'bg-blue-50 border-blue-500'
        }`}>
          {toast.type === 'error' && <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />}
          {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />}
          {toast.type === 'info' && <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />}
          
          <div className="flex-1">
            <h3 className={`text-sm font-bold ${
              toast.type === 'error' ? 'text-red-800' :
              toast.type === 'success' ? 'text-green-800' :
              'text-blue-800'
            }`}>
              {toast.type === 'error' ? 'Error' : toast.type === 'success' ? 'Success' : 'Info'}
            </h3>
            <p className={`text-sm mt-1 ${
              toast.type === 'error' ? 'text-red-700' :
              toast.type === 'success' ? 'text-green-700' :
              'text-blue-700'
            }`}>{toast.message}</p>
          </div>
          <button onClick={() => setToast(null)} className={`hover:opacity-70 ${
            toast.type === 'error' ? 'text-red-500' :
            toast.type === 'success' ? 'text-green-500' :
            'text-blue-500'
          }`}>
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
}
