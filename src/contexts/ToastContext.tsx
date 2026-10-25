import React, { createContext, useCallback, useContext, useState } from 'react';

export type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
}

interface ToastContextValue {
  showToast: (params: { variant?: ToastVariant; title: string; description?: string }) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({
      variant = 'success',
      title,
      description,
    }: {
      variant?: ToastVariant;
      title: string;
      description?: string;
    }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-2), { id, variant, title, description }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed top-20 inset-x-4 md:left-auto md:right-6 md:w-96 z-[70] flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((toast) => {
          const isError = toast.variant === 'error';
          const isInfo = toast.variant === 'info';
          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto p-3.5 rounded-xl shadow-xl flex items-start justify-between gap-3 transition-all ${
                isError
                  ? 'bg-error text-on-error'
                  : isInfo
                    ? 'bg-inverse-surface text-inverse-on-surface'
                    : 'bg-primary text-on-primary'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    isError
                      ? 'bg-error-container text-on-error-container'
                      : isInfo
                        ? 'bg-secondary-fixed text-on-secondary-fixed'
                        : 'bg-primary-fixed text-on-primary-fixed'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {isError ? 'error' : isInfo ? 'info' : 'check_circle'}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-label-md font-semibold leading-snug">{toast.title}</p>
                  {toast.description && (
                    <p
                      className={`text-body-sm mt-0.5 leading-snug ${
                        isError
                          ? 'text-error-container'
                          : isInfo
                            ? 'text-surface-dim'
                            : 'text-primary-fixed'
                      }`}
                    >
                      {toast.description}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => dismiss(toast.id)}
                className="p-1 opacity-80 hover:opacity-100 transition-opacity shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
