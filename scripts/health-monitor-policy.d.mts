export interface MonitorState {
  version: 2;
  consecutiveCriticalFailures: number;
  consecutiveReadyFailures: number;
  lastCriticalAlertAt: number;
  lastReadyAlertAt: number;
}

export function emptyMonitorState(): MonitorState;
export function normalizeMonitorState(value: unknown): MonitorState;
export function nextMonitorState(
  previousValue: unknown,
  failures: { criticalFailed: boolean; readyFailed: boolean },
): MonitorState;
export function alertDue(
  state: MonitorState,
  options: {
    criticalThreshold: number;
    readyThreshold: number;
    cooldownMs: number;
    now: number;
  },
): "critical" | "ready" | null;
