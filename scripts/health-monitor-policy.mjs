const nonNegativeInteger = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
};

export const emptyMonitorState = () => ({
  version: 2,
  consecutiveCriticalFailures: 0,
  consecutiveReadyFailures: 0,
  lastCriticalAlertAt: 0,
  lastReadyAlertAt: 0,
});

export const normalizeMonitorState = value => {
  const empty = emptyMonitorState();
  if (!value || typeof value !== "object" || value.version !== 2) return empty;
  return {
    version: 2,
    consecutiveCriticalFailures: nonNegativeInteger(value.consecutiveCriticalFailures),
    consecutiveReadyFailures: nonNegativeInteger(value.consecutiveReadyFailures),
    lastCriticalAlertAt: nonNegativeInteger(value.lastCriticalAlertAt),
    lastReadyAlertAt: nonNegativeInteger(value.lastReadyAlertAt),
  };
};

export const nextMonitorState = (previousValue, { criticalFailed, readyFailed }) => {
  const previous = normalizeMonitorState(previousValue);
  return {
    ...previous,
    consecutiveCriticalFailures: criticalFailed ? previous.consecutiveCriticalFailures + 1 : 0,
    consecutiveReadyFailures: readyFailed ? previous.consecutiveReadyFailures + 1 : 0,
  };
};

const cooldownElapsed = (now, lastAlertAt, cooldownMs) => now - lastAlertAt >= cooldownMs;

export const alertDue = (state, { criticalThreshold, readyThreshold, cooldownMs, now }) => {
  if (
    state.consecutiveCriticalFailures >= criticalThreshold
    && cooldownElapsed(now, state.lastCriticalAlertAt, cooldownMs)
  ) return "critical";
  if (
    state.consecutiveReadyFailures >= readyThreshold
    && cooldownElapsed(now, state.lastReadyAlertAt, cooldownMs)
  ) return "ready";
  return null;
};
