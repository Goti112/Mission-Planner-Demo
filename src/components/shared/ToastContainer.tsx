import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Info, X, AlertTriangle } from 'lucide-react';
import { eventBus, GCSEvent } from '../../shared/events';
import './ToastContainer.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type ToastType = 'info' | 'success' | 'error' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  durationMs: number;
}

const MAX_TOASTS = 4;
const DISMISS_DEFAULT_MS = 5000;
const DISMISS_ERROR_MS   = 8000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

const ICONS: Record<ToastType, React.ReactNode> = {
  info:    <Info    size={14} />,
  success: <CheckCircle size={14} />,
  error:   <AlertCircle size={14} />,
  warning: <AlertTriangle size={14} />,
};

// ── Component ─────────────────────────────────────────────────────────────────

const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Track first heartbeat per drone to avoid spamming "Conectado"
  const seenHeartbeat = useRef<Set<string>>(new Set());

  const push = useCallback((type: ToastType, message: string, durationMs?: number) => {
    const duration = durationMs ?? (type === 'error' ? DISMISS_ERROR_MS : DISMISS_DEFAULT_MS);
    const toast: Toast = { id: makeId(), type, message, durationMs: duration };
    setToasts((prev) => {
      const next = [toast, ...prev];
      return next.slice(0, MAX_TOASTS);
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const latestToastId = toasts[0]?.id ?? null;
  const latestToastDurationMs = toasts[0]?.durationMs ?? null;

  // Auto-dismiss each toast after its duration
  useEffect(() => {
    if (latestToastId === null || latestToastDurationMs === null) return;
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== latestToastId));
    }, latestToastDurationMs);
    return () => clearTimeout(timer);
  }, [latestToastDurationMs, latestToastId]);

  // Subscribe to EventBus events
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(
      eventBus.on(GCSEvent.CONNECTION_ERROR, () => {
        // Suppressed: brief reconnection errors are not shown during presentation
      }),
    );

    unsubs.push(
      eventBus.on(GCSEvent.CONNECTION_CLOSED, ({ droneId }) => {
        seenHeartbeat.current.delete(droneId);
        // Suppressed: disconnection notices are not shown during presentation
      }),
    );

    unsubs.push(
      eventBus.on(GCSEvent.CONNECTION_HEARTBEAT, ({ droneId }) => {
        if (!seenHeartbeat.current.has(droneId)) {
          seenHeartbeat.current.add(droneId);
          push('success', 'Dron conectado — telemetría activa', 4000);
        }
      }),
    );

    unsubs.push(
      eventBus.on(GCSEvent.SYSTEM_ERROR, ({ source, message }) => {
        push('error', `[${source}] ${message}`);
      }),
    );

    return () => unsubs.forEach((u) => u());
  }, [push]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="log" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.type}`}>
          <span className="toast-icon">{ICONS[toast.type]}</span>
          <span className="toast-message">{toast.message}</span>
          <button
            className="toast-close"
            onClick={() => dismiss(toast.id)}
            aria-label="Cerrar notificación"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;
